import { expect, test, type Locator } from '@playwright/test';

const overlaps = async (a: Locator, b: Locator) => {
  const x = (await a.boundingBox())!,
    y = (await b.boundingBox())!;
  return x.x < y.x + y.width && x.x + x.width > y.x && x.y < y.y + y.height && x.y + x.height > y.y;
};

test('composer resizes wrapped drafts without editing them or moving the graph', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Reset zoom', exact: true })).not.toHaveText(
    '100%',
  );
  const draft = 'What should we verify before the release?';
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill(draft);
  const before = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => input.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeLessThanOrEqual(1);
  await expect(input).toHaveValue(draft);
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', before!);
  const wrappedHeight = (await input.boundingBox())!.height;
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThan(wrappedHeight);
  await expect(input).toHaveValue(draft);
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', before!);
});

for (const width of [1440, 390]) {
  test(`overlays coordinate with minimap, composer and sidebar without resetting the viewport at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.react-flow__node')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Reset zoom', exact: true })).not.toHaveText(
      '100%',
    );
    const viewport = () => page.locator('.react-flow__viewport').getAttribute('style');
    const before = await viewport();
    const controls = page.locator('.view-controls'),
      composer = page.locator('.message-bar');
    const initial = (await controls.boundingBox())!;
    expect(await overlaps(controls, composer)).toBe(false);
    await page.getByRole('button', { name: 'Toggle minimap', exact: true }).click();
    const map = page.locator('.react-flow__minimap');
    await expect(map).toBeVisible();
    await expect
      .poll(
        async () =>
          (await map.boundingBox())!.y -
          ((await controls.boundingBox())!.y + (await controls.boundingBox())!.height),
      )
      .toBeGreaterThanOrEqual(23.5);
    expect((await controls.boundingBox())!.y).toBeLessThan(initial.y);
    expect(await overlaps(map, composer)).toBe(false);
    await page.getByRole('button', { name: 'Toggle minimap', exact: true }).click();
    await expect.poll(async () => (await controls.boundingBox())!.y).toBe(initial.y);
    await page
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('One\nTwo\nThree\nFour\nFive\nSix\nSeven');
    expect(await overlaps(controls, composer)).toBe(false);
    if (width === 1440)
      await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New board', exact: true })).toHaveCSS(
      'width',
      '44px',
    );
    await expect(page.locator('.brand-mark')).toHaveCSS('width', '28px');
    await expect.poll(viewport).toBe(before);
  });

  test(`settings and help use progressive detail, readable hierarchy and keyboard-safe navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(settings.getByRole('heading', { name: 'Settings', exact: true })).toHaveCSS(
      'font-size',
      '24px',
    );
    await expect(
      settings.getByRole('button', { name: 'Save settings', exact: true }),
    ).toBeInViewport();
    await expect(settings.getByLabel('Additional models (one per line)')).toBeHidden();
    await settings.getByText('Models & advanced options', { exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(settings.getByLabel('Additional models (one per line)')).toBeVisible();
    await settings.getByLabel('Additional models (one per line)').fill('only-a-draft');
    await expect(
      settings.getByRole('button', { name: 'Close dialog', exact: true }),
    ).toBeInViewport();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Tips & shortcuts', exact: true }).click();
    const help = page.getByRole('dialog', { name: 'Help', exact: true });
    await expect(help.getByRole('heading', { level: 3 })).toHaveCount(3);
    await expect(help.getByRole('heading', { name: 'Capture a thought' })).toHaveCSS(
      'font-size',
      '18px',
    );
    await help.getByRole('tab', { name: 'Keyboard shortcuts', exact: true }).click();
    await help.getByRole('textbox', { name: 'Search shortcuts', exact: true }).fill('paste');
    await expect(help.locator('.shortcuts dt')).toHaveCount(1);
    await help.getByRole('tab', { name: 'Keyboard shortcuts', exact: true }).focus();
    await page.keyboard.press('Home');
    await expect(help.getByRole('tab', { name: 'Getting started', exact: true })).toBeFocused();
    await expect(help.getByRole('tabpanel')).toContainText('Connect your ideas');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Tips & shortcuts', exact: true })).toBeFocused();
  });
}
