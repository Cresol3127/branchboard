import { expect, test, type Page } from '@playwright/test';
import { command } from './helpers';

async function setup(page: Page, configured = true) {
  const calls: {
    provider: string;
    model: string;
    messages: { role: string; content: string }[];
  }[] = [];
  await page.addInitScript(() => {
    if (localStorage.getItem('branchboard.workspace.v1')) return;
    localStorage.setItem(
      'branchboard.workspace.v1',
      JSON.stringify({
        currentId: 'one',
        boards: ['one', 'two'].map((id) => ({
          id,
          name: id === 'one' ? 'Composer board' : 'Other board',
          updatedAt: 1,
          edges: [],
          nodes:
            id === 'two'
              ? []
              : ['alpha', 'beta'].map((nodeId, index) => ({
                  id: nodeId,
                  type: 'chat',
                  position: { x: index * 450, y: 0 },
                  style: { width: 340, height: 380 },
                  data: {
                    title: nodeId === 'alpha' ? 'Alpha' : 'Beta',
                    color: 'purple',
                    note: '',
                    messages: [],
                  },
                })),
        })),
      }),
    );
  });
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        configured,
        model: 'gpt-4o-mini',
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            configured,
            hasKey: configured,
            baseURL: 'https://api.openai.com/v1',
            models: ['gpt-4o-mini'],
            extraModels: [],
            defaultModel: 'gpt-4o-mini',
          },
          {
            id: 'ollama',
            name: 'Ollama (local)',
            configured,
            hasKey: false,
            baseURL: 'http://localhost:11434',
            models: ['qwen3:8b'],
            extraModels: [],
            defaultModel: 'qwen3:8b',
          },
        ],
      },
    }),
  );
  await page.route('**/api/providers/*/models', (route) =>
    route.fulfill({
      json: { models: route.request().url().includes('/ollama/') ? ['qwen3:8b'] : ['gpt-4o-mini'] },
    }),
  );
  await page.route('**/api/models/catalog*', (route) =>
    route.fulfill({
      json: {
        version: 1,
        providers: {
          openai: {
            models: ['gpt-4o-mini', 'gpt-4.1-nano'],
            source: 'models.dev',
            updatedAt: Date.now(),
          },
        },
      },
    }),
  );
  await page.route('**/api/chat', (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"token":"Composer test reply"}\n\ndata: {"done":true}\n\n',
    });
  });
  await page.goto('/');
  await expect(page.locator('.model-selector').first()).toContainText('gpt-4o-mini');
  return calls;
}

