import { expect, test } from '@playwright/test';
import { providerDefinitions, providerIds } from '../../src/providers';

test('legacy context overrides remain effective and a removed legacy limit can be reset without losing the draft', async ({
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
                selected: true,
                data: {
                  title: 'Question',
                  color: 'purple',
                  note: '',
                  messages: [],
                  contextInclude: ['extra'],
                  contextExclude: ['parent'],
                  contextTokenLimit: 1,
                },
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
  await page
    .getByRole('combobox', { name: 'Message destination', exact: true })
    .selectOption('chat');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: /Inspect AI context|Review message context/ }),
  ).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('My question');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Message', exact: true }).press('Enter');
  expect(requests).toHaveLength(0);
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'My question',
  );
  await expect(chat.locator('.message')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove old input limit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'My question',
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(chat.locator('.message.assistant')).toContainText('Answer');
  expect(requests).toEqual([
    [
      { role: 'user', content: 'Context note — Reference note:\nInclude this reference' },
      { role: 'user', content: 'My question' },
    ],
  ]);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('My question');
  await page.reload();
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('branchboard.workspace.v1')!).boards[0].nodes.find(
        (n: { id: string }) => n.id === 'chat',
      ).data,
  );
  expect(saved.contextInclude).toEqual(['extra']);
  expect(saved.contextExclude).toEqual(['parent']);
  expect(saved.contextTokenLimit).toBeUndefined();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  const bounds = (await page.getByRole('region', { name: 'Models', exact: true }).boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await expect(page.getByLabel('API key', { exact: true })).toBeVisible();
});
