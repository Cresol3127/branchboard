import { expect, test, type Page } from '@playwright/test';
import { builtinPalettes, contrast } from '../../src/palettes';
import { providerDefinitions, providerIds } from '../../src/providers';

async function openAppearance(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  return page.getByRole('region', { name: 'Settings', exact: true });
}

async function expectUniformPanelSurface(panel: ReturnType<Page['getByRole']>) {
  const surfaces = await panel.evaluate((el) => {
    const background = (element: Element) => getComputedStyle(element).backgroundColor;
    return {
      panel: background(el),
      header: background(el.querySelector(':scope > header')!),
      actions: background(el.querySelector('.palette-settings > .provider-actions')!),
    };
  });
  expect(surfaces.header).toBe(surfaces.panel);
  expect(surfaces.actions).toBe(surfaces.panel);
}

test('all built-in palettes apply in both modes without changing workspace or viewport', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const panel = await openAppearance(page);
  const snapshot = () =>
    page.evaluate(() => ({
      workspace: localStorage.getItem('branchboard.workspace.v1'),
      viewport: document.querySelector('.react-flow__viewport')?.getAttribute('style'),
    }));
  await page.waitForTimeout(400);
  const before = await snapshot();
  // The original palette exposed separate gray header/action rectangles too.
  for (const mode of ['light', 'dark']) {
    await panel.getByLabel('Color theme', { exact: true }).selectOption(mode);
    await expectUniformPanelSurface(panel);
  }
  for (const palette of builtinPalettes) {
    await panel.getByLabel('UI palette', { exact: true }).selectOption(palette.id);
    for (const mode of ['light', 'dark'] as const) {
      await panel.getByLabel('Color theme', { exact: true }).selectOption(mode);
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue('--md-sys-color-surface'),
          ),
        )
        .toBe(palette[mode].background);
      await expect(panel.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
      await expectUniformPanelSurface(panel);
      const control = await panel.getByLabel('UI palette', { exact: true }).evaluate((el) => {
        const css = getComputedStyle(el);
        const hex = (value: string) =>
          `#${value
            .match(/\d+/g)!
            .slice(0, 3)
            .map((n) => Number(n).toString(16).padStart(2, '0'))
            .join('')}`;
        return {
          background: hex(css.backgroundColor),
          text: hex(css.color),
          border: hex(css.borderTopColor),
          swatches: Array.from(document.querySelectorAll('.palette-swatches > span')).map(
            (swatch) => hex(getComputedStyle(swatch).backgroundColor),
          ),
        };
      });
      expect(control.background).toBe(palette[mode].background);
      expect(contrast(control.text, control.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(control.border, control.background)).toBeGreaterThanOrEqual(3);
      expect(control.swatches).toEqual(
        (['background', 'surface', 'text', 'accent', 'selection'] as const).map(
          (role) => palette[mode][role],
        ),
      );
    }
  }
  expect(await snapshot()).toEqual(before);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--md-sys-color-surface'),
      ),
    )
    .toBe(builtinPalettes.at(-1)!.dark.background);
  const reopened = await openAppearance(page);
  await expect(reopened.getByLabel('UI palette', { exact: true })).toHaveValue('claude');
  const spacing = await reopened.getByLabel('Color theme', { exact: true }).evaluate((control) => {
    const label = control.closest('label')!;
    return parseFloat(getComputedStyle(label).rowGap);
  });
  expect(spacing).toBeGreaterThanOrEqual(8);
});

