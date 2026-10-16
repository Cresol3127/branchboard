import { expect, test, type Page } from '@playwright/test';
import { providerDefinitions, providerIds, type PublicProvider } from '../../src/providers';
import { command } from './helpers';
import { catalogProviderIds } from '../../src/modelCatalog';

const publicCatalog = (openaiModels?: string[]) => ({
  version: 2,
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
  await expect(page.locator('.react-flow__node-chat .model-selector')).toContainText('gpt-4o-mini');
  return { providers, changes, calls };
}

test('lists only connected providers, remembers selections and retains independent per-node routing', async ({
  page,
}) => {
  const { calls, changes } = await setup(page);
  const first = page.locator('.react-flow__node-chat').first();
  await first.getByRole('button', { name: /^Select model:/ }).click();
  const selector = page.getByRole('dialog', { name: 'Model selector', exact: true });
  await expect(selector.getByRole('group', { name: 'Anthropic', exact: true })).toHaveCount(0);
  await expect(
    selector.getByRole('option', { name: 'claude-sonnet-4-5 · Anthropic', exact: true }),
  ).toHaveCount(0);
  await selector.getByRole('button', { name: 'Manage providers', exact: true }).click();
  const settings = page.getByRole('region', { name: 'Models', exact: true });
  await expect(settings).toBeVisible();
  await settings.getByLabel('Provider', { exact: true }).selectOption('anthropic');
  await expect(settings.getByRole('button', { name: 'Remove API key' })).toHaveCount(0);
  await expect(settings.getByRole('button', { name: 'Refresh models' })).toHaveCount(0);
  await settings.getByLabel('API key', { exact: true }).fill('secret-fixture-key');
  await settings.getByText('Models & advanced options', { exact: true }).click();
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
  await selector
    .getByRole('option', { name: 'claude-user-model · Anthropic', exact: true })
    .click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello Claude');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(first.locator('.message.assistant')).toContainText('Reply from anthropic');
  expect(calls[0]).toMatchObject({ provider: 'anthropic', model: 'claude-user-model' });
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  const second = page.locator('.react-flow__node-chat').last();
  await expect(second.locator('.model-selector')).toContainText('claude-user-model');
  await second.getByRole('button', { name: /^Select model:/ }).click();
  await selector.getByRole('option', { name: 'gpt-4o-mini · OpenAI', exact: true }).click();
  await expect(second.locator('.model-selector')).toHaveAttribute('aria-label', /OpenAI/);
  await expect(second.locator('.model-selector .provider-icon')).toHaveCount(1);
  await expect(selector.getByRole('group', { name: 'OpenAI', exact: true })).toHaveCount(0);
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
    page.locator('.react-flow__node-chat .model-selector').filter({ hasText: 'claude-user-model' }),
  ).toHaveCount(1);
  await expect(
    page.locator('.react-flow__node-chat .model-selector').filter({ hasText: 'gpt-4o-mini' }),
  ).toHaveCount(1);
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
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  const settings = page.getByRole('region', { name: 'Models', exact: true });
  await settings.getByLabel('Provider', { exact: true }).selectOption('ollama');
  await settings.getByText('Models & advanced options', { exact: true }).click();
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
  await settings.getByRole('button', { name: /^Model name:/ }).click();
  await page.getByRole('button', { name: 'Add model by ID…', exact: true }).click();
  await page.getByLabel('Exact model ID', { exact: true }).fill('custom-model');
  await page.getByRole('button', { name: 'Use custom model', exact: true }).click();
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
  await page.getByRole('option', { name: 'custom-model · Custom endpoint', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('fail');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(chat.getByRole('alert')).toContainText('Provider quota exceeded');
  await expect(chat.locator('.message.assistant')).toContainText('Partial response');
  await chat.getByRole('button', { name: 'Collapse node', exact: true }).click();
  await expect(chat.getByRole('img', { name: 'Generation failed', exact: true })).toBeVisible();
  await chat.getByRole('button', { name: 'Expand node', exact: true }).click();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ provider: 'custom', model: 'custom-model' });
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await settings.getByLabel('Provider', { exact: true }).selectOption('custom');
  await settings.getByRole('button', { name: 'Remove API key', exact: true }).click();
  await expect(settings.getByRole('status')).toContainText('API key removed');
  expect(changes.at(-1)).toMatchObject({ provider: 'custom', apiKey: '' });
  await page.keyboard.press('Escape');
  await chat.getByRole('button', { name: /^Select model:/ }).click();
  await expect(
    page.getByRole('option', { name: 'custom-model · Custom endpoint', exact: true }),
  ).toHaveCount(0);
  await expect(chat.locator('.model-selector')).toContainText('custom-model');
  await page.getByRole('button', { name: 'Manage providers', exact: true }).click();
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
  await selector
    .getByRole('combobox', { name: 'Search models' })
    .fill('private/exact-version:2026');
  await selector.getByRole('button', { name: 'Add model by ID…', exact: true }).click();
  await selector.getByLabel('Custom model provider').selectOption('openai');
  await selector.getByRole('button', { name: 'Use custom model', exact: true }).click();
  await expect(chat.locator('.model-selector')).toContainText('private/exact-version:2026');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Exact model please');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(chat.locator('.message.assistant')).toContainText('Reply from openai');
  expect(calls[0]).toMatchObject({ provider: 'openai', model: 'private/exact-version:2026' });
  await page.route('**/api/models/catalog*', (route) =>
    route.fulfill({ json: publicCatalog(['brand-new-model']) }),
  );
  await chat.getByRole('button', { name: /^Select model:/ }).click();
  await selector.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(
    selector.getByRole('option', { name: 'brand-new-model · OpenAI', exact: true }),
  ).toBeVisible();
  await expect(
    selector.getByRole('option', { name: 'private/exact-version:2026 · OpenAI', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(chat.locator('.model-selector')).toContainText('private/exact-version:2026');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  const second = page.locator('.react-flow__node-chat').last();
  await second.getByRole('button', { name: /^Select model:/ }).click();
  await selector
    .getByRole('option', { name: 'private/exact-version:2026 · OpenAI', exact: true })
    .click();
  await expect(second.locator('.model-selector')).toContainText('private/exact-version:2026');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('private/exact-version:2026');
  await page.reload();
  await expect(
    page
      .locator('.react-flow__node-chat .model-selector')
      .filter({ hasText: 'private/exact-version:2026' }),
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
  const openai = selector;
  await expect(
    openai.getByRole('option', { name: 'gpt-4o-mini · OpenAI', exact: true }),
  ).toBeVisible();
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
    openai.getByRole('option', { name: 'auto-latest-model · OpenAI', exact: true }),
  ).toBeVisible();
  await expect.poll(() => ollamaCalls).toBe(1);
  await expect(chat.locator('.model-selector')).toContainText('gpt-4o-mini');
  expect(publicCalls).toBe(1);
  expect(keyCalls).toBe(0);
  fail = true;
  await page.clock.fastForward(16 * 60 * 1000);
  await expect(selector).toContainText('Public model catalog is unavailable');
  await expect(
    openai.getByRole('option', { name: 'auto-latest-model · OpenAI', exact: true }),
  ).toBeVisible();
  await expect(
    selector.getByRole('option', { name: 'local-auto-latest · Ollama', exact: true }),
  ).toBeVisible();
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
  await expect(selector).not.toContainText('Public model catalog is unavailable');
  expect(keyCalls).toBe(0);
});

test('updates public catalogs before keys, shows no unconfigured choices, and restores selected models and history offline', async ({
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
  await page.route('**/api/config', (route) => {
    if (route.request().method() === 'POST') {
      const p = providers.find((item) => item.id === route.request().postDataJSON().provider)!;
      p.configured = true;
      p.hasKey = true;
    }
    return route.fulfill({
      json: { configured: providers.some((p) => p.configured), model: 'gpt-4o-mini', providers },
    });
  });
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
  const trigger = page.locator('.react-flow__node-chat .model-selector');
  await trigger.click();
  const selector = page.getByRole('dialog', { name: 'Model selector', exact: true });
  await expect(selector.getByRole('option')).toHaveCount(0);
  await expect(selector).toContainText('Connect a provider in Settings');
  expect(publicCalls).toBe(1);
  expect(keyCalls).toBe(0);
  await selector.getByRole('button', { name: 'Manage providers', exact: true }).click();
  const settings = page.getByRole('region', { name: 'Models', exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel('API key', { exact: true })).toHaveValue('');
  await settings.getByText('Models & advanced options', { exact: true }).click();
  await settings.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect.poll(() => publicCalls).toBe(2);
  await expect(settings.locator('.model-discovery-status')).toContainText('No key needed');
  await settings.getByLabel('API key', { exact: true }).fill('fixture-only-key');
  await settings.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(settings.getByRole('status')).toContainText('Settings saved');
  await page.keyboard.press('Escape');
  await trigger.click();
  await selector.getByRole('option', { name: 'new-keyless-model · OpenAI', exact: true }).click();
  await expect(trigger).toContainText('new-keyless-model');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('new-keyless-model');
  await page.reload();
  await trigger.click();
  await expect(selector.locator('.model-section-label').first()).toHaveText(
    'Recent · saved choices',
  );
  await expect(
    selector.getByRole('option', { name: 'new-keyless-model · OpenAI', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  expect(publicCalls).toBe(2); // A fresh cache survives reload without another network check.
  unavailable = true;
  await selector.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(selector).toContainText('Public model catalog is unavailable');
  await expect(
    selector.getByRole('option', { name: 'new-keyless-model · OpenAI', exact: true }),
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
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  const settings = page.getByRole('region', { name: 'Models', exact: true });
  await settings.getByText('Models & advanced options', { exact: true }).click();
  await settings.getByRole('button', { name: 'Fetch from saved API key', exact: true }).click();
  await expect(settings.getByRole('alert')).toContainText('Listing models is not supported');
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node-chat .model-selector').click();
  const selector = page.getByRole('dialog', { name: 'Model selector', exact: true });
  await selector.getByRole('combobox', { name: 'Search models' }).fill('manually-entered-id');
  // A mobile keyboard changes the visible viewport; it must not dismiss the picker.
  await page.setViewportSize({ width: 390, height: 420 });
  await expect(selector).toBeVisible();
  await expect(selector.getByRole('combobox', { name: 'Search models' })).toHaveValue(
    'manually-entered-id',
  );
  const bounds = await selector.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(8);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(412);
  await selector.getByRole('button', { name: 'Add model by ID…', exact: true }).click();
  await selector.getByLabel('Custom model provider').focus();
  await page.keyboard.press('ArrowDown');
  await expect(selector.getByLabel('Custom model provider')).toHaveValue('ollama');
  await selector.getByLabel('Custom model provider').selectOption('ollama');
  await selector.getByRole('button', { name: 'Use custom model', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(selector).not.toBeVisible();
  await expect(page.locator('.react-flow__node-chat .model-selector')).toContainText(
    'manually-entered-id',
  );
  await page.keyboard.press('Enter');
  await expect(
    selector.getByRole('option', { name: 'manually-entered-id · Ollama', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.react-flow__node-chat .model-selector')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await settings.getByLabel('Provider', { exact: true }).selectOption('ollama');
  await settings.getByText('Models & advanced options', { exact: true }).click();
  await settings.locator('.model-discovery-status').scrollIntoViewIfNeeded();
  const dialogBounds = await settings.boundingBox();
  const headingBounds = await settings
    .getByRole('heading', { name: 'Models', exact: true })
    .boundingBox();
  expect(headingBounds!.y).toBeGreaterThanOrEqual(dialogBounds!.y + 8);
  await expect(settings.getByRole('button', { name: 'Back to canvas', exact: true })).toBeVisible();
});
