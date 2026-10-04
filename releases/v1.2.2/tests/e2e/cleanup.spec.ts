import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
const screenshots = process.env.CLEANUP_SCREENSHOT_DIR;
test('real starter canvas, settings and light/dark mobile layouts', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.react-flow__node')).toHaveCount(Number(version.split('.')[1]) <= 3 ? 2 : 3);
  await page.evaluate(() => document.fonts.ready);
  if (screenshots) {
    await mkdir(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, `${version}-desktop.png`), animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  if (screenshots) await page.screenshot({ path: path.join(screenshots, `${version}-dark.png`), animations: 'disabled' });
  const context = await browser.newContext({ baseURL: process.env.BASE_URL || 'http://localhost:3000', viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: 'reduce' });
  try {
    const mobile = await context.newPage();
    mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto('/');
    await expect(mobile.locator('.react-flow__node')).toHaveCount(Number(version.split('.')[1]) <= 3 ? 2 : 3);
    await mobile.evaluate(() => document.fonts.ready);
    await mobile.waitForTimeout(350);
    if (screenshots) await mobile.screenshot({ path: path.join(screenshots, `${version}-mobile.png`), animations: 'disabled' });
    await mobile.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = mobile.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(settings).toBeVisible();
    const bounds = (await settings.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    if (screenshots) await mobile.screenshot({ path: path.join(screenshots, `${version}-settings.png`), animations: 'disabled' });
    await mobile.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
  } finally { await context.close(); }
  expect(errors).toEqual([]);
});

test('removed controls stay absent and a real note survives editing and reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('.board-node').first().click({ button: 'right', position: { x: 12, y: 12 } });
  const menu = page.getByRole('menu', { name: 'Node actions' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Inspect|Group selection/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await palette.getByRole('combobox').fill('Group selection');
  await expect(palette.getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Node title', exact: true });
  await title.click();
  await expect(title).toBeFocused();
  await title.fill(`Saved cleanup ${version}`);
  await expect(title).toHaveValue(`Saved cleanup ${version}`);
  await title.press('Tab');
  const content = page.getByRole('textbox', { name: 'Note content', exact: true });
  if (await content.count() === 0) await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await content.fill('A real saved note, not an AI fixture.');
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Node title', exact: true })).toHaveValue(`Saved cleanup ${version}`);
  await expect(page.locator('.react-flow__node-note')).toContainText('A real saved note, not an AI fixture.');
});

test('Ctrl rectangle changes selection only and legacy parent groups remain readable', async ({ page }) => {
  await page.addInitScript(() => {
    const data = { title: 'Legacy data', color: 'sage', note: '', messages: [] };
    localStorage.setItem('branchboard.workspace.v1', JSON.stringify({ currentId: 'legacy', boards: [{
      id: 'legacy', name: 'Legacy group', updatedAt: 1, viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
      nodes: [
        { id: 'parent', type: 'group', position: { x: 40, y: 70 }, style: { width: 650, height: 380 }, data },
        { id: 'child', type: 'chat', parentId: 'parent', position: { x: 30, y: 60 }, style: { width: 280, height: 230 }, data: { ...data, messages: [{ id: 'q', role: 'user', content: 'Preserved legacy question' }] } },
        { id: 'note', type: 'note', position: { x: 800, y: 100 }, style: { width: 280, height: 230 }, data: { ...data, note: 'Independent reference' } },
      ],
    }] }));
  });
  await page.goto('/');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__node-group')).toHaveCount(1);
  await expect(page.locator('[data-id="child"]')).toContainText('Preserved legacy question');
  const flow = (await page.locator('.react-flow').boundingBox())!;
  await page.keyboard.down('Control');
  await page.mouse.move(flow.x + 15, flow.y + 20);
  await page.mouse.down();
  await page.mouse.move(flow.x + 720, flow.y + 500, { steps: 12 });
  await expect(page.locator('.react-flow__selection')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(page.locator('.react-flow__node.selected')).not.toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__node-group')).toHaveCount(1);
  await page.waitForTimeout(450);
  const parent = await page.evaluate(() => JSON.parse(localStorage.getItem('branchboard.workspace.v1')!).boards[0].nodes.find((n: { id: string }) => n.id === 'child').parentId);
  expect(parent).toBe('parent');
});
