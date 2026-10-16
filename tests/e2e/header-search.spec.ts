import { expect, test, type Page } from '@playwright/test';

async function checkHeader(page: Page, centered?: boolean) {
  // Viewport changes settle through ResizeObserver; retain every geometric check
  // while waiting for that layout frame instead of reading the previous width.
  await expect(async () => {
    const geometry = await page.locator('.workspace-header').evaluate((header) => {
      const box = (selector: string) => {
        const rect = header.querySelector(selector)!.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };
      return {
        layout: (header as HTMLElement).dataset.searchLayout,
        search: box('.header-search'),
        name: box('.breadcrumbs input'),
        toggle: box('.header-left button'),
        actions: box('.header-right'),
        windowWidth: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
      };
    });
    if (centered !== undefined) expect(geometry.layout).toBe(centered ? 'centered' : 'compact');
    if (geometry.layout === 'centered') {
      expect(
        Math.abs((geometry.search.left + geometry.search.right) / 2 - geometry.windowWidth / 2),
      ).toBeLessThan(1);
      expect(geometry.search.width).toBeGreaterThanOrEqual(160);
      expect(geometry.search.width).toBeLessThanOrEqual(420);
    } else expect(geometry.search.width).toBe(40);
    expect(geometry.search.left).toBeGreaterThanOrEqual(geometry.name.right + 3);
    expect(geometry.search.left).toBeGreaterThanOrEqual(geometry.toggle.right + 3);
    expect(geometry.actions.left).toBeGreaterThanOrEqual(geometry.search.right + 3);
    expect(geometry.search.right).toBeLessThanOrEqual(geometry.windowWidth);
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.windowWidth);
  }).toPass({ timeout: 5000 });
}

for (const width of [1440, 1920]) {
  test(`search stays centered on the whole window in both sidebar states at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.react-flow__node')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Reset zoom', exact: true })).not.toHaveText(
      '100%',
    );
    const viewport = await page.locator('.react-flow__viewport').getAttribute('style');
    const draft = page.getByRole('textbox', { name: 'Message', exact: true });
    await draft.fill('Keep this draft while the header moves.');
    await checkHeader(page, true);
    await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
    await checkHeader(page, true);
    await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', viewport!);
    await expect(draft).toHaveValue('Keep this draft while the header moves.');
    await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
    await checkHeader(page, true);
    await page.reload();
    await checkHeader(page, true);
  });
}

test('centering follows interrupted sidebar motion without moving focus or the graph', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reset zoom', exact: true })).not.toHaveText(
    '100%',
  );
  const before = await page.locator('.react-flow__viewport').getAttribute('style');
  const search = page.getByRole('button', { name: 'Search', exact: true });
  await search.focus();
  const intermediate = await page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>('[aria-controls="workspace-sidebar"]')!.click();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const shell = document.querySelector<HTMLElement>('.sidebar-shell')!;
    for (const animation of shell.getAnimations()) {
      animation.pause();
      animation.currentTime = 90;
    }
    return true;
  });
  expect(intermediate).toBe(true);
  await expect
    .poll(async () =>
      page.locator('.sidebar-shell').evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBeGreaterThan(64);
  await expect
    .poll(async () =>
      page.locator('.header-search').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return Math.abs(r.left + r.width / 2 - innerWidth / 2);
      }),
    )
    .toBeLessThan(1);
  await checkHeader(page, true);
  await expect(search).toBeFocused();
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('[aria-controls="workspace-sidebar"]')!.click(),
  );
  await expect(page.locator('.sidebar-shell')).toHaveCSS('width', '256px');
  await checkHeader(page, true);
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', before!);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Command palette', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
});

test('docked panels constrain search without overlap and closing restores window centering', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reset zoom', exact: true })).not.toHaveText(
    '100%',
  );
  const before = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
  await checkHeader(page, false);
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await checkHeader(page);
  await page.setViewportSize({ width: 1920, height: 960 });
  await checkHeader(page, true);
  await page.keyboard.press('Escape');
  await checkHeader(page, true);
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', before!);
});

test('long names and narrow windows keep search reachable without collisions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'Canvas name', exact: true })
    .fill('A deliberately long canvas name that must not collide with workspace search');
  const search = page.getByRole('button', { name: 'Search', exact: true });
  for (const width of [1280, 1100, 1024, 820, 700, 390, 320, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await checkHeader(page, width <= 700 ? false : undefined);
    await search.click();
    await expect(
      page.getByRole('combobox', { name: 'Search commands and nodes', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(search).toBeFocused();
  }
});
