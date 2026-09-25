import { expect, test, type Page } from '@playwright/test';
import { providerDefinitions, providerIds, type PublicProvider } from '../../src/providers';
import { command } from './helpers';
import { catalogProviderIds } from '../../src/modelCatalog';

const publicCatalog = (openaiModels?: string[]) => ({
  version: 1,
  providers: Object.fromEntries(
    catalogProviderIds.map((id) => [
      id,
      {
        models: id === 'openai' && openaiModels ? openaiModels : providerDefinitions[id].models,
        source: id === 'openrouter' ? 'openrouter' : 'models.dev',
        updatedAt: Date.now(),
      },
    ]),
  ),
});

async function setup(page: Page) {
  const providers: PublicProvider[] = providerIds.map((id) => ({
    id,
    name: providerDefinitions[id].name,
    baseURL: providerDefinitions[id].baseURL,
    configured: id === 'openai' || id === 'ollama',
    hasKey: id === 'openai',
    models: id === 'ollama' ? ['llama-local'] : [...providerDefinitions[id].models],
    extraModels: [],
    defaultModel: providerDefinitions[id].models[0] || '',
  }));
  const changes: Record<string, unknown>[] = [];
  const calls: { provider: string; model: string; messages: unknown[] }[] = [];
  await page.route('**/api/models/catalog*', (route) => route.fulfill({ json: publicCatalog() }));
  await page.route('**/api/config', async (route) => {
    if (route.request().method() === 'POST') {
      const patch = route.request().postDataJSON();
      changes.push(patch);
      const p = providers.find((p) => p.id === patch.provider)!;
      if (patch.apiKey !== undefined) p.hasKey = Boolean(patch.apiKey);
      if (patch.baseURL !== undefined) p.baseURL = patch.baseURL;
      if (patch.model !== undefined) p.defaultModel = patch.model;
      if (patch.models !== undefined) p.extraModels = patch.models;
      p.configured =
        p.id === 'ollama' ||
        (p.hasKey && Boolean(p.baseURL) && (p.id !== 'custom' || Boolean(p.defaultModel)));
      p.models = [
        ...new Set([...p.models, ...p.extraModels, ...(p.defaultModel ? [p.defaultModel] : [])]),
      ];
    }
    await route.fulfill({ json: { configured: true, model: 'gpt-4o-mini', providers } });
  });
  await page.route('**/api/providers/*/models', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3];
    const p = providers.find((p) => p.id === id)!;
    await route.fulfill({ json: { models: p.models } });
  });
  await page.route('**/api/chat', async (route) => {
    const request = route.request().postDataJSON();
    calls.push(request);
    await route.fulfill({
      contentType: 'text/event-stream',
      body: request.messages.some((m: { content: string }) => m.content === 'fail')
        ? 'data: {"token":"Partial response"}\n\ndata: {"error":"Provider quota exceeded"}\n\n'
        : `data: ${JSON.stringify({ token: `Reply from ${request.provider}` })}\n\ndata: {"done":true}\n\n`,
    });
  });
  await page.goto('/');
  await command(page, 'New canvas');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await expect(page.locator('.model-selector')).toContainText('gpt-4o-mini');
  return { providers, changes, calls };
}

