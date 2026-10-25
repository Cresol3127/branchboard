import { expect, test, type Page } from '@playwright/test';
import { command } from './helpers';

async function setup(page: Page) {
  const calls: {
    provider: string;
    model: string;
    messages: { role: string; content: string }[];
  }[] = [];
  await page.addInitScript(() => {
    if (localStorage.getItem('branchboard.workspace.v1')) return;
    const messages = {
      root: [
        { id: 'root-question', role: 'user', content: 'Shared root question' },
        { id: 'root-answer', role: 'assistant', content: 'Shared root answer' },
      ],
      alpha: [
        { id: 'alpha-question', role: 'user', content: 'Alpha question' },
        { id: 'alpha-answer', role: 'assistant', content: 'Alpha answer' },
      ],
      beta: [{ id: 'beta-question', role: 'user', content: 'Beta question' }],
    };
    const node = (id: keyof typeof messages, title: string, x: number, y: number) => ({
      id,
      type: 'chat',
      position: { x, y },
      style: { width: 340, height: 380 },
      data: {
        title,
        color: id === 'beta' ? 'sky' : 'purple',
        note: '',
        messages: messages[id],
        provider: 'openai',
        model: 'gpt-4o-mini',
      },
    });
    localStorage.setItem(
      'branchboard.workspace.v1',
      JSON.stringify({
        currentId: 'merge',
        boards: [
          {
            id: 'merge',
            name: 'Merge board',
            updatedAt: 1,
            edges: [
              { id: 'root-alpha', source: 'root', target: 'alpha' },
              { id: 'root-beta', source: 'root', target: 'beta' },
            ],
            nodes: [
              node('root', 'Shared root', 0, 0),
              node('alpha', 'Alpha', 500, -180),
              node('beta', 'Beta', 500, 340),
            ],
          },
        ],
      }),
    );
  });
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        configured: true,
        model: 'gpt-4o-mini',
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            configured: true,
            hasKey: true,
            baseURL: 'https://api.openai.com/v1',
            models: ['gpt-4o-mini'],
            extraModels: [],
            defaultModel: 'gpt-4o-mini',
          },
        ],
      },
    }),
  );
  await page.route('**/api/providers/*/models', (route) =>
    route.fulfill({ json: { models: ['gpt-4o-mini'] } }),
  );
  await page.route('**/api/models/catalog*', (route) =>
    route.fulfill({
      json: {
        version: 2,
        providers: {
          openai: { models: ['gpt-4o-mini'], source: 'models.dev', updatedAt: Date.now() },
        },
      },
    }),
  );
  await page.route('**/api/chat', (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"token":"Merged answer"}\n\ndata: {"done":true}\n\n',
    });
  });
  await page.goto('/');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  return calls;
}

async function select(page: Page, id: string, alreadySelected = false) {
  await page.locator(`[data-id="${id}"] .node-bottom-actions`).click({
    position: { x: 5, y: 12 },
    ...(alreadySelected ? { modifiers: ['Shift'] } : {}),
  });
}

test('merges exactly two selected parents into one shared child with combined context', async ({
  page,
}) => {
  const calls = await setup(page);
  const toolbarMerge = page.getByRole('button', { name: 'Merge selected parents', exact: true });

  await expect(toolbarMerge).toHaveCount(0);
  await select(page, 'alpha');
  await expect(toolbarMerge).toHaveCount(0);
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('region', { name: 'Command palette' });
  await palette
    .getByRole('combobox', { name: 'Search commands and nodes' })
    .fill('Merge selected parents');
  await expect(
    palette.getByRole('option', { name: 'Merge selected parents', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');

  await select(page, 'beta', true);
  await expect(toolbarMerge).toBeVisible();
  await page
    .locator('[data-id="alpha"] .node-bottom-actions')
    .click({ button: 'right', position: { x: 5, y: 12 } });
  await expect(
    page.getByRole('menuitem', { name: 'Merge selected parents', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await command(page, 'Merge selected parents');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  await expect(toolbarMerge).toHaveCount(0);
  const child = page.locator('.react-flow__node-chat.selected');
  await expect(child).toHaveCount(1);
  const childId = await child.getAttribute('data-id');
  expect(childId).toBeTruthy();
  await expect(child.getByLabel('Merge · Alpha + Beta', { exact: true })).toBeVisible();
  await expect(page.locator('[data-id="alpha"]')).not.toHaveClass(/selected/);
  await expect(page.locator('[data-id="beta"]')).not.toHaveClass(/selected/);

  await command(page, 'Undo');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await command(page, 'Redo');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);

  const destination = page.getByLabel('Message destination', { exact: true });
  await destination.selectOption(childId!);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Compare both branches');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(child.locator('.message.assistant')).toContainText('Merged answer');

  expect(calls).toHaveLength(1);
  expect(calls[0].provider).toBe('openai');
  expect(calls[0].model).toBe('gpt-4o-mini');
  expect(calls[0].messages).toEqual([
    { role: 'user', content: 'Shared root question' },
    { role: 'assistant', content: 'Shared root answer' },
    { role: 'user', content: 'Alpha question' },
    { role: 'assistant', content: 'Alpha answer' },
    { role: 'user', content: 'Beta question' },
    { role: 'user', content: 'Compare both branches' },
  ]);
  await page.reload();
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
});
