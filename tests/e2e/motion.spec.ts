import { expect, test } from '@playwright/test';
import { providerDefinitions, providerIds } from '../../src/providers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        configured: true,
        model: 'gpt-6.1-sol',
        providers: providerIds.map((id) => ({
          id,
          name: providerDefinitions[id].name,
          configured: id === 'openai',
          hasKey: id === 'openai',
          baseURL: providerDefinitions[id].baseURL,
          models: [],
          extraModels: [],
          defaultModel: id === 'openai' ? 'gpt-6.1-sol' : '',
        })),
      },
    }),
  );
  await page.route('**/api/models/catalog*', (route) =>
    route.fulfill({ json: { version: 2, providers: {} } }),
  );
});

for (const width of [1440, 390]) {
  test(`panels animate entrance and exit without retaining focus or blocking the canvas at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/');
    const opener = page.getByRole('button', { name: 'Models', exact: true });
    await opener.focus();
    const enter = await opener.evaluate((button) => {
      (button as HTMLElement).click();
      return new Promise<{ count: number; duration: string; opacity: number }>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const panel = document.querySelector<HTMLElement>('.workspace-panel-content')!;
            resolve({
              count: panel.getAnimations().length,
              duration: getComputedStyle(panel).transitionDuration,
              opacity: Number(getComputedStyle(panel).opacity),
            });
          }),
        ),
      );
    });
    expect(enter.count).toBeGreaterThan(0);
    expect(enter.duration).toContain(width === 390 ? '0.65s' : '0.5s');
    expect(enter.opacity).toBeLessThan(1);
    const panel = page.getByRole('region', { name: 'Models', exact: true });
    await expect(panel).toBeVisible();
    const exit = await panel
      .getByRole('button', { name: 'Back to canvas', exact: true })
      .evaluate((button) => {
        (button as HTMLElement).click();
        return new Promise<{
          inert: boolean;
          hidden: string | null;
          role: string | null;
          hit: boolean;
          count: number;
        }>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const closing = document.querySelector<HTMLElement>(
                '.workspace-panel-content[data-motion-state="closing"]',
              )!;
              const host = document.getElementById('workspace-panel-host')!;
              const area = document.querySelector('.canvas-area')!.getBoundingClientRect();
              const hit = document.elementFromPoint(area.x + 4, area.y + 4);
              resolve({
                inert: closing.inert,
                hidden: closing.getAttribute('aria-hidden'),
                role: closing.querySelector('.docked-panel')!.getAttribute('role'),
                hit: host.contains(hit),
                count: closing.getAnimations().length,
              });
            }),
          ),
        );
      });
    expect(exit).toMatchObject({ inert: true, hidden: 'true', role: null, hit: false });
    expect(exit.count).toBeGreaterThan(0);
    await expect(opener).toBeFocused();
    await expect(page.locator('.workspace-panel-content')).toHaveCount(0);
    await expect(page.locator('.workspace-main')).not.toHaveAttribute('inert');
  });
}

test('rapid reopening does not revive a discarded provider-key draft or an old exit timer', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByLabel('API key', { exact: true }).fill('motion-unsaved-fixture');
  await page.getByRole('button', { name: 'Back to canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).evaluate((button) => {
    (button as HTMLElement).click();
    return new Promise<void>((resolve) =>
      requestAnimationFrame(() => {
        Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
          .find(
            (el) =>
              el.getAttribute('aria-label') === 'Models' || el.textContent?.trim() === 'Models',
          )!
          .click();
        resolve();
      }),
    );
  });
  await expect(page.getByRole('region', { name: 'Models', exact: true })).toBeVisible();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await page.waitForTimeout(350);
  await expect(page.getByRole('region', { name: 'Models', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'motion-unsaved-fixture',
  );
});

test('menus and model dropdowns fade out inertly and stay bounded at the viewport edge', async ({
  page,
}) => {
  await page.goto('/');
  const row = page.getByRole('navigation', { name: 'Boards' }).locator('.board-link').first();
  await row.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: /^Canvas actions:/ });
  await expect(menu).toHaveCSS(
    'transition-timing-function',
    /cubic-bezier\(0\.31, 0\.94, 0\.34, 1\), cubic-bezier\(0\.42, 1\.67, 0\.21, 0\.9\)/,
  );
  const close = await menu.evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return new Promise<boolean>((resolve) =>
      requestAnimationFrame(() => {
        const closing = document.querySelector<HTMLElement>(
          '.context-menu[data-motion-state="closing"]',
        );
        resolve(
          Boolean(
            closing?.inert &&
            closing.getAttribute('role') === null &&
            closing.getAttribute('aria-hidden') === 'true',
          ),
        );
      }),
    );
  });
  expect(close).toBe(true);
  await expect(row).toBeFocused();
  await expect(page.locator('.context-menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByRole('button', { name: /^Default model:/ }).click();
  const dropdown = page.getByRole('dialog', { name: 'Model selector', exact: true });
  const bounds = (await dropdown.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(952);
  await dropdown.getByRole('combobox', { name: 'Search models' }).press('Escape');
  await expect(page.getByRole('dialog', { name: 'Model selector' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Models', exact: true })).toBeVisible();
});

test('canvas actions menu does not steal focus back after its visual exit finishes', async ({
  page,
}) => {
  await page.goto('/');
  const row = page
    .getByRole('navigation', { name: 'Boards', exact: true })
    .locator('.board-link')
    .first();
  await row.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu', { name: /^Canvas actions:/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
  await expect(page.locator('.context-menu')).toHaveCount(0);
  // The deferred fallback must run at logical close only, never at the final
  // unmount after the exit, where it could pull focus away from the canvas.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
});

test('toolbar reversals keep closed controls inert and never change graph coordinates', async ({
  page,
}) => {
  await page.goto('/');
  const viewport = page.locator('.react-flow__viewport');
  await expect(page.locator('.board-node')).toHaveCount(3);
  await page.waitForTimeout(300);
  const before = await viewport.getAttribute('style');
  const expand = page.getByRole('button', { name: 'Expand creation tools', exact: true });
  const sample = await expand.evaluate((button) => {
    (button as HTMLElement).click();
    return new Promise<{ width: number; target: number; easing: string }>((resolve, reject) => {
      let frames = 0;
      const sample = () => {
        const extra = document.querySelector<HTMLElement>('.creation-extra')!;
        const animation = extra
          .getAnimations()
          .find((a) => a instanceof CSSTransition && a.transitionProperty === 'width');
        if (!animation) {
          if (++frames > 120) return reject(new Error('Toolbar width transition did not start.'));
          requestAnimationFrame(sample);
          return;
        }
        animation.pause();
        animation.currentTime = Number(animation.effect!.getTiming().duration) / 2;
        resolve({
          width: extra.getBoundingClientRect().width,
          target: extra.querySelector<HTMLElement>('.creation-extra-inner')!.scrollWidth,
          easing: getComputedStyle(extra).transitionTimingFunction,
        });
        animation.play();
      };
      requestAnimationFrame(sample);
    });
  });
  expect(sample.width).toBeGreaterThan(0);
  expect(sample.width).toBeGreaterThan(sample.target);
  expect(sample.easing).toContain('cubic-bezier(0.42, 1.67, 0.21, 0.9)');
  await page
    .getByRole('button', { name: 'Collapse creation tools', exact: true })
    .evaluate((button) => (button as HTMLElement).click());
  await expect(page.locator('.creation-extra')).toHaveAttribute('inert');
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeHidden();
  await expand.evaluate((button) => (button as HTMLElement).click());
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeVisible();
  await expect(viewport).toHaveAttribute('style', before!);
  const outer = await page
    .locator('.react-flow__node')
    .first()
    .evaluate((el) => ({
      property: getComputedStyle(el).transitionProperty,
      duration: getComputedStyle(el).transitionDuration,
    }));
  if (/transform|all/.test(outer.property))
    expect(outer.duration.split(',').every((value) => parseFloat(value) === 0)).toBe(true);
  await expect(page.locator('.board-node').first()).toHaveCSS(
    'animation-timing-function',
    /cubic-bezier/,
  );
});

test('closing a panel aborts an explicit fixture model test before its visual exit completes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const state = window as typeof window & { motionAbortCount?: number };
    state.motionAbortCount = 0;
    window.fetch = (input, init) => {
      if (String(input).endsWith('/api/providers/openai/test-model'))
        return new Promise((_resolve, reject) =>
          init?.signal?.addEventListener(
            'abort',
            () => {
              state.motionAbortCount!++;
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          ),
        );
      return original(input, init);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByRole('button', { name: 'Test model', exact: true }).click();
  const sample = await page
    .getByRole('button', { name: 'Back to canvas', exact: true })
    .evaluate((button) => {
      (button as HTMLElement).click();
      return new Promise<{ count: number; closing: boolean }>((resolve) =>
        requestAnimationFrame(() => {
          resolve({
            count: (window as typeof window & { motionAbortCount: number }).motionAbortCount,
            closing: Boolean(
              document.querySelector('.workspace-panel-content[data-motion-state="closing"]'),
            ),
          });
        }),
      );
    });
  expect(sample).toEqual({ count: 1, closing: true });
});

test('reduced motion skips presence delays and running animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  expect(
    await page.locator('.workspace-panel-content').evaluate((el) => el.getAnimations().length),
  ).toBe(0);
  const remaining = await page
    .getByRole('button', { name: 'Back to canvas', exact: true })
    .evaluate((button) => {
      (button as HTMLElement).click();
      return new Promise<number>((resolve) =>
        requestAnimationFrame(() =>
          resolve(document.querySelectorAll('.workspace-panel-content').length),
        ),
      );
    });
  expect(remaining).toBe(0);
  await page
    .getByRole('navigation', { name: 'Boards' })
    .locator('.board-link')
    .first()
    .click({ button: 'right' });
  expect(
    await page
      .getByRole('menu', { name: /^Canvas actions:/ })
      .evaluate((el) => el.getAnimations().length),
  ).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.context-menu')).toHaveCount(0);
});
