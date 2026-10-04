import { expect, test, type Locator, type Page } from '@playwright/test';
import { command, emptyCanvasPoint } from './helpers';

async function setup(page: Page, scrolling = false) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((scrolling) => {
    if (localStorage.getItem('branchboard.workspace.v1')) return;
    localStorage.setItem(
      'branchboard.workspace.v1',
      JSON.stringify({
        currentId: 'work',
        boards: [
          {
            id: 'work',
            name: 'Interaction board',
            updatedAt: 1,
            nodes: ['alpha', 'beta', 'context'].map((id, i) => ({
              id,
              type: id === 'context' ? 'note' : 'chat',
              position: { x: i * 440, y: 0 },
              style: { width: 340, height: 380 },
              dragHandle: '.node-heading',
              data: {
                title: id,
                color: 'purple',
                note: id === 'context' ? 'Useful background' : '',
                messages:
                  id === 'alpha'
                    ? [
                        {
                          id: 'reply',
                          role: 'assistant',
                          content: scrolling
                            ? Array.from(
                                { length: 60 },
                                (_, i) => `Paragraph ${i + 1}: scroll this saved conversation.`,
                              ).join('\n\n')
                            : 'Drag this ordinary message text to move the card.\n\n[Documentation](https://example.com)',
                        },
                      ]
                    : [],
              },
            })),
            edges: [{ id: 'connection', source: 'context', target: 'alpha' }],
          },
        ],
      }),
    );
  }, scrolling);
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        configured: false,
        model: 'gpt-4o-mini',
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            configured: false,
            hasKey: false,
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
  await page.goto('/');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await page.getByRole('button', { name: 'Expand creation tools', exact: true }).click();
  await command(page, 'Fit canvas');
  await page.waitForTimeout(300);
}

const position = (node: Locator) => node.evaluate((el) => (el as HTMLElement).style.transform);
async function drag(page: Page, element: Locator, dx: number, dy: number) {
  const rect = (await element.boundingBox())!;
  const x = rect.x + Math.min(rect.width / 2, 55),
    y = rect.y + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

test('whole-card dragging respects the threshold, controls, text selection, group movement and persisted positions', async ({
  page,
}) => {
  await setup(page);
  const alpha = page.locator('[data-id="alpha"]');
  const beta = page.locator('[data-id="beta"]');
  const text = alpha.locator('.markdown p').first();
  const initial = await position(alpha);
  await drag(page, text, 2, 0);
  expect(await position(alpha)).toBe(initial);
  await drag(page, text, 55, 80);
  await expect.poll(() => position(alpha)).not.toBe(initial);
  const moved = await position(alpha);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await position(alpha)).toBe(initial);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await position(alpha)).toBe(moved);
  await alpha.getByRole('button', { name: /^Select model:/ }).click();
  await page.keyboard.press('Escape');
  expect(await position(alpha)).toBe(moved);
  await page.getByRole('button', { name: 'Text selection mode', exact: true }).click();
  const line = await text.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rect = range.getClientRects()[0];
    return { x: rect.x + 5, y: rect.y + rect.height / 2 };
  });
  await page.mouse.move(line.x, line.y);
  await page.mouse.down();
  await page.mouse.move(line.x + 80, line.y, { steps: 12 });
  await page.mouse.up();
  expect(await position(alpha)).toBe(moved);
  expect(await page.evaluate(() => window.getSelection()?.toString().length || 0)).toBeGreaterThan(
    0,
  );
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.getByRole('button', { name: 'Text selection mode', exact: true }).click();
  await alpha.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
  await beta
    .locator('.node-bottom-actions')
    .click({ position: { x: 5, y: 12 }, modifiers: ['Shift'] });
  const beforeBeta = await position(beta);
  await drag(page, text, 0, 60);
  await expect.poll(() => position(beta)).not.toBe(beforeBeta);
  const final = await position(alpha);
  await page.waitForTimeout(450);
  await page.reload();
  await expect(alpha).toBeVisible();
  expect(await position(alpha)).toBe(final);
});

