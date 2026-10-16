import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { command } from './helpers';

async function setup(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('branchboard.workspace.v1')) return;
    localStorage.setItem(
      'branchboard.workspace.v1',
      JSON.stringify({
        currentId: 'research',
        boards: ['research', 'planning'].map((id) => ({
          id,
          name: id === 'research' ? 'Research' : 'Planning',
          updatedAt: 1,
          edges: [],
          nodes: [
            {
              id: `${id}-chat`,
              type: 'chat',
              position: { x: 100, y: 100 },
              data: {
                title: 'Saved conversation',
                color: 'lavender',
                note: '',
                messages: [
                  { id: 'question', role: 'user', content: 'Test research question' },
                  { id: 'answer', role: 'assistant', content: 'Test-only stored answer' },
                ],
              },
              style: { width: 380, height: 400 },
            },
          ],
        })),
      }),
    );
  });
  await page.goto('/');
  await expect(page.locator('.messages')).toContainText('Test research question');
}
async function open(page: Page, name: string) {
  await page.locator('.canvas-area').click({ position: { x: 10, y: 10 } });
  await command(page, name);
  return page.getByRole('region', { name, exact: true });
}
async function createFolder(page: Page, name: string, parent?: string) {
  const dialog = page.getByRole('region', { name: 'Projects & folders' });
  await dialog.getByLabel('Project or folder name', { exact: true }).fill(name);
  if (parent)
    await dialog
      .getByLabel('Parent project or folder', { exact: true })
      .selectOption({ label: parent });
  await dialog.getByRole('button', { name: 'Create project / folder', exact: true }).click();
  await expect(
    dialog.getByRole('region', {
      name: `Folder ${parent ? `${parent} / ` : ''}${name}`,
      exact: true,
    }),
  ).toBeVisible();
}
async function workspace(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('branchboard.workspace.v1')!));
}