test('custom palettes save, rename, duplicate, delete and revert previews across reloads', async ({
  page,
}) => {
  await page.goto('/');
  let panel = await openAppearance(page);
  await panel.getByLabel('Color theme', { exact: true }).selectOption('dark');
  await panel.getByLabel('UI palette', { exact: true }).selectOption('nord');
  await panel.getByRole('button', { name: 'Customize palette', exact: true }).click();
  for (const label of ['Palette name', 'Background hex']) {
    const input = panel.getByRole('textbox', { name: label, exact: true });
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await input.evaluate((el) => {
        const s = getComputedStyle(el);
        const reference = document.createElement('span');
        reference.style.background = 'var(--panel)';
        document.body.append(reference);
        const matches = s.backgroundColor === getComputedStyle(reference).backgroundColor;
        reference.remove();
        return matches;
      }),
    ).toBe(true);
  }
  await panel.getByRole('textbox', { name: 'Palette name', exact: true }).fill('My Nord');
  await panel.getByRole('textbox', { name: 'Background hex', exact: true }).fill('#182838');
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--md-sys-color-surface'),
      ),
    )
    .toBe('#182838');
  expect(
    JSON.parse((await page.evaluate(() => localStorage.getItem('branchboard.appearance.v1')))!)
      .custom,
  ).toEqual([]);
  await panel.getByRole('button', { name: 'Save palette', exact: true }).click();
  await page.reload();
  panel = await openAppearance(page);
  await expect(
    panel.getByLabel('UI palette', { exact: true }).locator('option:checked'),
  ).toHaveText('My Nord');
  await panel.getByRole('button', { name: 'Edit palette', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Palette name', exact: true }).fill('My Nord renamed');
  await panel.getByRole('button', { name: 'Save palette', exact: true }).click();
  await panel.getByRole('button', { name: 'Duplicate palette', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Palette name', exact: true }).fill('My second Nord');
  await panel.getByRole('button', { name: 'Save palette', exact: true }).click();
  await expect(
    panel
      .getByLabel('UI palette', { exact: true })
      .locator('optgroup[label="Your palettes"] option'),
  ).toHaveCount(2);
  await panel.getByRole('button', { name: 'Edit palette', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Text hex', exact: true }).fill('#182838');
  await expect(panel.locator('.palette-contrast-warning')).toContainText('Low contrast');
  await panel.getByRole('button', { name: 'Reset Text', exact: true }).click();
  await expect(panel.locator('.palette-contrast-warning')).toHaveCount(0);
  const background = panel.getByRole('textbox', { name: 'Background hex', exact: true });
  await background.fill('#bad');
  await panel.getByRole('button', { name: 'Reset Background', exact: true }).click();
  await expect(background).toHaveValue('#182838');
  await background.fill('#bad');
  await panel.getByRole('button', { name: 'Reset colors', exact: true }).click();
  await expect(background).toHaveValue('#182838');
  await panel.getByRole('textbox', { name: 'Background hex', exact: true }).fill('#112233');
  await page.keyboard.press('Escape');
  const guard = page.getByRole('alert', { name: 'Unsaved changes' });
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await panel.getByRole('button', { name: 'Revert preview', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--md-sys-color-surface'),
      ),
    )
    .toBe('#182838');
  await panel.getByRole('button', { name: 'Delete palette', exact: true }).click();
  await panel.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(panel.getByLabel('UI palette', { exact: true })).toHaveValue('default');
  await expect(
    panel
      .getByLabel('UI palette', { exact: true })
      .locator('optgroup[label="Your palettes"] option'),
  ).toHaveCount(1);
  await panel.getByLabel('UI palette', { exact: true }).selectOption({ label: 'My Nord renamed' });
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--md-sys-color-surface'),
      ),
    )
    .toBe('#182838');
});

test('mobile palette editing remains bounded and discarded previews restore saved colors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/');
  const panel = await openAppearance(page);
  await panel.getByLabel('UI palette', { exact: true }).selectOption('catppuccin');
  const before = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--md-sys-color-surface'),
  );
  await panel.getByRole('button', { name: 'Customize palette', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Background hex', exact: true }).fill('#122334');
  await page.keyboard.press('Escape');
  await page
    .getByRole('alert', { name: 'Unsaved changes' })
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--md-sys-color-surface'),
      ),
    )
    .toBe(before);
  await openAppearance(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('flat model dropdown preserves legacy IDs, saves manual IDs and exposes provider logos without requests', async ({
  page,
}) => {
  const providers = providerIds.map((id) => ({
    id,
    name: providerDefinitions[id].name,
    baseURL: providerDefinitions[id].baseURL,
    configured: id === 'openai' || id === 'custom',
    hasKey: id === 'openai' || id === 'custom',
    models: ['old-automatic-model'],
    extraModels: id === 'openai' ? ['saved-extra'] : [],
    defaultModel: 'saved-legacy-model',
  }));
  let paidCalls = 0;
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { configured: true, model: 'saved-legacy-model', providers } }),
  );
  await page.route('**/api/models/catalog*', (route) =>
    route.fulfill({
      json: {
        version: 2,
        providers: {
          openai: { models: ['gpt-6.1-sol'], source: 'models.dev', updatedAt: Date.now() },
        },
      },
    }),
  );
  await page.route('**/api/chat', (route) => {
    paidCalls++;
    return route.abort();
  });
  await page.route('**/api/providers/*/test-model', (route) => {
    paidCalls++;
    return route.abort();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  const trigger = page.locator('.react-flow__node-chat.selected .model-selector');
  await trigger.click();
  const popup = page.getByRole('dialog', { name: 'Model selector', exact: true });
  await expect(popup.getByRole('group')).toHaveCount(0);
  await expect(
    popup.getByRole('option', { name: 'old-automatic-model · OpenAI', exact: true }),
  ).toHaveCount(0);
  await expect(
    popup.getByRole('option', { name: 'saved-legacy-model · OpenAI', exact: true }),
  ).toBeVisible();
  await expect(
    popup
      .getByRole('option', { name: 'gpt-6.1-sol · OpenAI', exact: true })
      .locator('.provider-icon'),
  ).toHaveCount(1);
  await popup.getByRole('combobox', { name: 'Search models' }).fill('gpt-6.1-sol');
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText('gpt-6.1-sol');
  await trigger.click();
  await popup.getByRole('button', { name: 'Add model by ID…', exact: true }).click();
  await expect(popup.getByRole('textbox', { name: 'Exact model ID', exact: true })).toBeFocused();
  await popup
    .getByRole('combobox', { name: 'Custom model provider', exact: true })
    .selectOption('custom');
  await popup
    .getByRole('textbox', { name: 'Exact model ID', exact: true })
    .fill('my/specific-old-model');
  await popup.getByRole('button', { name: 'Use custom model', exact: true }).click();
  await expect(trigger.locator('[data-provider="fallback"]')).toHaveCount(1);
  await page.reload();
  const savedTrigger = page
    .locator('.react-flow__node-chat .model-selector')
    .filter({ hasText: 'my/specific-old-model' });
  await expect(savedTrigger).toBeVisible();
  await savedTrigger.click();
  await expect(
    popup.getByRole('option', { name: 'my/specific-old-model · Custom endpoint', exact: true }),
  ).toBeVisible();
  await expect(
    popup
      .getByRole('option', { name: 'my/specific-old-model · Custom endpoint', exact: true })
      .locator('[data-provider="fallback"]'),
  ).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(savedTrigger).toBeFocused();
  expect(paidCalls).toBe(0);
});
