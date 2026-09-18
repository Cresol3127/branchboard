import { expect, test } from '@playwright/test';
import { command } from './helpers';

for (const width of [1440, 390]) {
  test(`sidebar collapse is accessible and persists at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/');
    const sidebar = page.getByRole('complementary', { name: 'Projects and boards' });
    const canvas = page.getByRole('region', { name: 'Infinite canvas' });
    await expect(sidebar).toBeVisible();
    const originalWidth = (await canvas.boundingBox())!.width;
    const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await expect(collapse).toHaveAttribute('aria-controls', 'workspace-sidebar');
    await collapse.focus();
    await page.keyboard.press('Enter');
    await expect(sidebar).toBeVisible();
    await expect(page.locator('.sidebar-shell')).toHaveCSS('width', '64px');
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
    const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true });
    await expect(expand).toBeFocused();
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    if (width > 700)
      await expect
        .poll(async () => (await canvas.boundingBox())!.width)
        .toBeGreaterThan(originalWidth);
    else expect((await canvas.boundingBox())!.width).toBe(originalWidth);
    await expect(page.locator('.react-flow__node')).toHaveCount(3);
    await page.reload();
    await expect(sidebar).toBeVisible();
    await expect(page.locator('.sidebar-shell')).toHaveCSS('width', '64px');
    await expect(expand).toBeVisible();
    await command(page, 'Settings');
    await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await command(page, 'Expand sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'New board', exact: true })).toBeVisible();
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await page.reload();
    await expect(sidebar).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('sidebar animates to a usable icon rail and reverses interrupted motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const shell = page.locator('.sidebar-shell');
  const fullWidth = (await shell.boundingBox())!.width;
  const midway = await page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>('[aria-controls="workspace-sidebar"]')!.click();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const shell = document.querySelector<HTMLElement>('.sidebar-shell')!;
    const sidebar = document.getElementById('workspace-sidebar')!;
    const animations = shell.getAnimations({ subtree: true });
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 110;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return {
      animations: animations.length,
      width: shell.getBoundingClientRect().width,
      opacity: Number(getComputedStyle(sidebar).opacity),
      inert: sidebar.inert,
    };
  });
  expect(midway.animations).toBeGreaterThanOrEqual(1);
  expect(midway.width).toBeGreaterThan(64);
  expect(midway.width).toBeLessThan(fullWidth);
  expect(midway.opacity).toBeGreaterThan(0);
  expect(midway.opacity).toBe(1);
  expect(midway.inert).toBe(false);
  // Reverse before completion: the sidebar must remain usable after interrupted motion.
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect.poll(async () => (await shell.boundingBox())!.width).toBe(fullWidth);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
  await expect(page.locator('#workspace-sidebar')).not.toHaveAttribute('aria-hidden', 'true');
});

test('sidebar respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  expect(
    await page.locator('.sidebar-shell').evaluate((el) => el.getBoundingClientRect().width),
  ).toBe(64);
  expect(
    await page
      .locator('.sidebar-shell')
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
});
