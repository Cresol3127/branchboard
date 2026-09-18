import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Isolated browser storage; no fixtures, credentials, or changes to existing canvases.
const directory = path.resolve(process.env.SCREENSHOT_DIR || 'screenshots');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(directory, name), fullPage: true });
}
async function command(name) {
  await page.keyboard.press('Escape');
  await page.locator('.canvas-area').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox').fill(name);
  await page.getByRole('option', { name, exact: true }).click();
}
try {
  await page.goto('http://localhost:3000');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await capture('01-canvas.png');
  await command('New canvas');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await capture('02-node-created.png');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await command('Auto-arrange nodes');
  await page.waitForTimeout(500);
  const nodes = page.locator('.react-flow__node-chat');
  await expect(nodes).toHaveCount(3);
  for (let i = 0; i < 2; i++) {
    const from = await nodes.nth(i).locator('.source').boundingBox();
    const to = await nodes
      .nth(i + 1)
      .locator('.target')
      .boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
    await page.mouse.up();
  }
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await command('Auto-arrange nodes');
  await capture('03-connected.png');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await capture('04-settings.png');
  await page.keyboard.press('Escape');
  await nodes
    .first()
    .getByRole('button', { name: /^Select model:/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'Model selector' })).toBeVisible();
  await capture('05-model-selector.png');
  await page.keyboard.press('Escape');
  await nodes.first().locator('.node-heading').click({ button: 'right' });
  await expect(page.getByRole('menu', { name: 'Node actions' })).toBeVisible();
  await capture('06-context-menu.png');
  await page.keyboard.press('Escape');
  await command('Fit canvas');
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await capture('07-command-palette.png');
  await page.keyboard.press('Escape');
  await command('Theme: dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await capture('08-dark.png');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await command('New canvas');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await capture('09-mobile-canvas.png');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await capture('10-mobile-settings.png');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Select model:/ }).click();
  await capture('11-mobile-model-selector.png');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Node actions', exact: true }).click();
  await capture('12-mobile-context-menu.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Projects and boards' })).toBeHidden();
  await command('Fit canvas');
  await capture('13-sidebar-collapsed.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await command('Fit canvas');
  await capture('14-mobile-sidebar-collapsed.png');
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Projects and boards' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 960 });
  await command('Fit canvas');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(async () => {
    document.querySelector('[aria-controls="workspace-sidebar"]').click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (const animation of document
      .querySelector('.sidebar-shell')
      .getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 110;
    }
  });
  await capture('15-sidebar-animation.png');
  await page.evaluate(() => {
    for (const animation of document
      .querySelector('.sidebar-shell')
      .getAnimations({ subtree: true }))
      animation.finish();
  });
  await writeFile(path.join(directory, 'browser-errors.json'), JSON.stringify(errors, null, 2));
  expect(errors).toEqual([]);
  console.log(`Saved fifteen desktop/mobile screenshots to ${directory}; no browser errors.`);
} finally {
  await browser.close();
}