test('empty-space pan, Ctrl rectangle selection, Space pan and zoom reset leave the composer anchored', async ({
  page,
}) => {
  await setup(page);
  const bar = page.locator('.message-bar');
  const original = (await bar.boundingBox())!;
  const pane = page.locator('.react-flow__pane');
  const point = await emptyCanvasPoint(page);
  const box = (await pane.boundingBox())!;
  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await page.mouse.move(box.x + point.x + 80, box.y + point.y + 60, { steps: 12 });
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute('style', before!);
  const alpha = page.locator('[data-id="alpha"]');
  const nodeBefore = await position(alpha);
  const panBefore = await viewport.getAttribute('style');
  await page.keyboard.down('Space');
  await drag(page, alpha.locator('.markdown p').first(), 40, 30);
  await page.keyboard.up('Space');
  expect(await position(alpha)).toBe(nodeBefore);
  await expect(viewport).not.toHaveAttribute('style', panBefore!);
  await command(page, 'Fit canvas');
  await page.waitForTimeout(300);
  const a = (await alpha.boundingBox())!;
  await page.keyboard.down('Control');
  await page.mouse.move(a.x - 12, a.y - 12);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width + 10, a.y + a.height + 10, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(alpha).toHaveClass(/selected/);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom', exact: true })).toHaveText('100%');
  const anchored = (await bar.boundingBox())!;
  expect(anchored.x).toBeCloseTo(original.x, 0);
  expect(anchored.y).toBeCloseTo(original.y, 0);
  expect(anchored.width).toBe(720);
});

test('saved viewports survive reload and canvas switching even when all cards are off-screen', async ({
  page,
}) => {
  await setup(page);
  const pane = page.locator('.react-flow__pane');
  const point = await emptyCanvasPoint(page);
  const box = (await pane.boundingBox())!;
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await page.mouse.move(-1800, -1800, { steps: 12 });
  await page.mouse.up();
  const viewport = page.locator('.react-flow__viewport');
  const saved = await viewport.getAttribute('style');
  await page.waitForTimeout(450);
  await page.reload();
  await expect(viewport).toHaveAttribute('style', saved!);
  await command(page, 'New canvas');
  await command(page, 'Switch canvas: Interaction board');
  await expect(viewport).toHaveAttribute('style', saved!);
  await command(page, 'Fit canvas');
  await expect(viewport).not.toHaveAttribute('style', saved!);
});

test('double-click quick creation, port-drop branching, connection inspection and slash focus are functional', async ({
  page,
}) => {
  await setup(page);
  const pane = page.locator('.react-flow__pane');
  await pane.dblclick({ position: await emptyCanvasPoint(page) });
  const menu = page.getByRole('menu', { name: 'Canvas actions' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'New conversation', exact: true }).click();
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(3);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await expect(input).toBeFocused();
  await command(page, 'Fit canvas');
  await page.waitForTimeout(300);
  const source = page.locator('[data-id="beta"] .source');
  const from = (await source.boundingBox())!;
  const point = await emptyCanvasPoint(page);
  const bounds = (await pane.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + point.x, bounds.y + point.y + 25, { steps: 20 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(4);
  await expect(input).toBeFocused();
  await command(page, 'Fit canvas');
  await page.waitForTimeout(300);
  const edge = page.locator('.react-flow__edge').last();
  await edge.locator('.react-flow__edge-interaction').click({ force: true });
  await expect(page.getByRole('region', { name: 'Connection context' })).toContainText('beta');
  await page.getByRole('button', { name: 'Disconnect nodes', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await pane.click({ position: await emptyCanvasPoint(page) });
  await page.keyboard.press('/');
  await expect(input).toBeFocused();
  await input.fill(Array(16).fill('A multiline draft').join('\n'));
  expect((await input.boundingBox())!.height).toBeLessThanOrEqual(160);
  const bar = (await page.locator('.message-bar').boundingBox())!;
  const controls = (await page.locator('.view-controls').boundingBox())!;
  expect(controls.y + controls.height).toBeLessThan(bar.y);
});

test('keyboard copy/paste works across canvases and universal search carries its query into saved content', async ({
  page,
}) => {
  await setup(page);
  await page.locator('[data-id="alpha"] .node-bottom-actions').click({ position: { x: 5, y: 12 } });
  await page.keyboard.press('Control+c');
  await command(page, 'New canvas');
  await page.keyboard.press('Control+v');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.locator('.message.assistant')).toContainText('ordinary message');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search commands and nodes' }).fill('ordinary message');
  await page.getByRole('button', { name: /Search saved messages & notes/ }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('ordinary message');
  await expect(page.getByRole('region', { name: 'Search saved content' })).toContainText(
    '2 matches',
  );
});

test('touch scrolls conversation content without dragging the card or panning the canvas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, true);
  await command(page, 'Find node: alpha');
  await page.waitForTimeout(300);
  const alpha = page.locator('[data-id="alpha"]');
  const messages = alpha.locator('.messages');
  const rect = (await messages.boundingBox())!;
  const before = await position(alpha);
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style');
  const session = await page.context().newCDPSession(page);
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height - 15;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++)
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - i * Math.min(10, rect.height / 24) }],
    });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => messages.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await position(alpha)).toBe(before);
  expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(viewport);
  await session.detach();
});
