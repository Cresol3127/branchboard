import { expect, test } from '@playwright/test';
import { providerDefinitions, providerIds } from '../../src/providers';

test('context controls persist, estimates update, and budgets block sending without losing the draft', async ({
  page,
}) => {
  const requests: { role: string; content: string }[][] = [];
  await page.addInitScript(() => {
    if (localStorage.getItem('branchboard.workspace.v1')) return;
    localStorage.setItem(
      'branchboard.workspace.v1',
      JSON.stringify({
        currentId: 'context',
        boards: [
          {
            id: 'context',
            name: 'Context controls',
            updatedAt: 0,
            viewport: { x: 0, y: 0, zoom: 1 },
            edges: [{ id: 'edge', source: 'parent', target: 'chat' }],
            nodes: [
              {
                id: 'parent',
                type: 'note',
                position: { x: 0, y: 50 },
                style: { width: 300, height: 260 },
                data: {
                  title: 'Connected note',
                  color: 'amber',
                  note: 'Leave this out',
                  messages: [],
                },
              },
              {
                id: 'extra',
                type: 'note',
                position: { x: 0, y: 400 },
                style: { width: 300, height: 260 },
                data: {
                  title: 'Reference note',
                  color: 'sage',
                  note: 'Include this reference',
                  messages: [],
                },
              },
              {
                id: 'chat',
                type: 'chat',
                position: { x: 500, y: 100 },
                style: { width: 340, height: 500 },
                data: { title: 'Question', color: 'purple', note: '', messages: [] },
              },
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
        providers: providerIds.map((id) => ({
          id,
          name: providerDefinitions[id].name,
          configured: id === 'openai',
          hasKey: id === 'openai',
          baseURL: providerDefinitions[id].baseURL,
          models: providerDefinitions[id].models,
          extraModels: [],
          defaultModel: providerDefinitions[id].models[0] || '',
        })),
      },
    }),
  );
  await page.route('**/api/providers/*/models', (route) =>
    route.fulfill({ json: { models: ['gpt-4o-mini'] } }),
  );
  await page.route('**/api/chat', (route) => {
    requests.push(route.request().postDataJSON().messages);
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"token":"Answer"}\n\ndata: {"done":true}\n\n',
    });
  });
  await page.goto('/');
  const chat = page.locator('[data-id="chat"]');
  await chat.locator('.node-type-dot').click();
  await expect(page.locator('.workspace-token-counts')).toContainText('Selected ~0');
  await chat.getByRole('button', { name: 'Inspect AI context', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'What the AI sees' });
  await dialog.getByLabel('Context for Connected note', { exact: true }).selectOption('exclude');
  await dialog.getByLabel('Context for Reference note', { exact: true }).selectOption('include');
  await expect(dialog.locator('.context-list')).toContainText('Include this reference');
  await expect(dialog.locator('.context-list')).not.toContainText('Leave this out');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await dialog.getByLabel('Estimated input budget (tokens, optional)').fill('1');
  await dialog.getByRole('button', { name: 'Save budget' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Over budget');
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('My question');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Message', exact: true }).press('Enter');
  await expect(chat.getByRole('alert')).toContainText('Nothing was sent');
  expect(requests).toHaveLength(0);
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'My question',
  );
  await expect(chat.locator('.message')).toHaveCount(0);
  await chat.getByRole('button', { name: 'Inspect AI context', exact: true }).click();
  await expect(dialog.locator('.context-list')).toContainText('unsent draft');
  await dialog.getByLabel('Estimated input budget (tokens, optional)').fill('1000');
  await dialog.getByRole('button', { name: 'Save budget' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(chat.locator('.message.assistant')).toContainText('Answer');
  expect(requests).toEqual([
    [
      { role: 'user', content: 'Context note — Reference note:\nInclude this reference' },
      { role: 'user', content: 'My question' },
    ],
  ]);
  await expect(page.locator('.workspace-token-counts')).not.toContainText('Selected ~0');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('contextTokenLimit');
  await page.reload();
  await chat.getByRole('button', { name: 'Inspect AI context', exact: true }).click();
  await expect(dialog.getByLabel('Context for Connected note', { exact: true })).toHaveValue(
    'exclude',
  );
  await expect(dialog.getByLabel('Context for Reference note', { exact: true })).toHaveValue(
    'include',
  );
  await expect(dialog.getByLabel('Estimated input budget (tokens, optional)')).toHaveValue('1000');
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await expect(dialog.getByLabel('Context for Reference note', { exact: true })).toBeVisible();
});