test('projects and nested folders filter canvases, persist, rename and remove without deleting work', async ({
  page,
}) => {
  await setup(page);
  const projects = await open(page, 'Projects & folders');
  await createFolder(page, 'Work');
  await createFolder(page, 'Sources', 'Work');
  await projects.getByLabel('Current canvas folder').selectOption({ label: 'Work / Sources' });
  await page.keyboard.press('Escape');
  const filter = page.getByLabel('Filter canvases by project or folder');
  await filter.selectOption({ label: 'Work' });
  await expect(page.locator('.board-link:not(.new-board)')).toHaveCount(1);
  await expect(page.locator('.board-link.active')).toContainText('Research');
  await filter.selectOption({ label: 'Unfiled' });
  await expect(page.locator('.board-link:not(.new-board)')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Planning', exact: true })).toBeVisible();
  await open(page, 'Projects & folders');
  const folder = projects.getByRole('region', { name: 'Folder Work / Sources', exact: true });
  await folder.getByLabel('Rename Sources', { exact: true }).fill('Reading');
  await folder.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(projects.getByLabel('Current canvas folder').locator('option:checked')).toHaveText(
    'Work / Reading',
  );
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await workspace(page)).organization?.folders[1]?.name)
    .toBe('Reading');
  await page.reload();
  await open(page, 'Projects & folders');
  await projects
    .getByLabel('Parent project or folder', { exact: true })
    .selectOption({ label: 'Work' });
  const project = projects.getByRole('region', { name: 'Folder Work', exact: true });
  await project.getByRole('button', { name: 'Remove folder', exact: true }).click();
  await expect(project.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await project.getByRole('button', { name: 'Confirm remove folder', exact: true }).click();
  await expect(projects.getByRole('region')).toHaveCount(0);
  await expect(projects.getByLabel('Current canvas folder')).toHaveValue('');
  await expect(projects.getByLabel('Parent project or folder', { exact: true })).toHaveValue('');
  await projects.getByLabel('Project or folder name', { exact: true }).fill('Replacement');
  await projects.getByRole('button', { name: 'Create project / folder', exact: true }).click();
  await expect(
    projects.getByRole('region', { name: 'Folder Replacement', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.messages')).toContainText('Test-only stored answer');
  await expect(page.locator('.board-link:not(.new-board)')).toHaveCount(2);
});

test('favorites filter and command actions survive reload and work on the mobile rail', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: 'Research', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Favorite', exact: true }).click();
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(page.locator('.board-link:not(.new-board)')).toHaveCount(1);
  await page.getByRole('button', { name: 'Research', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Unfavorite', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await workspace(page)).organization?.favoriteBoardIds)
    .toEqual(['research']);
  await page.reload();
  await page.getByRole('button', { name: 'Research', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Unfavorite', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'Unfavorite current canvas');
  await expect.poll(async () => (await workspace(page)).organization?.favoriteBoardIds).toEqual([]);
  await open(page, 'Favorite current canvas');
  const templates = await open(page, 'Canvas templates');
  await expect(templates.getByLabel('Template name', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(templates.getByRole('button', { name: 'Back to canvas' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(templates).not.toBeVisible();
  await expect
    .poll(async () => (await workspace(page)).organization?.favoriteBoardIds)
    .toEqual(['research']);
});

test('templates opt in to history, create independent canvases, rename and delete without AI requests', async ({
  page,
}) => {
  await setup(page);
  let requests = 0;
  await page.route('**/api/chat', async (route) => {
    requests++;
    await route.abort();
  });
  const templates = await open(page, 'Canvas templates');
  await templates.getByLabel('Template name', { exact: true }).fill('Clean workflow');
  await templates.getByRole('button', { name: 'Save template', exact: true }).click();
  const clean = templates.getByRole('region', { name: 'Template Clean workflow', exact: true });
  await expect(clean).toContainText('0 messages');
  await templates.getByLabel('Template name', { exact: true }).fill('With saved history');
  await templates.getByRole('checkbox', { name: 'Include saved conversation messages' }).check();
  await templates.getByRole('button', { name: 'Save template', exact: true }).click();
  const history = templates.getByRole('region', {
    name: 'Template With saved history',
    exact: true,
  });
  await expect(history).toContainText('2 messages');
  await clean.getByLabel('Rename template Clean workflow', { exact: true }).fill('Blank workflow');
  await clean.getByRole('button', { name: 'Rename', exact: true }).click();
  await templates
    .getByRole('region', { name: 'Template Blank workflow', exact: true })
    .getByRole('button', { name: 'Create canvas from template' })
    .click();
  await expect(page.locator('.messages')).not.toContainText('Test research question');
  await expect(page.locator('.breadcrumbs > input')).toHaveValue('Blank workflow');
  await expect.poll(async () => (await workspace(page)).boards.length).toBe(3);
  const first = (await workspace(page)).currentId;
  await open(page, 'Canvas templates');
  await history.getByRole('button', { name: 'Create canvas from template' }).click();
  await expect(page.locator('.messages')).toContainText('Test-only stored answer');
  await expect.poll(async () => (await workspace(page)).boards.length).toBe(4);
  expect((await workspace(page)).currentId).not.toBe(first);
  const saved = await workspace(page);
  expect(
    new Set(saved.boards.flatMap((b: { nodes: { id: string }[] }) => b.nodes.map((n) => n.id)))
      .size,
  ).toBe(4);
  await page.reload();
  await open(page, 'Canvas templates');
  await history.getByRole('button', { name: 'Delete template', exact: true }).click();
  await expect(history.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await history.getByRole('button', { name: 'Confirm delete template', exact: true }).click();
  await expect(templates.getByRole('region')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.messages')).toContainText('Test-only stored answer');
  expect(requests).toBe(0);
});

test('workspace backup round trip remaps folders, favorites and templates while retaining originals', async ({
  page,
}) => {
  await setup(page);
  const projects = await open(page, 'Projects & folders');
  await createFolder(page, 'Work');
  await projects.getByLabel('Current canvas folder').selectOption({ label: 'Work' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Research', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Favorite', exact: true }).click();
  const templates = await open(page, 'Canvas templates');
  await templates.getByLabel('Template name', { exact: true }).fill('Reusable');
  await templates.getByRole('button', { name: 'Save template', exact: true }).click();
  await page.keyboard.press('Escape');
  const backups = await open(page, 'Backups & snapshots');
  const downloadPromise = page.waitForEvent('download');
  await backups.getByRole('button', { name: 'Export workspace backup', exact: true }).click();
  const download = await downloadPromise;
  const buffer = await readFile((await download.path())!);
  const saved = JSON.parse(buffer.toString());
  expect(saved.organization.folders).toHaveLength(1);
  expect(saved.organization.templates).toHaveLength(1);
  await page.keyboard.press('Escape');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'workspace.json', mimeType: 'application/json', buffer });
  await expect.poll(async () => (await workspace(page)).boards.length).toBe(4);
  const restored = await workspace(page);
  const o = restored.organization;
  expect(o.folders).toHaveLength(2);
  expect(o.templates).toHaveLength(2);
  expect(o.folders[0].id).not.toBe(o.folders[1].id);
  expect(o.templates[0].board.nodes[0].id).not.toBe(o.templates[1].board.nodes[0].id);
  expect(o.favoriteBoardIds).toEqual(['research', restored.currentId]);
  expect(o.boardFolders[restored.currentId]).toBe(o.folders[1].id);
  await open(page, 'Canvas templates');
  await templates.getByLabel('Template destination folder').selectOption(o.folders[1].id);
  await templates
    .getByRole('region', { name: 'Template Reusable', exact: true })
    .last()
    .getByRole('button', { name: 'Create canvas from template' })
    .click();
  await expect
    .poll(async () => {
      const w = await workspace(page);
      return w.organization.boardFolders[w.currentId];
    })
    .toBe(o.folders[1].id);
});
