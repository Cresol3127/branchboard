import { expect, type Page } from '@playwright/test';

export async function command(page: Page, label: string) {
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill(label);
  await palette.getByRole('option', { name: label, exact: true }).click();
}

export async function emptyCanvasPoint(page: Page) {
  return page.locator('.react-flow__pane').evaluate((pane) => {
    const rect = pane.getBoundingClientRect();
    for (let y = 8; y < rect.height; y += 24) {
      for (let x = 8; x < rect.width; x += 24) {
        if (document.elementFromPoint(rect.left + x, rect.top + y) === pane) return { x, y };
      }
    }
    throw new Error('No empty canvas space is visible');
  });
}
