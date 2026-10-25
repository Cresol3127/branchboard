import { expect, type Locator, type Page } from '@playwright/test';

export async function command(page: Page, label: string) {
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('region', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox', { name: 'Search commands and nodes' }).fill(label);
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

export async function clickEdge(page: Page, edge: Locator) {
  const point = await edge.locator('.react-flow__edge-interaction').evaluate((element) => {
    const path = element as SVGPathElement;
    const location = path.getPointAtLength(path.getTotalLength() * 0.8);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('Edge is not rendered');
    return {
      x: location.x * matrix.a + location.y * matrix.c + matrix.e,
      y: location.x * matrix.b + location.y * matrix.d + matrix.f,
    };
  });
  await page.mouse.click(point.x, point.y);
}
