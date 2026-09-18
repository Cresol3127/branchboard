import { expect, test } from '@playwright/test';
import { command, emptyCanvasPoint } from './helpers';

test('conventional workspace stays visible and follows light, dark and system themes', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('.canvas-area')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.react-flow__background')).toHaveCount(0);
  await expect(page.locator('.board-node').first()).toHaveCSS('border-radius', '12px');
  await expect(page.getByRole('complementary', { name: 'Projects and boards' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Boards' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Board tools' }).getByRole('button')).toHaveCount(
    4,
  );
  await expect(page.locator('.project-pill, .minimal-add')).toHaveCount(0);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Boards' }).getByRole('button')).toHaveCount(3);
  await page.getByRole('navigation', { name: 'Boards' }).getByRole('button').nth(1).click();
  await expect(
    page.getByRole('navigation', { name: 'Boards' }).getByRole('button').nth(1),
  ).toHaveAttribute('aria-current', 'page');
  await command(page, 'Theme: dark');
  await expect(page.locator('.canvas-area')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await command(page, 'Theme: system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await command(page, 'Theme: light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('palette keyboard navigation, grid shortcut, expansion and context menus', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.command-palette')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('combobox')).toBeFocused();
  await page.getByRole('combobox').fill('New note');
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  const note = page.locator('.react-flow__node-note.selected');
  await note.getByRole('textbox', { name: 'Note content' }).fill('A saved thought');
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 80 } });
  await expect(page.getByRole('textbox', { name: 'Note content' })).toBeHidden();
  await page.keyboard.press('g');
  await expect(page.locator('.react-flow__background')).toBeVisible();
  await page.keyboard.press('g');
  await expect(page.locator('.react-flow__background')).toHaveCount(0);
  await command(page, 'Find node: Untitled note');
  await expect(note.getByRole('textbox', { name: 'Note content' })).toHaveValue('A saved thought');
  await note.locator('.node-heading').click({ button: 'right' });
  await expect(page.getByRole('menu', { name: 'Node actions' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page
    .locator('.react-flow__pane')
    .click({ button: 'right', position: await emptyCanvasPoint(page) });
  await page.getByRole('menuitem', { name: 'New conversation', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
});

test('reduced motion, add button and settings focus trap', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('.modal')).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
