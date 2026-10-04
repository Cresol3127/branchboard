import { expect, test, type Page } from '@playwright/test';
import { command } from './helpers';

async function upload(page: Page, value: unknown) {
  await page.getByLabel('Conversation JSON file').setInputFiles({
    name: 'conversations.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
}
const archive = [
  {
    title: 'Imported planning',
    messages: [
      { role: 'system', content: 'Use plain language' },
      { role: 'user', content: 'My imported question' },
      { role: 'assistant', content: '**A saved answer**' },
    ],
  },
  { name: 'Claude research', chat_messages: [{ sender: 'human', text: 'My research question' }] },
];

test('previews and selects conversations, imports independent canvases, persists and makes history usable', async ({
  page,
}) => {
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/chat')) requests++;
  });
  await page.goto('/');
  await command(page, 'Import conversations');
  const dialog = page.getByRole('region', { name: 'Import conversations', exact: true });
  await upload(page, archive);
  await expect(dialog.getByRole('status')).toContainText('2 conversations found');
  await dialog.getByRole('checkbox', { name: /Claude research/ }).uncheck();
  await dialog.getByRole('button', { name: 'Import 1 conversation', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Canvas name', exact: true })).toHaveValue(
    'Imported planning',
  );
  await expect(
    page.getByRole('navigation', { name: 'Boards' }).locator('.board-link:not(.new-board)'),
  ).toHaveCount(2);
  await expect(page.locator('.messages')).toContainText('A saved answer');
  await expect(page.locator('.messages')).toContainText('Use plain language');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('My imported question');
  await page.reload();
  await expect(page.locator('.messages')).toContainText('My imported question');
  await page.getByRole('button', { name: 'Branch from this message' }).nth(1).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await command(page, 'Import conversations');
  await upload(page, archive[0]);
  await page.getByRole('button', { name: 'Import 1 conversation', exact: true }).click();
  const unique = await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('branchboard.workspace.v1')!);
    const ids = value.boards.flatMap((b: { nodes: { id: string }[] }) => b.nodes.map((n) => n.id));
    return new Set(ids).size === ids.length;
  });
  expect(unique).toBe(true);
  expect(requests).toBe(0);
});

test('failed imports and cancellation leave work untouched, including mixed valid/invalid archives', async ({
  page,
}) => {
  await page.goto('/');
  await command(page, 'Import conversations');
  const dialog = page.getByRole('region', { name: 'Import conversations', exact: true });
  await page.getByLabel('Conversation JSON file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await upload(page, [archive[0], { messages: [{ role: 'tool', content: 'Unsupported' }] }]);
  await expect(dialog.getByRole('alert')).toContainText('Conversation 2');
  await expect(dialog.getByRole('button', { name: /^Import .*conversations$/ })).toBeDisabled();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await upload(page, archive);
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.getByRole('textbox', { name: 'Canvas name', exact: true })).toHaveValue(
    'My first canvas',
  );
});

test('ChatGPT active path warning is shown before importing saved turns', async ({ page }) => {
  await page.goto('/');
  await command(page, 'Import conversations');
  await upload(page, {
    title: 'Active path',
    current_node: 'a',
    mapping: {
      root: { parent: null, message: null },
      a: {
        parent: 'root',
        message: {
          author: { role: 'user' },
          content: { content_type: 'text', parts: ['Selected turn'] },
        },
      },
      b: {
        parent: 'root',
        message: {
          author: { role: 'user' },
          content: { content_type: 'text', parts: ['Alternate turn'] },
        },
      },
    },
  });
  await expect(page.locator('.import-warning')).toContainText('alternate branches are excluded');
  await page.getByRole('button', { name: 'Import 1 conversation', exact: true }).click();
  await expect(page.locator('.messages')).toContainText('Selected turn');
  await expect(page.locator('.messages')).not.toContainText('Alternate turn');
});

test('conversation imports cannot switch the workspace during generation', async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        configured: true,
        model: 'test-model',
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            configured: true,
            hasKey: true,
            baseURL: 'https://api.openai.com/v1',
            models: ['test-model'],
            extraModels: [],
            defaultModel: 'test-model',
          },
        ],
      },
    }),
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/chat', async (route) => {
    await held;
    await route.abort();
  });
  try {
    await page.goto('/');
    await command(page, 'New canvas');
    await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
    await page
      .locator('.react-flow__node-chat .node-bottom-actions')
      .click({ position: { x: 5, y: 12 } });
    await page.getByRole('textbox', { name: 'Message' }).fill('Start generation');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await command(page, 'Import conversations');
    await upload(page, archive[0]);
    const dialog = page.getByRole('region', { name: 'Import conversations', exact: true });
    await expect(
      dialog.getByRole('button', { name: 'Import 1 conversation', exact: true }),
    ).toBeDisabled();
    await expect(dialog).toContainText('Stop generation before importing.');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page
      .locator('.react-flow__node-chat .node-bottom-actions')
      .click({ position: { x: 5, y: 12 } });
    await page.getByRole('button', { name: 'Stop generating', exact: true }).click();
    await command(page, 'Import conversations');
    await upload(page, archive[0]);
    await expect(
      dialog.getByRole('button', { name: 'Import 1 conversation', exact: true }),
    ).toBeEnabled();
  } finally {
    release();
  }
});
