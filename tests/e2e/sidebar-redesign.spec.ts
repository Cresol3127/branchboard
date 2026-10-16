import { expect, test } from '@playwright/test';
import { providerDefinitions, providerIds } from '../../src/providers';
import { command } from './helpers';
const workspace = {
  currentId: 'first',
  boards: [
    {
      id: 'first',
      name: 'First canvas',
      updatedAt: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      edges: [],
      nodes: ['a', 'b'].map((id, i) => ({
        id,
        type: 'chat',
        position: { x: 40 + i * 370, y: 130 },
        style: { width: 300, height: 240 },
        data: {
          title: `Legacy ${id}`,
          note: '',
          color: 'purple',
          messages: [{ id: `${id}-q`, role: 'user', content: `Question ${id}` }],
        },
      })),
    },
    { id: 'second', name: 'Second canvas', updatedAt: 0, nodes: [], edges: [] },
  ],
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('branchboard.workspace.v1'))
      localStorage.setItem('branchboard.workspace.v1', JSON.stringify(value));
  }, workspace);
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        configured: true,
        model: 'gpt-4o-mini',
        providers: providerIds.map((id) => ({
          id,
          name: providerDefinitions[id].name,
          configured: id === 'openai',
          hasKey: id === 'openai',
          baseURL: providerDefinitions[id].baseURL,
          models: providerDefinitions[id].models,
          extraModels: [],
          defaultModel: providerDefinitions[id].models[0] || '',
        })),
      },
    }),
  );
  await page.route('**/api/models/catalog*', (route) =>
    route.fulfill({ json: { version: 2, providers: {} } }),
  );
});
for (const width of [1440, 390]) {
  test(`docked panels preserve graph and drafts, guard unsaved keys, and use real model-test results at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/');
    const input = page.getByRole('textbox', { name: 'Message', exact: true });
    await input.fill('Keep my unsent draft');
    const transform = await page.locator('.react-flow__viewport').getAttribute('style');
    await expect(page.getByText('Autosave enabled', { exact: true })).toHaveCount(0);
    await expect(page.locator('.ai-status, .workspace-token-counts, .canvas-caption')).toHaveCount(
      0,
    );
    await expect(page.locator('.node-title')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Models', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Models', exact: true });
    await expect(panel).toBeVisible();
    expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(transform);
    const rect = (await panel.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(width === 390 ? 64 : 256);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    await panel.getByLabel('API key', { exact: true }).fill('unsaved-fixture-only');
    await page.getByRole('button', { name: 'Tips & shortcuts', exact: true }).click();
    await expect(page.getByRole('alert', { name: 'Unsaved changes' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(panel.getByLabel('API key', { exact: true })).toHaveValue('unsaved-fixture-only');
    await panel.getByRole('button', { name: 'Back to canvas', exact: true }).click();
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(input).toHaveValue('Keep my unsent draft');
    expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(transform);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
      'unsaved-fixture-only',
    );
    let tests = 0;
    await page.route('**/api/providers/openai/test-model', async (route) => {
      tests++;
      expect(route.request().postDataJSON()).toEqual({ model: 'gpt-4o-mini' });
      await route.fulfill({
        json: { status: 'passed', text: 'Test fixture transport result', elapsedMs: 12 },
      });
    });
    await page.getByRole('button', { name: 'Models', exact: true }).click();
    await panel.getByRole('button', { name: 'Test model', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('Test fixture transport result');
    expect(tests).toBe(1);
    await panel.getByRole('button', { name: 'Back to canvas', exact: true }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    await expect(input).toHaveValue('Keep my unsent draft');
  });
}
test('Ctrl-drag selects a rectangle without creating containers; Space overrides selection and Shift-click toggles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.keyboard.down('Control');
  await page.mouse.move(pane.x + 20, pane.y + 110);
  await page.mouse.down();
  await page.mouse.move(pane.x + 760, pane.y + 390, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await expect(page.locator('.react-flow__node-group')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  const a = (await page.locator('[data-id="a"]').boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.click(a.x + 5, a.y + a.height - 24);
  await page.keyboard.up('Shift');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  const before = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.keyboard.down('Control');
  await page.keyboard.down('Space');
  await page.mouse.move(pane.x + 25, pane.y + 60);
  await page.mouse.down();
  await page.mouse.move(pane.x + 90, pane.y + 85, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await page.keyboard.up('Control');
  await expect(page.locator('.react-flow__viewport')).not.toHaveAttribute('style', before!);
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search commands and nodes' }).fill('Group selection');
  await expect(page.getByRole('option', { name: 'Group selection', exact: true })).toHaveCount(0);
});
test('numbering follows creation order and deleting an inactive canvas preserves active undo, viewport and draft', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.canvas-number')).toHaveText(['1', '2']);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Do not lose this');
  const before = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.getByRole('button', { name: 'Second canvas', exact: true }).click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Canvas actions: Second canvas', exact: true })
    .getByRole('menuitem', { name: 'Delete', exact: true })
    .click();
  await page
    .getByRole('region', { name: 'Delete canvas', exact: true })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Canvas name' })).toHaveValue('First canvas');
  await expect(input).toHaveValue('Do not lose this');
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', before!);
  await expect(page.getByRole('button', { name: 'Second canvas', exact: true })).toHaveCount(0);
});

for (const width of [1440, 390]) {
  test(`collapsed canvas context menus keep numbers clear and delete inactive canvases safely at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.addInitScript(() => {
      localStorage.setItem('branchboard.sidebarCollapsed', 'true');
      localStorage.setItem('branchboard.theme', 'dark');
    });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Boards', exact: true });
    const first = nav.getByRole('button', { name: 'First canvas', exact: true });
    const input = page.getByRole('textbox', { name: 'Message', exact: true });
    await input.fill('Keep this rail draft');
    const transform = await page.locator('.react-flow__viewport').getAttribute('style');
    await first.focus();
    await expect(first).toHaveAttribute('aria-current', 'page');
    const number = (await first.locator('.canvas-number').boundingBox())!;
    const link = (await first.boundingBox())!;
    expect(link.width).toBe(44);
    expect(link.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(number.x + number.width / 2 - (link.x + link.width / 2))).toBeLessThan(1);
    await expect(nav.locator('.board-row > button:not(.board-link)')).toHaveCount(0);
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu', { name: 'Canvas actions: First canvas', exact: true });
    await expect(menu.getByRole('menuitem')).toHaveText(['Favorite', 'Move to project', 'Delete']);
    await expect(menu.getByRole('menuitem', { name: 'Favorite', exact: true })).toBeFocused();
    expect(await menu.locator('button > svg').count()).toBe(3);
    for (const action of await menu.getByRole('menuitem').all())
      expect(
        await action.evaluate((el) => (el as HTMLElement).offsetHeight),
      ).toBeGreaterThanOrEqual(44);
    const rect = (await menu.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(8);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width - 8);
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(first).toBeFocused();
    expect(
      await nav.evaluate((el) => el.scrollWidth === el.clientWidth && el.scrollLeft === 0),
    ).toBe(true);
    await nav.getByRole('button', { name: 'Second canvas', exact: true }).focus();
    await page.keyboard.press('Shift+F10');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const confirmation = page.getByRole('region', { name: 'Delete canvas', exact: true });
    await expect(confirmation).toContainText('Second canvas');
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(first).toHaveAttribute('aria-current', 'page');
    await expect(input).toHaveValue('Keep this rail draft');
    await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', transform!);
    expect(await nav.evaluate((el) => el.scrollWidth === el.clientWidth)).toBe(true);
  });
}