test('opens setup for missing providers and retains independent per-node routing', async ({
  page,
}) => {
  const { calls, changes } = await setup(page);
  const first = page.locator('.react-flow__node-chat').first();
  await first.getByRole('button', { name: /^Select model:/ }).click();
  const selector = page.getByRole('dialog', { name: 'Model selector', exact: true });
  const claude = selector.getByRole('option', { name: 'claude-sonnet-4-5', exact: true });
  await expect(claude).toBeEnabled();
  await expect(claude).toHaveAttribute('title', 'Select claude-sonnet-4-5 and set up Anthropic');
  await claude.click();
  await expect(first.locator('.model-selector')).toContainText('Anthropic');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel('Provider', { exact: true })).toHaveValue('anthropic');
  await expect(settings.getByRole('button', { name: 'Remove API key' })).toHaveCount(0);
  await expect(settings.getByRole('button', { name: 'Refresh models' })).toHaveCount(0);
  await settings.getByLabel('API key', { exact: true }).fill('secret-fixture-key');
  await settings.getByLabel('Additional models (one per line)').fill('claude-user-model');
  await settings.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(settings.getByRole('status')).toContainText('Settings saved');
  expect(changes.at(-1)).toMatchObject({
    provider: 'anthropic',
    apiKey: 'secret-fixture-key',
    models: ['claude-user-model'],
  });
  await expect(settings.getByLabel('API key', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape');
  await first.getByRole('button', { name: /^Select model:/ }).click();
  await selector.getByRole('option', { name: 'claude-user-model', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello Claude');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(first.locator('.message.assistant')).toContainText('Reply from anthropic');
  expect(calls[0]).toMatchObject({ provider: 'anthropic', model: 'claude-user-model' });
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  const second = page.locator('.react-flow__node-chat').last();
  await expect(second.locator('.model-selector')).toContainText('OpenAI');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello OpenAI');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(second.locator('.message.assistant')).toContainText('Reply from openai');
  expect(calls[1]).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('claude-user-model');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'secret-fixture-key',
  );
  await page.reload();
  await expect(
    page.locator('.model-selector').filter({ hasText: 'claude-user-model' }),
  ).toHaveCount(1);
  await expect(page.locator('.model-selector').filter({ hasText: 'gpt-4o-mini' })).toHaveCount(1);
});

test('supports Ollama connection testing, custom settings, key removal and node error dots', async ({
  page,
}) => {
  const { calls, changes } = await setup(page);
  let testedURL = '';
  await page.route('**/api/providers/ollama/test', async (route) => {
    testedURL = route.request().postDataJSON().baseURL;
    await route.fulfill({ json: { connected: true, models: ['llama-local'] } });
  });
  await page.getByRole('button', { name: 'AI provider settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByLabel('Provider', { exact: true }).selectOption('ollama');
  await expect(settings.getByLabel('API key', { exact: true })).toHaveCount(0);
  await expect(settings.getByLabel('Base URL', { exact: true })).toHaveValue(
    'http://localhost:11434',
  );
  await settings.getByLabel('Base URL', { exact: true }).fill('http://localhost:11435');
  await settings.getByRole('button', { name: 'Test Connection', exact: true }).click();
  await expect(settings.getByRole('status')).toContainText('Connected to Ollama');
  expect(testedURL).toBe('http://localhost:11435');
  await settings.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(settings.getByRole('status')).toContainText('Settings saved');
  await settings.getByLabel('Provider', { exact: true }).selectOption('custom');
  await settings.getByLabel('Base URL', { exact: true }).fill('http://localhost:1234/v1');
  await settings.getByLabel('API key', { exact: true }).fill('custom-fixture-secret');
  await settings.getByLabel('Model name', { exact: true }).fill('custom-model');
  await settings.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(settings.getByRole('status')).toContainText('Settings saved');
  expect(changes.at(-1)).toMatchObject({
    provider: 'custom',
    baseURL: 'http://localhost:1234/v1',
    apiKey: 'custom-fixture-secret',
    model: 'custom-model',
  });
  await page.keyboard.press('Escape');
  const chat = page.locator('.react-flow__node-chat').first();
  await chat.getByRole('button', { name: /^Select model:/ }).click();
  await page.getByRole('option', { name: 'custom-model', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('fail');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(chat.getByRole('alert')).toContainText('Provider quota exceeded');
  await expect(chat.getByRole('img', { name: 'Generation failed', exact: true })).toBeVisible();
  await expect(chat.locator('.message.assistant')).toContainText('Partial response');
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ provider: 'custom', model: 'custom-model' });
  await page.getByRole('button', { name: 'AI provider settings', exact: true }).click();
  await settings.getByLabel('Provider', { exact: true }).selectOption('custom');
  await settings.getByRole('button', { name: 'Remove API key', exact: true }).click();
  await expect(settings.getByRole('status')).toContainText('API key removed');
  expect(changes.at(-1)).toMatchObject({ provider: 'custom', apiKey: '' });
  await page.keyboard.press('Escape');
  await chat.getByRole('button', { name: /^Select model:/ }).click();
  await page.getByRole('option', { name: 'custom-model', exact: true }).click();
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel('Provider', { exact: true })).toHaveValue('custom');
});

test('selects an exact model ID from text, preserves it through refresh, and routes only to the chosen provider', async ({
  page,
}) => {
  const { calls } = await setup(page);
  const chat = page.locator('.react-flow__node-chat').first();
  await chat.getByRole('button', { name: /^Select model:/ }).click();
  const selector = page.getByRole('dialog', { name: 'Model selector', exact: true });
  await selector.getByRole('textbox', { name: 'Search models' }).fill('private/exact-version:2026');
  await selector.getByLabel('Custom model provider').selectOption('openai');
  await selector.getByRole('button', { name: 'Use custom model', exact: true }).click();
  await expect(chat.locator('.model-selector')).toContainText('private/exact-version:2026');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Exact model please');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(chat.locator('.message.assistant')).toContainText('Reply from openai');
  expect(calls[0]).toMatchObject({ provider: 'openai', model: 'private/exact-version:2026' });
  await page.route('**/api/providers/openai/models', (route) =>
    route.fulfill({ json: { models: ['brand-new-model'] } }),
  );
  await chat.getByRole('button', { name: /^Select model:/ }).click();
  await selector.getByRole('button', { name: 'Refresh OpenAI models', exact: true }).click();
  await expect(
    selector.getByRole('option', { name: 'brand-new-model', exact: true }),
  ).toBeVisible();
  await expect(
    selector.getByRole('option', { name: 'private/exact-version:2026', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(chat.locator('.model-selector')).toContainText('private/exact-version:2026');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  const second = page.locator('.react-flow__node-chat').last();
  await second.getByRole('button', { name: /^Select model:/ }).click();
  await selector.getByRole('option', { name: 'private/exact-version:2026', exact: true }).click();
  await expect(second.locator('.model-selector')).toContainText('private/exact-version:2026');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('private/exact-version:2026');
  await page.reload();
  await expect(
    page.locator('.model-selector').filter({ hasText: 'private/exact-version:2026' }),
  ).toHaveCount(2);
});

test('automatically refreshes keyless public catalogs, keeps offline choices and leaves local installed models independent', async ({
  page,
}) => {
  await page.clock.install();
  await setup(page);
  const chat = page.locator('.react-flow__node-chat').first();
  await chat.getByRole('button', { name: /^Select model:/ }).click();
  const selector = page.getByRole('dialog', { name: 'Model selector', exact: true });
  const openai = selector.getByRole('group', { name: 'OpenAI', exact: true });
  await expect(openai).toContainText('Updated');
  let publicCalls = 0;
  let keyCalls = 0;
  let ollamaCalls = 0;
  let fail = false;
  page.on('request', (request) => {
    if (request.url().includes('/api/providers/openai/models')) keyCalls++;
  });
  await page.route('**/api/models/catalog*', (route) => {
    publicCalls++;
    return route.fulfill(
      fail
        ? { status: 502, json: { error: 'Public catalog temporarily unavailable' } }
        : { json: publicCatalog(['auto-latest-model']) },
    );
  });
  await page.route('**/api/providers/ollama/models', (route) => {
    ollamaCalls++;
    return route.fulfill({ json: { models: ['local-auto-latest'] } });
  });
  await page.clock.fastForward(15 * 60 * 1000);
  await expect(
    openai.getByRole('option', { name: 'auto-latest-model', exact: true }),
  ).toBeVisible();
  await expect.poll(() => ollamaCalls).toBe(1);
  await expect(chat.locator('.model-selector')).toContainText('gpt-4o-mini');
  expect(publicCalls).toBe(1);
  expect(keyCalls).toBe(0);
  fail = true;
  await page.clock.fastForward(16 * 60 * 1000);
  await expect(openai).toContainText('Update failed — cached / suggested list kept');
  await expect(openai).toContainText('Public model catalog is unavailable');
  await expect(
    openai.getByRole('option', { name: 'auto-latest-model', exact: true }),
  ).toBeVisible();
  await expect(selector.getByRole('group', { name: 'Ollama', exact: true })).not.toContainText(
    'Refresh failed',
  );
  const count = publicCalls;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect(publicCalls).toBe(count);
  await page.evaluate(() =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }),
  );
  await page.clock.fastForward(16 * 60 * 1000);
  expect(publicCalls).toBe(count);
  fail = false;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    window.dispatchEvent(new Event('focus'));
  });
  await expect(openai).toContainText('Updated');
  await expect(openai).not.toContainText('Update failed');
  expect(keyCalls).toBe(0);
});

test('offers new public models and manual updates before any API key is saved, retaining offline cache and exact selections', async ({
  page,
}) => {
  const providers = providerIds.map((id) => ({
    id,
    name: providerDefinitions[id].name,
    baseURL: providerDefinitions[id].baseURL,
    configured: false,
    hasKey: false,
    models: [...providerDefinitions[id].models],
    extraModels: ['custom-kept'],
    defaultModel: providerDefinitions[id].models[0] || '',
  }));
  let publicCalls = 0;
  let keyCalls = 0;
  let unavailable = false;
  page.on('request', (request) => {
    if (request.url().includes('/api/providers/')) keyCalls++;
  });
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { configured: false, model: 'gpt-4o-mini', providers } }),
  );
  await page.route('**/api/models/catalog*', (route) => {
    publicCalls++;
    return route.fulfill(
      unavailable
        ? { status: 502, json: { error: 'Offline' } }
        : { json: publicCatalog(['new-keyless-model']) },
    );
  });
  await page.goto('/');
  await command(page, 'New canvas');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  const trigger = page.locator('.model-selector');
  await trigger.click();
  const selector = page.getByRole('dialog', { name: 'Model selector', exact: true });
  await expect(
    selector.getByRole('option', { name: 'new-keyless-model', exact: true }),
  ).toBeVisible();
  await expect(
    selector.getByRole('option', { name: 'custom-kept', exact: true }).first(),
  ).toBeVisible();
  expect(publicCalls).toBe(1);
  expect(keyCalls).toBe(0);
  await selector.getByRole('option', { name: 'new-keyless-model', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel('API key', { exact: true })).toHaveValue('');
  await settings.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect.poll(() => publicCalls).toBe(2);
  await expect(settings.locator('.model-discovery-status')).toContainText('No key needed');
  await page.keyboard.press('Escape');
  await expect(trigger).toContainText('new-keyless-model');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('new-keyless-model');
  await page.reload();
  await trigger.click();
  await expect(
    selector.getByRole('option', { name: 'new-keyless-model', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  expect(publicCalls).toBe(2); // A fresh cache survives reload without another network check.
  unavailable = true;
  await selector.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(selector).toContainText('Update failed — cached / suggested list kept');
  await expect(
    selector.getByRole('option', { name: 'new-keyless-model', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  expect(keyCalls).toBe(0);
});

test('allows keyboard custom IDs on mobile and keeps provider lists usable when discovery is unsupported', async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await command(page, 'Fit canvas');
  await page.route('**/api/providers/openai/models', (route) =>
    route.fulfill({ status: 404, json: { error: 'Listing models is not supported' } }),
  );
  await page.locator('.model-selector').click();
  const selector = page.getByRole('dialog', { name: 'Model selector', exact: true });
  await selector.getByRole('button', { name: 'Refresh OpenAI models', exact: true }).click();
  await expect(selector).toContainText('Listing models is not supported');
  await selector.getByRole('textbox', { name: 'Search models' }).fill('manually-entered-id');
  // A mobile keyboard changes the visible viewport; it must not dismiss the picker.
  await page.setViewportSize({ width: 390, height: 420 });
  await expect(selector).toBeVisible();
  await expect(selector.getByRole('textbox', { name: 'Search models' })).toHaveValue(
    'manually-entered-id',
  );
  const bounds = await selector.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(8);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(412);
  await selector.getByLabel('Custom model provider').focus();
  await page.keyboard.press('ArrowDown');
  await expect(selector.getByLabel('Custom model provider')).toHaveValue('anthropic');
  await selector.getByLabel('Custom model provider').selectOption('ollama');
  await selector.getByRole('button', { name: 'Use custom model', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(selector).not.toBeVisible();
  await expect(page.locator('.model-selector')).toContainText('Ollama · manually-entered-id');
  await page.locator('.model-selector').click();
  await expect(
    selector.getByRole('option', { name: 'manually-entered-id', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.model-selector')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'AI provider settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByLabel('Provider', { exact: true }).selectOption('ollama');
  await settings.locator('.model-discovery-status').scrollIntoViewIfNeeded();
  const dialogBounds = await settings.boundingBox();
  const headingBounds = await settings
    .getByRole('heading', { name: 'Settings', exact: true })
    .boundingBox();
  expect(headingBounds!.y).toBeGreaterThanOrEqual(dialogBounds!.y + 8);
  await expect(settings.getByRole('button', { name: 'Close dialog', exact: true })).toBeVisible();
});
