import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { command } from './helpers';

async function setup(page: Page) {
  await page.goto('/');
  await command(page, 'New canvas');
  await page.getByRole('button', { name: 'Drawing & annotations', exact: true }).click();
}
async function draw(page: Page, name: string, offset = 0) {
  await page.getByRole('button', { name, exact: true }).click();
  const surface = (await page.getByLabel('Annotation drawing surface').boundingBox())!;
  await page.mouse.move(surface.x + 120 + offset, surface.y + 230);
  await page.mouse.down();
  await page.mouse.move(surface.x + 240 + offset, surface.y + 320, { steps: 12 });
  await page.mouse.up();
}
async function saved(page: Page) {
  return page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('branchboard.workspace.v1')!);
    return w.boards.find((b: { id: string }) => b.id === w.currentId).annotations;
  });
}
test('annotation JSON round trips with independent IDs and tools fit a mobile viewport', async ({
  page,
}) => {
  await setup(page);
  await draw(page, 'Rectangle');
  await expect.poll(async () => (await saved(page))?.items.length).toBe(1);
  const original = await saved(page);
  const download = page.waitForEvent('download');
  await command(page, 'Export board backup (JSON)');
  const content = await readFile((await (await download).path())!, 'utf8');
  expect(JSON.parse(content).board.annotations).toEqual(original);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'drawing.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
  await expect.poll(async () => (await saved(page))?.items[0].id).not.toBe(original.items[0].id);
  const copy = await saved(page);
  expect(copy.items[0].layerId).toBe(copy.layers[0].id);
  await command(page, 'Collapse sidebar');
  await page.setViewportSize({ width: 390, height: 844 });
  await command(page, 'Fit canvas');
  const panel = await page.locator('.annotation-panel').boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Annotation layers', exact: true }).click();
  const dialog = await page
    .getByRole('dialog', { name: 'Annotation layers', exact: true })
    .boundingBox();
  expect(dialog!.x).toBeGreaterThanOrEqual(0);
  expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close annotation tools', exact: true }).click();
  await expect(page.locator('[data-annotation-id]')).toHaveCount(1);
});

test('an imported annotation-only canvas fits remote marks without a saved viewport', async ({
  page,
}) => {
  await setup(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'remote-ink.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        board: {
          id: 'remote',
          name: 'Remote ink',
          updatedAt: Date.now(),
          nodes: [],
          edges: [],
          annotations: {
            layers: [{ id: 'ink', name: 'Ink', visible: true, locked: false }],
            items: [
              {
                id: 'box',
                layerId: 'ink',
                kind: 'rectangle',
                color: '#8064c3',
                width: 3,
                points: [
                  { x: -9000, y: 8000 },
                  { x: -8100, y: 8200 },
                ],
              },
            ],
          },
        },
      }),
    ),
  });
  await expect(page.getByRole('textbox', { name: 'Canvas name', exact: true })).toHaveValue(
    'Remote ink',
  );
  await expect
    .poll(async () => {
      const mark = await page.locator('[data-annotation-id]').boundingBox();
      const canvas = await page.locator('.react-flow').boundingBox();
      return (
        !!mark &&
        !!canvas &&
        mark.x >= canvas.x &&
        mark.y >= canvas.y &&
        mark.x + mark.width <= canvas.x + canvas.width &&
        mark.y + mark.height <= canvas.y + canvas.height
      );
    })
    .toBe(true);
});
test('freehand/highlighting persists, supports one-step undo and cancel, and moves with keyboard and pointer', async ({
  page,
}) => {
  await setup(page);
  await draw(page, 'Freehand pen');
  await expect(page.locator('[data-kind="pen"]')).toHaveCount(1);
  await expect.poll(async () => (await saved(page))?.items.length).toBe(1);
  const original = (await saved(page)).items[0];
  expect(original.points.length).toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Select annotations', exact: true }).click();
  const hit = page.getByRole('button', { name: 'pen annotation on Ink', exact: true });
  await hit.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await saved(page)).items[0].points[0].x)
    .toBe(original.points[0].x + 10);
  const bounds = (await hit.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + bounds.height / 2 + 30, {
    steps: 10,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await saved(page)).items[0].points[0].x)
    .toBeCloseTo(original.points[0].x + 70, 0);
  await command(page, 'Undo');
  await expect
    .poll(async () => (await saved(page)).items[0].points[0].x)
    .toBe(original.points[0].x + 10);
  await draw(page, 'Highlighter', 180);
  await expect(page.locator('[data-kind="highlight"]')).toHaveCount(1);
  await command(page, 'Undo');
  await expect(page.locator('[data-kind="highlight"]')).toHaveCount(0);
  await command(page, 'Redo');
  await expect(page.locator('[data-kind="highlight"]')).toHaveCount(1);
  await page.waitForTimeout(450);
  await page.reload();
  await expect(page.locator('[data-annotation-id]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Drawing & annotations', exact: true }).click();
  await page.getByRole('button', { name: 'Freehand pen', exact: true }).click();
  const surface = (await page.getByLabel('Annotation drawing surface').boundingBox())!;
  await page.mouse.move(surface.x + 300, surface.y + 300);
  await page.mouse.down();
  await page.mouse.move(surface.x + 400, surface.y + 400);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-annotation-id]')).toHaveCount(2);
  await command(page, 'Fit canvas');
  await expect(page.getByRole('button', { name: 'Fit canvas', exact: true })).toBeVisible();
});

