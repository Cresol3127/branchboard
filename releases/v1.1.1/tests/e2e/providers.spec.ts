import { expect, test, type Page } from '@playwright/test';
import { providerDefinitions, providerIds, type PublicProvider } from '../../src/providers';
import { command } from './helpers';

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
  await first.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello Claude');
  await first.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(first.locator('.message.assistant')).toContainText('Reply from anthropic');
  expect(calls[0]).toMatchObject({ provider: 'anthropic', model: 'claude-user-model' });
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  const second = page.locator('.react-flow__node-chat').last();
  await expect(second.locator('.model-selector')).toContainText('OpenAI');
  await second.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello OpenAI');
  await second.getByRole('button', { name: 'Send message', exact: true }).click();
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
  await chat.getByRole('textbox', { name: 'Message', exact: true }).fill('fail');
  await chat.getByRole('button', { name: 'Send message', exact: true }).click();
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
