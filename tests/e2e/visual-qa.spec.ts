import { expect, test } from '@playwright/test';
import { command, emptyCanvasPoint } from './helpers';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 800, height: 700 },
  { width: 390, height: 844 },
]) {
  test(`keeps fitted nodes clear of workspace controls at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.react-flow__node')).toHaveCount(3);
    if (viewport.width === 390) {
      await expect
        .poll(async () =>
          Number(
            (
              await page.getByRole('button', { name: 'Reset zoom', exact: true }).innerText()
            ).replace('%', ''),
          ),
        )
        .toBeGreaterThanOrEqual(75);
      await page.getByRole('button', { name: 'Fit canvas', exact: true }).click();
    }
    await expect
      .poll(() =>
        page.evaluate(() => {
          const flow = document.querySelector('.react-flow')!.getBoundingClientRect();
          const controls = document.querySelector('.canvas-bottom')!.getBoundingClientRect();
          const tools = document.querySelector('.board-tools')!.getBoundingClientRect();
          const bar = document.querySelector('.message-bar')!.getBoundingClientRect();
          return (
            bar.bottom <= flow.bottom &&
            bar.left >= flow.left &&
            bar.right <= flow.right &&
            flow.right <= innerWidth &&
            [...document.querySelectorAll('.react-flow__node')].every((node) => {
              const rect = node.getBoundingClientRect();
              return (
                rect.left >= flow.left &&
                rect.right <= flow.right &&
                rect.top >= tools.bottom &&
                rect.bottom <= controls.top
              );
            }) &&
            document.documentElement.scrollWidth <= innerWidth
          );
        }),
      )
      .toBe(true);
    await command(page, 'Theme: dark');
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
}

test('repeated additions do not overlap and empty palettes omit unavailable actions', async ({
  page,
}) => {
  await page.goto('/');
  await command(page, 'New canvas');
  await page.getByRole('button', { name: 'Open command palette' }).click();
  for (const name of [
    'Undo',
    'Redo',
    'Group selection',
    'Duplicate selection',
    'Delete selection',
    'Fit canvas',
    'Auto-arrange nodes',
    'Switch canvas: Untitled canvas',
  ]) {
    await expect(page.getByRole('option', { name, exact: true })).toHaveCount(0);
  }
  await page.keyboard.press('Escape');
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  expect(
    await page.locator('.react-flow__node').evaluateAll((nodes) =>
      nodes.every((node, i) => {
        const a = node.getBoundingClientRect();
        return nodes.slice(i + 1).every((other) => {
          const b = other.getBoundingClientRect();
          return a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top;
        });
      }),
    ),
  ).toBe(true);
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await expect(page.locator('.react-flow__node .composer')).toHaveCount(0);
  await page.locator('.react-flow__pane').click({ position: await emptyCanvasPoint(page) });
  await page.getByRole('button', { name: 'Open command palette' }).click();
  const search = page.getByRole('combobox', { name: 'Search commands and nodes' });
  for (let i = 0; i < 18; i++) await search.press('ArrowDown');
  const selected = page.getByRole('listbox').getByRole('option', { selected: true });
  await expect(selected).toBeInViewport();
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    (await selected.getAttribute('id')) as string,
  );
});

test('whole-node menus support keys, empty context, and visible note colors', async ({ page }) => {
  await page.goto('/');
  await command(page, 'New canvas');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  const chat = page.locator('.react-flow__node-chat');
  await chat.locator('.empty-conversation').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Node actions' });
  await expect(menu.getByRole('group', { name: 'Note color' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Branch conversation' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Delete selection' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  const context = page.getByRole('dialog', { name: 'What the AI sees' });
  await expect(context).toContainText('No messages yet.');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  const note = page.locator('.react-flow__node-note .board-node');
  await page
    .locator('.react-flow__node-note')
    .getByRole('button', { name: 'Node actions' })
    .click();
  await page.getByRole('button', { name: 'Color sage', exact: true }).click();
  await expect(note).toHaveClass(/color-sage/);
  await page
    .locator('.react-flow__node-note')
    .getByRole('button', { name: 'Node actions' })
    .click();
  await expect(page.getByRole('button', { name: 'Color sage', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('mobile model search and menus stay bounded and handle no matches', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await command(page, 'New canvas');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await page.getByRole('button', { name: /^Select model:/ }).click();
  const selector = page.getByRole('dialog', { name: 'Model selector', exact: true });
  const box = await selector.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(8);
  expect(box!.x + box!.width).toBeLessThanOrEqual(382);
  expect(box!.y).toBeGreaterThanOrEqual(8);
  expect(box!.y + box!.height).toBeLessThanOrEqual(836);
  await selector.getByRole('textbox', { name: 'Search models' }).fill('no-such-model-qa');
  await expect(selector.getByRole('status')).toHaveText('No matching models.');
  await page.keyboard.press('Shift+Tab');
  await expect(
    selector.getByRole('button', { name: 'Manage providers', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Select model:/ })).toBeFocused();
  await page.getByRole('button', { name: 'Node actions', exact: true }).click();
  const menuBox = await page.getByRole('menu').boundingBox();
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(382);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(836);
});

test('mobile settings exposes Save and closes even if focus leaves a busy form', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  const save = dialog.getByRole('button', { name: 'Save settings', exact: true });
  const dialogBox = await dialog.boundingBox();
  const saveBox = await save.boundingBox();
  expect(saveBox!.y).toBeGreaterThanOrEqual(dialogBox!.y);
  expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(dialogBox!.y + dialogBox!.height);
  // Disabling a focused button during a request can send focus back to the body.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