test('rectangle, ellipse and arrow use canvas coordinates at zoom, recolor and delete without affecting nodes', async ({
  page,
}) => {
  await setup(page);
  await command(page, 'Zoom out');
  await page.waitForTimeout(400);
  await draw(page, 'Rectangle');
  await draw(page, 'Ellipse', 170);
  await draw(page, 'Arrow', 340);
  await expect(page.locator('[data-annotation-id]')).toHaveCount(3);
  await expect.poll(async () => (await saved(page))?.items.length).toBe(3);
  const [rectangle] = (await saved(page)).items;
  expect(rectangle.points[1].x - rectangle.points[0].x).toBeGreaterThan(120);
  await page.getByRole('button', { name: 'Select annotations', exact: true }).click();
  await page.getByRole('button', { name: 'rectangle annotation on Ink' }).focus();
  await page.getByLabel('Annotation color', { exact: true }).fill('#cc5533');
  await page.getByLabel('Annotation width', { exact: true }).selectOption('6');
  await expect.poll(async () => (await saved(page)).items[0].color).toBe('#cc5533');
  await page.getByRole('button', { name: 'Delete annotation', exact: true }).click();
  await expect(page.locator('[data-kind="rectangle"]')).toHaveCount(0);
  await command(page, 'Undo');
  await expect(page.locator('[data-kind="rectangle"]')).toHaveCount(1);
  await command(page, 'New note');
  await page.getByRole('button', { name: 'Close annotation tools' }).click();
  await expect(page.locator('.react-flow__node-note')).toHaveCount(1);
  await page
    .getByRole('textbox', { name: 'Note content', exact: true })
    .fill('Annotations do not become AI context.');
});

test('layers rename, hide, lock, reorder and delete with safe confirmation and undo', async ({
  page,
}) => {
  await setup(page);
  await draw(page, 'Freehand pen');
  await page.getByRole('button', { name: 'Annotation layers', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Annotation layers', exact: true });
  await dialog.getByLabel('Layer name 1').fill('Review');
  await dialog.getByLabel('Layer name 1').press('Enter');
  await dialog.getByLabel('Visible', { exact: true }).uncheck();
  await expect(page.locator('[data-annotation-id]')).toHaveCount(0);
  await dialog.getByLabel('Visible', { exact: true }).check();
  await dialog.getByLabel('Locked', { exact: true }).check();
  await expect(dialog.getByRole('button', { name: 'Delete layer Review' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Annotation drawing surface')).toHaveCount(0);
  await page.getByRole('button', { name: 'Annotation layers', exact: true }).click();
  await dialog.getByLabel('Locked', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Add annotation layer' }).click();
  await page.keyboard.press('Escape');
  await draw(page, 'Arrow', 220);
  await page.getByRole('button', { name: 'Annotation layers', exact: true }).click();
  await dialog.getByRole('button', { name: 'Lower Layer 2' }).click();
  await expect(dialog.getByLabel('Layer name 1')).toHaveValue('Layer 2');
  await dialog.getByRole('button', { name: 'Delete layer Review' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete annotation layer?' });
  await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('[data-annotation-id]')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Delete layer Review' }).click();
  await confirmation.getByRole('button', { name: 'Delete layer', exact: true }).click();
  await expect(page.locator('[data-kind="pen"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await command(page, 'Undo');
  await expect(page.locator('[data-kind="pen"]')).toHaveCount(1);
  await page.waitForTimeout(450);
  await page.reload();
  await expect(page.locator('[data-annotation-id]')).toHaveCount(2);
});