for (const width of [1440, 390]) {
  test(`message-bar model picker updates the selected conversation and actual request at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    const calls = await setup(page);
    await page.getByLabel('Message destination', { exact: true }).selectOption('alpha');
    const bar = page.getByRole('region', { name: 'Message bar' });
    const picker = bar.getByRole('button', { name: /^Message model:/ });
    const input = bar.getByRole('textbox', { name: 'Message', exact: true });
    await input.fill('Use the model I chose here');
    await expect(picker).toBeInViewport();
    await picker.click();
    const dialog = page.getByRole('dialog', { name: 'Model selector', exact: true });
    await expect(dialog.getByRole('textbox', { name: 'Search models' })).toBeFocused();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 8);
    expect(box.y + box.height).toBeLessThanOrEqual(952);
    await page.keyboard.press('Escape');
    await expect(picker).toBeFocused();
    await picker.click();
    await dialog.getByRole('textbox', { name: 'Search models' }).fill('qwen3:8b');
    await dialog.getByRole('option', { name: 'qwen3:8b', exact: true }).click();
    await expect(picker).toContainText('Ollama (local) · qwen3:8b');
    await expect(page.locator('[data-id="alpha"] .model-selector')).toContainText('qwen3:8b');
    await expect(page.locator('[data-id="beta"] .model-selector')).toContainText('gpt-4o-mini');
    await expect(input).toHaveValue('Use the model I chose here');
    expect(calls).toHaveLength(0);
    await input.press('Enter');
    await expect(page.locator('[data-id="alpha"] .message.assistant')).toContainText(
      'Composer test reply',
    );
    expect(calls[0]).toMatchObject({ provider: 'ollama', model: 'qwen3:8b' });
    await page.reload();
    await page.getByLabel('Message destination', { exact: true }).selectOption('alpha');
    await expect(picker).toContainText('qwen3:8b');
  });
}

test('new-conversation model choice creates no empty node and sends with the chosen provider/model', async ({
  page,
}) => {
  const calls = await setup(page);
  const destination = page.getByLabel('Message destination', { exact: true });
  const picker = page.getByRole('button', { name: /^Message model:/ });
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('New chat, chosen model');
  await picker.click();
  await page
    .getByRole('dialog', { name: 'Model selector', exact: true })
    .getByRole('option', { name: 'qwen3:8b', exact: true })
    .click();
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(2);
  await expect(input).toHaveValue('New chat, chosen model');
  await command(page, 'Switch canvas: Other board');
  await expect(picker).toContainText('Ollama (local) · qwen3:8b');
  await command(page, 'Switch canvas: Composer board');
  await expect(picker).toContainText('qwen3:8b');
  await expect(input).toHaveValue('New chat, chosen model');
  await input.press('Enter');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(3);
  await expect(page.locator('.message.assistant')).toContainText('Composer test reply');
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ provider: 'ollama', model: 'qwen3:8b' });
  await command(page, 'Undo');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(2);
  await command(page, 'Redo');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(3);
  await destination.selectOption('');
  await expect(picker).toContainText('qwen3:8b');
});

test('mobile message model hides unconfigured choices and opens setup without losing drafts or creating a node', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await setup(page, false);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Keep this until provider setup');
  await page.getByRole('button', { name: /^Message model:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Model selector', exact: true });
  await expect(dialog.getByRole('group', { name: 'OpenAI', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Manage providers', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Models', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to canvas', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Message model:/ })).toContainText('gpt-4o-mini');
  await expect(input).toHaveValue('Keep this until provider setup');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(2);
  expect(calls).toHaveLength(0);
});

test('one unzoomed composer preserves per-node and per-board drafts and requires an explicit multi-selection destination', async ({
  page,
}) => {
  const calls = await setup(page);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  const destination = page.getByLabel('Message destination', { exact: true });
  await expect(input).toHaveCount(1);
  await expect(page.locator('.react-flow__node textarea')).toHaveCount(0);
  await input.fill('New chat draft');
  await destination.selectOption('alpha');
  await input.fill('Alpha draft');
  await input.press('Shift+Enter');
  await input.pressSequentially('Second line');
  await expect(input).toHaveValue('Alpha draft\nSecond line');
  await destination.selectOption('beta');
  await input.fill('Beta draft');
  await destination.selectOption('');
  await expect(input).toHaveValue('New chat draft');
  await command(page, 'Switch canvas: Other board');
  await input.fill('Other board draft');
  await command(page, 'Switch canvas: Composer board');
  await destination.selectOption('alpha');
  await expect(input).toHaveValue('Alpha draft\nSecond line');
  await page
    .locator('[data-id="beta"] .node-bottom-actions')
    .click({ position: { x: 5, y: 12 }, modifiers: ['Shift'] });
  await expect(destination).toHaveValue('choose');
  await expect(input).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await expect(page.locator('#composer-status')).toContainText('No broadcast');
  await destination.selectOption('beta');
  await expect(input).toHaveValue('Beta draft');
  await input.press('Enter');
  await expect(page.locator('[data-id="beta"] .message.assistant')).toContainText(
    'Composer test reply',
  );
  await expect(page.locator('[data-id="alpha"] .message')).toHaveCount(0);
  await expect(input).toHaveValue('');
  expect(calls).toHaveLength(1);
  await destination.selectOption('alpha');
  await expect(input).toHaveValue('Alpha draft\nSecond line');
  const before = await input.boundingBox();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect((await input.boundingBox())!.width).toBe(before!.width);
});

test('a new message creates one independent conversation, supports undo/redo and does not hijack IME Enter', async ({
  page,
}) => {
  const calls = await setup(page);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('New conversation message');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  expect(calls).toHaveLength(0);
  await input.press('Enter');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(3);
  await expect(page.locator('.message.assistant')).toContainText('Composer test reply');
  await expect(input).toHaveValue('');
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  expect(calls[0].messages).toEqual([{ role: 'user', content: 'New conversation message' }]);
  await command(page, 'Undo');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(2);
  await command(page, 'Redo');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(3);
  await expect(page.locator('.message.user')).toContainText('New conversation message');
});

test('unconfigured new messages keep the draft without adding empty nodes', async ({ page }) => {
  const calls = await setup(page, false);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Keep this until setup is finished');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Models', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to canvas', exact: true }).click();
  await expect(input).toHaveValue('Keep this until setup is finished');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(2);
  expect(calls).toHaveLength(0);
});

test('streaming stop follows the chosen destination across board switches and preserves the next draft on mobile', async ({
  page,
}) => {
  const calls = await setup(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/chat', async (route) => {
    await held;
    await route.abort();
  });
  const destination = page.getByLabel('Message destination', { exact: true });
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  try {
    await destination.selectOption('alpha');
    await input.fill('Start streaming');
    await input.press('Enter');
    await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Message model:/ })).toBeDisabled();
    await input.fill('Next Alpha message');
    await destination.selectOption('beta');
    await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
    await input.fill('Keep Beta draft');
    await command(page, 'Switch canvas: Other board');
    await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
    await command(page, 'Switch canvas: Composer board');
    await page.setViewportSize({ width: 390, height: 844 });
    await destination.selectOption('alpha');
    await expect(input).toHaveValue('Next Alpha message');
    await expect(input).toBeInViewport();
    await expect(
      page.getByRole('button', { name: 'Stop generating', exact: true }),
    ).toBeInViewport();
    await page.getByRole('button', { name: 'Stop generating', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled();
    await expect(input).toHaveValue('Next Alpha message');
    await expect(page.locator('[data-id="alpha"] .message.user')).toHaveText(/Start streaming/);
    await destination.selectOption('beta');
    await expect(input).toHaveValue('Keep Beta draft');
    expect(calls).toHaveLength(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    release();
  }
});