for (const width of [1440, 390]) {
  test(`canvas-menu deletion respects unsaved provider drafts and confirmation cancellation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/');
    const input = page.getByRole('textbox', { name: 'Message', exact: true });
    await input.fill('Keep this confirmation draft');
    const transform = await page.locator('.react-flow__viewport').getAttribute('style');
    await page.getByRole('button', { name: 'Models', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Models', exact: true });
    await panel.getByLabel('API key', { exact: true }).fill('unsaved-menu-fixture');
    const second = page.getByRole('button', { name: 'Second canvas', exact: true });
    await second.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('alert', { name: 'Unsaved changes' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Delete canvas', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(panel.getByLabel('API key', { exact: true })).toHaveValue('unsaved-menu-fixture');
    await second.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    const confirmation = page.getByRole('region', { name: 'Delete canvas', exact: true });
    await expect(confirmation).toContainText('Second canvas');
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(second).toBeVisible();
    await expect(page.getByRole('button', { name: 'First canvas', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(input).toHaveValue('Keep this confirmation draft');
    await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', transform!);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
      'unsaved-menu-fixture',
    );
  });
}

test('a long collapsed canvas list opens a bounded project menu with keyboard focus restoration', async ({
  page,
}) => {
  await page.addInitScript((base) => {
    localStorage.setItem('branchboard.sidebarCollapsed', 'true');
    localStorage.setItem(
      'branchboard.workspace.v1',
      JSON.stringify({
        ...base,
        organization: {
          folders: Array.from({ length: 30 }, (_, i) => ({
            id: `folder-${i}`,
            name: `Project ${i}`,
          })),
          boardFolders: {},
          favoriteBoardIds: [],
          templates: [],
        },
        boards: [
          ...base.boards,
          ...Array.from({ length: 24 }, (_, i) => ({
            id: `extra-${i}`,
            name: `Extra canvas ${i}`,
            updatedAt: i,
            nodes: [],
            edges: [],
          })),
        ],
      }),
    );
  }, workspace);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Boards', exact: true });
  const last = nav.getByRole('button', { name: 'Extra canvas 23', exact: true });
  await last.focus();
  expect(await nav.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await nav.evaluate((el) => el.scrollWidth === el.clientWidth)).toBe(true);
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Move to project', exact: true }).click();
  const menu = page.getByRole('menu', {
    name: 'Move canvas to project: Extra canvas 23',
    exact: true,
  });
  await expect(menu.getByRole('menuitem', { name: 'Back', exact: true })).toBeFocused();
  await expect(async () => {
    const rect = (await menu.boundingBox())!;
    expect(rect.y).toBeGreaterThanOrEqual(8);
    expect(rect.y + rect.height).toBeLessThanOrEqual(952);
  }).toPass();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitemradio', { name: 'Project 9', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(last).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Canvas name' })).toHaveValue('First canvas');
});

test('inactive canvas menu favorites and nested project moves persist without selecting the canvas', async ({
  page,
}) => {
  await page.addInitScript((base) => {
    localStorage.setItem(
      'branchboard.workspace.v1',
      JSON.stringify({
        ...base,
        organization: {
          folders: [
            { id: 'work', name: 'Work' },
            { id: 'sources', name: 'Sources', parentId: 'work' },
          ],
          boardFolders: {},
          favoriteBoardIds: [],
          templates: [],
        },
      }),
    );
  }, workspace);
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/')) writes++;
  });
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Pinned to First canvas');
  const transform = await page.locator('.react-flow__viewport').getAttribute('style');
  const undoCount = await page.getByRole('button', { name: 'Undo', exact: true }).count();
  const second = page.getByRole('button', { name: 'Second canvas', exact: true });
  await second.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Favorite', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('branchboard.workspace.v1')!).organization
            .favoriteBoardIds,
      ),
    )
    .toEqual(['second']);
  await second.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Unfavorite', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Move to project', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Work / Sources', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('branchboard.workspace.v1')!).organization.boardFolders
            .second,
      ),
    )
    .toBe('sources');
  await expect(page.getByRole('textbox', { name: 'Canvas name' })).toHaveValue('First canvas');
  await expect(input).toHaveValue('Pinned to First canvas');
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', transform!);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(undoCount);
  await second.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to project', exact: true }).click();
  await expect(
    page.getByRole('menuitemradio', { name: 'Work / Sources', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemradio', { name: 'Unfiled', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('branchboard.workspace.v1')!).organization.boardFolders
            .second,
      ),
    )
    .toBeUndefined();
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(page.locator('.canvas-number')).toHaveText(['2']);
  await second.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Unfavorite', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favorites', exact: true })).toBeFocused();
  await expect(input).toHaveValue('Pinned to First canvas');
  expect(writes).toBe(0);
});

test('touch long-press opens canvas actions without switching canvases or activating on release', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(
      (base) => localStorage.setItem('branchboard.workspace.v1', JSON.stringify(base)),
      workspace,
    );
    await page.goto('/');
    const second = page.getByRole('button', { name: 'Second canvas', exact: true });
    const rect = (await second.boundingBox())!;
    const session = await context.newCDPSession(page);
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    const menu = page.getByRole('menu', { name: 'Canvas actions: Second canvas', exact: true });
    await expect(menu).toBeVisible();
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByRole('button', { name: 'First canvas', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(second).toBeFocused();
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: point.x, y: point.y + 35 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(menu).toHaveCount(0);
    await second.tap();
    await expect(second).toHaveAttribute('aria-current', 'page');
  } finally {
    await context.close();
  }
});

for (const kind of ['template', 'snapshot'] as const) {
  test(`${kind} drafts stay pinned to their source canvas while the docked panel stays open`, async ({
    page,
  }) => {
    await page.goto('/');
    await command(page, kind === 'template' ? 'Canvas templates' : 'Backups & snapshots');
    const panel = page.getByRole('region', {
      name: kind === 'template' ? 'Canvas templates' : 'Backups & snapshots',
      exact: true,
    });
    const input = panel.getByRole('textbox', {
      name: kind === 'template' ? 'Template name' : 'Snapshot name for First canvas',
      exact: true,
    });
    await input.fill('Keep this source draft');
    await page.getByRole('button', { name: 'Second canvas', exact: true }).click();
    await expect(input).toHaveValue('Keep this source draft');
    const save = panel.getByRole('button', {
      name: kind === 'template' ? 'Save template' : 'Save snapshot',
      exact: true,
    });
    await expect(save).toBeDisabled();
    await panel.getByRole('button', { name: 'Return to source canvas', exact: true }).click();
    await expect(input).toHaveValue('Keep this source draft');
    await expect(save).toBeEnabled();
    await save.click();
    await expect(input).toHaveValue('');
    await expect
      .poll(() =>
        page.evaluate((type) => {
          const key = type === 'template' ? 'branchboard.workspace.v1' : 'branchboard.snapshots.v1';
          const saved = JSON.parse(localStorage.getItem(key) || 'null');
          const entries = type === 'template' ? saved?.organization?.templates : saved;
          return entries?.find(
            (entry: { name: string; board: { nodes: unknown[] } }) =>
              entry.name === 'Keep this source draft',
          )?.board.nodes.length;
        }, kind),
      )
      .toBe(2);
  });
}
