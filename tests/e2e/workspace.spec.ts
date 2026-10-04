import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { command } from './helpers';
import { providerDefinitions, providerIds } from '../../src/providers';

async function portWorkspace(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('branchboard.workspace.v1')) return;
    localStorage.setItem(
      'branchboard.workspace.v1',
      JSON.stringify({
        currentId: 'ports',
        boards: [
          {
            id: 'ports',
            name: 'Ports',
            updatedAt: 0,
            viewport: { x: 0, y: 0, zoom: 1 },
            edges: [],
            nodes: ['a', 'b'].map((id, i) => ({
              id,
              type: 'note',
              position: { x: 80 + i * 500, y: 120 },
              style: { width: 300, height: 280 },
              data: { title: id, color: 'amber', messages: [], note: '' },
            })),
          },
        ],
      }),
    );
  });
  await page.goto('/');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await command(page, 'Fit canvas');
  // Await the completed fit/autosave, not a timer that can expire before node measurement.
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('branchboard.workspace.v1')!).boards[0].viewport.x,
      ),
    )
    .not.toBe(0);
}

test('suggests and connects within 20 screen pixels, rejecting duplicate and cyclic links', async ({
  page,
}) => {
  await portWorkspace(page);
  const source = page.locator('[data-id="a"] .source');
  const target = page.locator('[data-id="b"] .target');
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2 - 24, to.y + to.height / 2, { steps: 15 });
  await expect(page.locator('[data-id="b"]')).not.toHaveClass(/suggested-input/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2 - 18, to.y + to.height / 2, { steps: 15 });
  await expect(page.locator('[data-id="b"]')).toHaveClass(/suggested-input/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  const reverseFrom = (await page.locator('[data-id="b"] .source').boundingBox())!;
  const reverseTo = (await page.locator('[data-id="a"] .target').boundingBox())!;
  await page.mouse.move(
    reverseFrom.x + reverseFrom.width / 2,
    reverseFrom.y + reverseFrom.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(reverseTo.x + reverseTo.width / 2, reverseTo.y + reverseTo.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});

test('Alt-drag moves ports independently, persists them, and resets short drags', async ({
  page,
}) => {
  await portWorkspace(page);
  const source = page.locator('[data-id="a"] .source');
  const target = page.locator('[data-id="a"] .target');
  const initial = (await source.boundingBox())!;
  const input = (await target.boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
  await page.mouse.down();
  await page.mouse.move(initial.x - 80, initial.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await source.boundingBox())!.x).toBeLessThan(initial.x - 50);
  expect((await target.boundingBox())!.x).toBeCloseTo(input.x, 0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('portPositions');
  await page.reload();
  await command(page, 'Fit canvas');
  await page.waitForTimeout(450);
  await expect.poll(async () => (await source.boundingBox())!.x).toBeLessThan(initial.x - 50);
  const moved = (await source.boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width / 2 + 2, moved.y + moved.height / 2);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await source.boundingBox())!.x).toBeCloseTo(initial.x, 0);
  const reset = (await source.boundingBox())!;
  const other = (await page.locator('[data-id="b"] .target').boundingBox())!;
  await page.mouse.move(reset.x + reset.width / 2, reset.y + reset.height / 2);
  await page.mouse.down();
  await page.mouse.move(other.x + other.width / 2, other.y + other.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  const edge = page.locator('.react-flow__edge-path');
  const before = await edge.getAttribute('d');
  await page.keyboard.down('Alt');
  await page.mouse.move(reset.x + reset.width / 2, reset.y + reset.height / 2);
  await page.mouse.down();
  await page.mouse.move(reset.x - 60, reset.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(edge).not.toHaveAttribute('d', before!);
  await command(page, 'Undo');
  await expect(edge).toHaveAttribute('d', before!);
});

test('drop near an output creates a fresh branch; Shift-drag only moves', async ({ page }) => {
  await portWorkspace(page);
  const node = page.locator('.react-flow__node[data-id="b"]');
  const original = (await node.boundingBox())!;
  const drag = async () => {
    const output = (await page.locator('[data-id="a"] .source').boundingBox())!;
    const heading = (await node.locator('.node-bottom-actions').boundingBox())!;
    await page.mouse.move(heading.x + 5, heading.y + 12);
    await page.mouse.down();
    await page.mouse.move(output.x + output.width / 2 + 15, output.y + output.height / 2, {
      steps: 20,
    });
    await page.mouse.up();
  };
  await drag();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  expect((await node.boundingBox())!.x).toBeCloseTo(original.x, 0);
  await command(page, 'Undo');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.keyboard.down('Shift');
  await drag();
  await page.keyboard.up('Shift');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  expect((await node.boundingBox())!.x).toBeLessThan(original.x - 100);
});

test('canvas loads, pans, zooms and exposes working navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');
  await command(page, 'Zoom out');
  await expect(viewport).not.toHaveAttribute('style', before!);
  const canvas = await page.locator('.canvas-area').boundingBox();
  const start = await viewport.getAttribute('style');
  await page.mouse.move(canvas!.x + 70, canvas!.y + 200);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(canvas!.x + 160, canvas!.y + 260, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await expect(viewport).not.toHaveAttribute('style', start!);
  await command(page, 'Fit canvas');
  await expect(page.locator('.sidebar, .topbar, .canvas-toolbar, .app-footer')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await page
    .getByRole('combobox', { name: 'Search commands and nodes' })
    .fill('possibility-no-match');
  await expect(page.getByText('No matching commands or nodes.')).toBeVisible();
  await page.keyboard.press('Escape');
  await command(page, 'Keyboard shortcuts & help');
  await expect(page.getByRole('region', { name: 'Help', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.docked-panel')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('creates, connects, multi-selects, duplicates, deletes and undoes nodes without containers', async ({
  page,
}) => {
  await page.goto('/');
  await command(page, 'New canvas');
  await page.getByRole('button', { name: 'Add conversation' }).click();
  const chat = page.locator('.react-flow__node-chat').first();
  await expect(chat.getByRole('textbox', { name: 'Node title' })).toHaveCount(0);
  await command(page, 'New note');
  const note = page.locator('.react-flow__node-note').first();
  await note.getByRole('textbox', { name: 'Note content' }).fill('Keep this important context.');
  await command(page, 'Auto-arrange nodes');
  await page.waitForTimeout(450);
  const source = await chat.locator('.react-flow__handle-right').boundingBox(),
    target = await note.locator('.react-flow__handle-left').boundingBox();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, {
    steps: 20,
  });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await chat.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  await note
    .locator('.node-bottom-actions')
    .click({ position: { x: 5, y: 12 }, modifiers: ['Shift'] });
  await expect(page.locator('.react-flow__node-group')).toHaveCount(0);
  await command(page, 'Duplicate selection');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await command(page, 'Delete selection');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await command(page, 'Undo');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await command(page, 'Redo');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page
    .locator('.react-flow__node-note .node-bottom-actions')
    .click({ position: { x: 5, y: 12 } });
  await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveValue(
    'Keep this important context.',
  );
});

test('streams conversations, branches context and persists history without storing credentials', async ({
  page,
}) => {
  // Deterministic test fixtures only. The production app always calls the real local API.
  let configured = false;
  const histories: { role: string; content: string }[][] = [];
  await page.route('**/api/config', async (route) => {
    if (route.request().method() === 'POST') configured = true;
    await route.fulfill({
      json: {
        configured,
        model: 'gpt-4o-mini',
        providers: providerIds.map((id) => ({
          id,
          name: providerDefinitions[id].name,
          configured: configured && id === 'openai',
          hasKey: configured && id === 'openai',
          baseURL: providerDefinitions[id].baseURL,
          models: providerDefinitions[id].models,
          extraModels: [],
          defaultModel: providerDefinitions[id].models[0] || '',
        })),
      },
    });
  });
  await page.route('**/api/providers/*/models', (route) =>
    route.fulfill({ json: { models: ['gpt-4o-mini', 'gpt-4o'] } }),
  );
  await page.route('**/api/chat', async (route) => {
    histories.push(route.request().postDataJSON().messages);
    await route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"token":"A thoughtful "}\n\ndata: {"token":"response."}\n\ndata: {"done":true}\n\n',
    });
  });
  await page.goto('/');
  const chat = page.locator('.react-flow__node-chat').first();
  await chat.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Where should we start?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('region', { name: 'Models', exact: true })).toBeVisible();
  await page.getByLabel('API key', { exact: true }).fill('sk-test-secret');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Settings saved.' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to canvas' }).click();
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(chat.locator('.markdown').last()).toHaveText('A thoughtful response.');
  await chat.locator('.node-bottom-actions').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Branch conversation' }).click();
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(2);
  const child = page.locator('.react-flow__node-chat').last();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Try a different angle.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(child.locator('.markdown').last()).toHaveText('A thoughtful response.');
  expect(histories[1]).toEqual([
    { role: 'user', content: expect.stringContaining('Context note — A little context:') },
    { role: 'user', content: 'Where should we start?' },
    { role: 'assistant', content: 'A thoughtful response.' },
    { role: 'user', content: 'Try a different angle.' },
  ]);
  await expect(page.getByRole('button', { name: 'Inspect AI context' })).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('Try a different angle.');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('sk-test-secret');
  await page.reload();
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(2);
  await expect(page.locator('.message.assistant')).toHaveCount(2);
});

