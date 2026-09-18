import { expect, test } from '@playwright/test';
import { command } from './helpers';

test('resizes a node, undoes the resize, and toggles the interactive minimap', async ({ page }) => {
  await page.goto('/');
  await command(page, 'New canvas');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  const node = page.locator('.react-flow__node-chat');
  await command(page, 'Fit canvas');
  await expect.poll(async () => (await node.boundingBox())!.width).toBeCloseTo(340, 0);
  const before = (await node.boundingBox())!;
  const handle = node.locator('.react-flow__resize-control.bottom.right.handle');
  const corner = (await handle.boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + 80, corner.y + 60, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await node.boundingBox())!.width)
    .toBeGreaterThan(before.width + 50);
  await command(page, 'Undo');
  await expect.poll(async () => (await node.boundingBox())!.width).toBeCloseTo(before.width, 0);
  await command(page, 'Redo');
  await expect
    .poll(async () => (await node.boundingBox())!.width)
    .toBeGreaterThan(before.width + 50);
  await page.waitForTimeout(500);
  await page.reload();
  await expect
    .poll(async () => (await node.boundingBox())!.width)
    .toBeGreaterThan(before.width + 50);
  const expanded = (await node.boundingBox())!;
  await node.getByRole('button', { name: 'Collapse node', exact: true }).click();
  await expect.poll(async () => (await node.boundingBox())!.height).toBeLessThan(80);
  await node.getByRole('button', { name: 'Expand node', exact: true }).click();
  await expect.poll(async () => (await node.boundingBox())!.height).toBeCloseTo(expanded.height, 0);
  await page.getByRole('button', { name: 'Toggle minimap', exact: true }).click();
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle minimap', exact: true }).click();
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
});

test('unreadable workspace data is warned about and not silently overwritten', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('branchboard.workspace.v1', '{broken backup'),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('has not been overwritten');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => localStorage.getItem('branchboard.workspace.v1'))).toBe(
    '{broken backup',
  );
});
