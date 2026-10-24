import { expect, test, type Locator, type Page } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

async function box(locator: Locator): Promise<Box> {
  const value = await locator.boundingBox();
  if (!value) throw new Error('Expected a visible element');
  return value;
}

async function canvasBox(page: Page) {
  return page.locator('.canvas-area').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

async function mode(page: Page, name: string) {
  return region(page, name).evaluate(
    (element) =>
      element.closest<HTMLElement>('.workspace-panel-content')?.getAttribute('data-mode') || null,
  );
}

async function outerBox(page: Page, name: string) {
  return region(page, name).evaluate((element) => {
    const rect = element.closest<HTMLElement>('.workspace-panel-content')!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

async function snap(page: Page, name: string, target: 'left' | 'right' | 'top' | 'bottom') {
  await region(page, name).getByRole('button', { name: 'Snap layout', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Snap window', exact: true });
  await expect(menu).toBeVisible();
  await menu
    .getByRole('menuitem', {
      name: `Snap ${target} half`,
      exact: true,
    })
    .click();
  const expected = `snap-${target}`;
  await expect.poll(() => mode(page, name)).toBe(expected);
}

test.use({ viewport: { width: 1440, height: 960 } });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('docked and snapped windows move the canvas to the opposite half', async ({ page }) => {
  await page.goto('/');
  const sidebarWidth = (await box(page.getByRole('complementary', { name: 'Projects and boards' })))
    .width;
  const full = await canvasBox(page);
  expect(full.x).toBeCloseTo(sidebarWidth, 0);

  await page.getByRole('button', { name: 'Models', exact: true }).click();
  const models = region(page, 'Models');
  await expect(models).toBeVisible();
  await expect.poll(() => mode(page, 'Models')).toBe('docked');
  const docked = await outerBox(page, 'Models');
  expect(docked.width).toBeCloseTo(360, 0);
  expect(docked.x).toBeCloseTo(sidebarWidth, 0);
  expect((await canvasBox(page)).x).toBeCloseTo(docked.x + docked.width, 0);

  // Snap directly from the docked panel; the dock reservation is released.
  await snap(page, 'Models', 'right');
  const desktop = await outerBox(page, 'Models');
  const afterRight = await canvasBox(page);
  expect(desktop.x).toBeGreaterThan(sidebarWidth + desktop.width / 2 - 8);
  expect(afterRight.x).toBeCloseTo(sidebarWidth, 0);
  expect(desktop.x).toBeGreaterThanOrEqual(afterRight.x + afterRight.width - 8);
  await expect(region(page, 'Models')).toHaveAttribute('data-window-active', 'true');

  await snap(page, 'Models', 'top');
  const top = await outerBox(page, 'Models');
  const afterTop = await canvasBox(page);
  expect(top.y).toBeCloseTo(80, 0);
  expect(top.width).toBeGreaterThan(1000);
  expect(afterTop.y).toBeGreaterThanOrEqual(top.y + top.height - 2);

  await snap(page, 'Models', 'bottom');
  const bottom = await outerBox(page, 'Models');
  const afterBottom = await canvasBox(page);
  expect(bottom.y).toBeGreaterThanOrEqual(afterBottom.y + afterBottom.height - 2);

  await snap(page, 'Models', 'left');
  const left = await outerBox(page, 'Models');
  const afterLeft = await canvasBox(page);
  expect(left.x).toBeCloseTo(sidebarWidth, 0);
  expect(afterLeft.x).toBeGreaterThanOrEqual(left.x + left.width - 2);

  await region(page, 'Models').getByRole('button', { name: 'Maximize window' }).click();
  await expect.poll(() => mode(page, 'Models')).toBe('maximized');
  const maximized = await outerBox(page, 'Models');
  expect(maximized).toMatchObject({
    x: sidebarWidth,
    y: 80,
    width: 1440 - sidebarWidth,
    height: 880,
  });
  await region(page, 'Models').getByRole('button', { name: 'Restore window' }).click();
  await expect.poll(() => mode(page, 'Models')).toBe('snap-left');

  await region(page, 'Models').getByRole('button', { name: 'Dock panel' }).click();
  await expect.poll(() => mode(page, 'Models')).toBe('docked');
  expect((await canvasBox(page)).x).toBeCloseTo(sidebarWidth + 360, 0);
  await region(page, 'Models').getByRole('button', { name: 'Pop out panel' }).click();
  await expect.poll(() => mode(page, 'Models')).toBe('floating');
  await expect.poll(async () => (await canvasBox(page)).x).toBeLessThanOrEqual(sidebarWidth + 2);
});

test('windows resize, raise, dock, persist layout and reset', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await expect.poll(() => mode(page, 'Models')).toBe('docked');
  await region(page, 'Models').getByRole('button', { name: 'Pop out panel' }).click();
  await expect.poll(() => mode(page, 'Models')).toBe('floating');

  const beforeResize = await outerBox(page, 'Models');
  const resize = await box(page.locator('.window-resize-handle.handle-se'));
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
  await page.mouse.down();
  await page.mouse.move(resize.x + 140, resize.y + 90, { steps: 8 });
  await page.mouse.up();
  const resized = await outerBox(page, 'Models');
  expect(resized.width).toBeGreaterThan(beforeResize.width + 80);
  expect(resized.height).toBeGreaterThan(beforeResize.height + 50);

  const move = await box(
    region(page, 'Models').getByRole('button', { name: 'Move Models window', exact: true }),
  );
  await page.mouse.move(move.x + 80, move.y + 20);
  await page.mouse.down();
  await page.mouse.move(move.x + 120, move.y + 50, { steps: 8 });
  await page.mouse.up();
  const moved = await outerBox(page, 'Models');
  expect(moved.x).toBeGreaterThan(resized.x + 20);
  expect(moved.y).toBeGreaterThan(resized.y + 10);

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('branchboard.windows.v1') || 'null'),
  );
  expect(stored.version).toBe(1);
  expect(stored.panels.models.mode).toBe('floating');
  expect(stored.panels.models.bounds).toEqual({
    x: Math.round(moved.x - 256),
    y: Math.round(moved.y - 80),
    width: Math.round(moved.width),
    height: Math.round(moved.height),
  });

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = region(page, 'Settings');
  await expect(settings).toBeVisible();
  await expect(region(page, 'Models')).toBeVisible();
  await expect.poll(() => mode(page, 'Settings')).toBe('docked');
  expect(await page.getByRole('tablist').count()).toBe(0);

  await settings.getByRole('heading', { name: 'Settings', exact: true }).click();
  await expect
    .poll(() =>
      region(page, 'Settings').evaluate(
        (element) =>
          element.closest<HTMLElement>('.workspace-panel-content')?.dataset.active === 'true',
      ),
    )
    .toBe(true);
  const settingsZ = await region(page, 'Settings').evaluate((element) =>
    Number(getComputedStyle(element.closest<HTMLElement>('.workspace-panel-content')!).zIndex),
  );
  const modelsZ = await region(page, 'Models').evaluate((element) =>
    Number(getComputedStyle(element.closest<HTMLElement>('.workspace-panel-content')!).zIndex),
  );
  expect(settingsZ).toBeGreaterThan(modelsZ);

  // Docking one panel floats the previous occupant instead of unmounting it.
  await region(page, 'Models').getByRole('button', { name: 'Dock panel', exact: true }).click();
  await expect.poll(() => mode(page, 'Models')).toBe('docked');
  await expect.poll(() => mode(page, 'Settings')).toBe('floating');
  expect((await canvasBox(page)).x).toBeCloseTo(256 + 360, 0);
  await region(page, 'Settings').getByRole('button', { name: 'Dock panel', exact: true }).click();
  await expect.poll(() => mode(page, 'Settings')).toBe('docked');
  await expect.poll(() => mode(page, 'Models')).toBe('floating');
  expect((await canvasBox(page)).x).toBeCloseTo(256 + 360, 0);

  await page.reload();
  await expect(page.getByRole('region', { name: 'Models', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await expect.poll(() => mode(page, 'Models')).toBe('floating');
  expect(await canvasBox(page)).toMatchObject({ x: 256 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect.poll(() => mode(page, 'Settings')).toBe('docked');
  expect((await canvasBox(page)).x).toBeCloseTo(256 + 360, 0);

  await region(page, 'Settings')
    .getByRole('button', { name: 'Reset window layout', exact: true })
    .click();
  expect(await page.evaluate(() => localStorage.getItem('branchboard.windows.v1'))).toBeNull();
  await page.reload();
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await expect.poll(() => mode(page, 'Models')).toBe('docked');
  expect((await canvasBox(page)).x).toBeCloseTo(256 + 360, 0);
});

test('dragging to an edge and keyboard controls snap without losing the window', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await expect.poll(() => mode(page, 'Models')).toBe('docked');
  await region(page, 'Models').getByRole('button', { name: 'Pop out panel' }).click();
  await expect.poll(() => mode(page, 'Models')).toBe('floating');

  const move = await box(
    region(page, 'Models').getByRole('button', { name: 'Move Models window', exact: true }),
  );
  await page.mouse.move(move.x + 80, move.y + 20);
  await page.mouse.down();
  await page.mouse.move(1436, 520, { steps: 12 });
  const preview = page.locator('.window-snap-preview');
  await expect(preview).toBeVisible();
  const previewBox = await box(preview);
  expect(previewBox.x).toBeGreaterThan(800);
  expect(previewBox.y).toBeCloseTo(80, 0);
  await page.mouse.up();
  await expect.poll(() => mode(page, 'Models')).toBe('snap-right');
  const snapped = await outerBox(page, 'Models');
  const canvas = await canvasBox(page);
  expect(snapped.x).toBeGreaterThanOrEqual(canvas.x + canvas.width - 8);
  expect(canvas.x).toBeCloseTo(256, 0);

  const handle = region(page, 'Models').getByRole('button', { name: 'Move Models window' });
  await handle.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => mode(page, 'Models')).toBe('snap-bottom');
  const bottom = await outerBox(page, 'Models');
  const below = await canvasBox(page);
  expect(bottom.y).toBeGreaterThanOrEqual(below.y + below.height - 2);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => mode(page, 'Models')).toBe('floating');
  const moved = await outerBox(page, 'Models');
  await page.keyboard.press('Shift+ArrowDown');
  const resized = await outerBox(page, 'Models');
  expect(moved.x).toBeLessThanOrEqual(260);
  expect(resized.height).toBeGreaterThan(moved.height + 20);
  await page.keyboard.press('Enter');
  await expect.poll(() => mode(page, 'Models')).toBe('maximized');
  await page.keyboard.press('Enter');
  await expect.poll(() => mode(page, 'Models')).toBe('floating');
});
