import { expect, test, type Page } from '@playwright/test';
import { command } from './helpers';

async function historyWorkspace(page: Page, long = false) {
  await page.addInitScript(
    ({ long }) => {
      if (localStorage.getItem('branchboard.workspace.v1')) return;
      const messages = [
        { id: 'question', role: 'user', content: 'Original question about orchids.' },
        { id: 'answer', role: 'assistant', content: '**Original** answer.' },
        ...(long
          ? Array.from({ length: 25 }, (_, i) => ({
              id: `turn-${i}`,
              role: 'user',
              content: `Long history entry ${i}. ${'Details to scroll past. '.repeat(20)}`,
            }))
          : []),
        ...(long
          ? [
              {
                id: 'deep',
                role: 'assistant',
                content: 'Hidden needle deep in conversation history.',
              },
            ]
          : []),
      ];
      const chat = {
        id: 'chat',
        type: 'chat',
        position: { x: 80, y: 120 },
        style: { width: 400, height: long ? 50 : 540 },
        data: {
          title: 'Research conversation',
          color: 'purple',
          note: '',
          messages,
          collapsed: long,
          expandedHeight: 540,
        },
      };
      localStorage.setItem(
        'branchboard.workspace.v1',
        JSON.stringify({
          currentId: long ? 'other' : 'history',
          boards: [
            {
              id: 'history',
              name: 'History board',
              updatedAt: 0,
              nodes: [chat],
              edges: [],
              viewport: { x: 40, y: 20, zoom: 1 },
            },
            {
              id: 'other',
              name: 'Notes board',
              updatedAt: 0,
              edges: [],
              nodes: [
                {
                  id: 'note',
                  type: 'note',
                  position: { x: 80, y: 120 },
                  style: { width: 340, height: 260 },
                  data: {
                    title: 'Plant notes',
                    note: 'ORCHIDS need careful watering.',
                    color: 'amber',
                    messages: [],
                  },
                },
              ],
            },
          ],
        }),
      );
    },
    { long },
  );
  await page.goto('/');
}

test('edits saved turns, cancels safely, supports undo and persists without AI requests', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/api/chat', (route) => {
    requests++;
    return route.abort();
  });
  await historyWorkspace(page);
  const question = page.locator('[data-message-id="question"]');
  await question.getByRole('button', { name: 'Edit message', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Edit message', exact: true });
  await expect(dialog).toContainText('Later messages are kept');
  await dialog.getByRole('textbox').fill('Uncommitted change');
  await page.keyboard.press('Escape');
  await expect(question).toContainText('Original question');
  await question.getByRole('button', { name: 'Edit message', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit message', exact: true });
  await dialog.getByRole('textbox').fill('   ');
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await dialog.getByRole('textbox').fill('Edited **orchids** question.');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(question.locator('.markdown strong')).toHaveText('orchids');
  await expect(page.locator('[data-message-id="answer"]')).toContainText('Original answer.');
  // Searching the current board must not clear the edit's undo snapshot.
  await command(page, 'Search saved content');
  const search = page.getByRole('dialog', { name: 'Search saved content', exact: true });
  await search.getByRole('searchbox').fill('Edited **orchids**');
  await search.locator('.history-search-results button').click();
  await expect(question).toBeFocused();
  await command(page, 'Undo');
  await expect(question).toContainText('Original question');
  await command(page, 'Redo');
  await expect(question).toContainText('Edited orchids question.');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('Edited **orchids**');
  await page.reload();
  await expect(question).toContainText('Edited orchids question.');
  expect(requests).toBe(0);
});

test('confirms individual deletions, preserves other turns and restores through undo', async ({
  page,
}) => {
  await historyWorkspace(page);
  const question = page.locator('[data-message-id="question"]');
  await question.getByRole('button', { name: 'Delete message', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Delete message', exact: true });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Delete message', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Delete message', exact: true });
  await dialog.getByRole('button', { name: 'Delete message', exact: true }).click();
  await expect(question).toHaveCount(0);
  await expect(page.locator('[data-message-id="answer"]')).toContainText('Original answer.');
  await command(page, 'Undo');
  await expect(question).toBeVisible();
  await command(page, 'Redo');
  await expect(question).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .not.toContain('Original question');
  await page.reload();
  await expect(question).toHaveCount(0);
});

test('searches across boards and opens a collapsed conversation at the matching deep message', async ({
  page,
}) => {
  await historyWorkspace(page, true);
  await command(page, 'Search saved content');
  const dialog = page.getByRole('dialog', { name: 'Search saved content', exact: true });
  const input = dialog.getByRole('searchbox');
  await input.fill('impossible phrase');
  await expect(dialog.getByRole('status')).toHaveText('No matching saved content.');
  await input.fill('HIDDEN NEEDLE');
  await expect(dialog.getByRole('status')).toHaveText('1 match.');
  await expect(dialog.locator('.history-search-results')).toContainText(
    'History board · assistant',
  );
  await input.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Canvas name' })).toHaveValue('History board');
  const message = page.locator('[data-message-id="deep"]');
  await expect(message).toBeFocused();
  await expect(message).toBeInViewport();
  await expect(message).toHaveClass(/search-match/);
  expect(
    await page.locator('.react-flow__node-chat .messages').evaluate((el) => el.scrollTop),
  ).toBeGreaterThan(500);
  await command(page, 'Search saved content');
  await dialog.getByRole('searchbox').fill('careful watering');
  await dialog.locator('.history-search-results button').click();
  await expect(page.getByRole('textbox', { name: 'Canvas name' })).toHaveValue('Notes board');
  await expect(page.getByRole('textbox', { name: 'Note content', exact: true })).toHaveValue(
    'ORCHIDS need careful watering.',
  );
});

test('history controls and search dialogs fit a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await historyWorkspace(page);
  await command(page, 'Fit canvas');
  await page
    .locator('[data-message-id="answer"]')
    .getByRole('button', { name: 'Edit message', exact: true })
    .click();
  let dialog = page.getByRole('dialog', { name: 'Edit message', exact: true });
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('textbox').fill('Mobile edit');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await command(page, 'Search saved content');
  dialog = page.getByRole('dialog', { name: 'Search saved content', exact: true });
  await dialog.getByRole('searchbox').fill('Mobile edit');
  await expect(dialog.locator('.history-search-results button')).toContainText('Mobile edit');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('history controls cannot mutate turns during an active generation and unlock after stop', async ({
  page,
}) => {
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
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/chat', async (route) => {
    await held;
    await route.abort();
  });
  try {
    await historyWorkspace(page);
    const chat = page.locator('.react-flow__node-chat');
    await chat.locator('.node-heading').click();
    await page
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Continue the discussion');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const question = page.locator('[data-message-id="question"]');
    await expect(
      question.getByRole('button', { name: 'Edit message', exact: true }),
    ).toBeDisabled();
    await expect(
      question.getByRole('button', { name: 'Delete message', exact: true }),
    ).toBeDisabled();
    await expect(question.getByRole('button', { name: 'Branch from this message' })).toBeDisabled();
    await page.getByRole('button', { name: 'Stop generating', exact: true }).click();
    await expect(question.getByRole('button', { name: 'Edit message', exact: true })).toBeEnabled();
    await expect(question).toContainText('Original question');
  } finally {
    release();
  }
});