test('exports and imports a portable board backup', async ({ page }) => {
  await page.goto('/');
  const downloadPromise = page.waitForEvent('download');
  await command(page, 'Export board backup (JSON)');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('My first canvas.json');
  const path = await download.path();
  await page.locator('input[type=file]').setInputFiles(path!);
  await expect(page.getByRole('status').filter({ hasText: 'Board imported.' })).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await page.getByRole('textbox', { name: 'Canvas name' }).fill('Imported thoughts');
  await page.getByRole('textbox', { name: 'Canvas name' }).blur();
  await expect(page.getByRole('textbox', { name: 'Canvas name' })).toHaveValue('Imported thoughts');
  await page.keyboard.press('Control+k');
  await expect(
    page.getByRole('option', { name: 'Switch canvas: Imported thoughts', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('option', { name: 'Switch canvas: My first canvas', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Canvas name' })).toHaveValue('My first canvas');
  await command(page, 'Switch canvas: Imported thoughts');
  await expect(page.getByRole('textbox', { name: 'Canvas name' })).toHaveValue('Imported thoughts');
});

test('remains usable at a compact viewport', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add conversation' })).toBeVisible();
  await command(page, 'Settings');
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
  const box = await page.getByRole('region', { name: 'Settings', exact: true }).boundingBox();
  expect(box!.x).toBeGreaterThan(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(800);
});
