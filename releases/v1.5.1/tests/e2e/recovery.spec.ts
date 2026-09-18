import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { command } from './helpers';

const backup = {
  version: 1,
  board: {
    id: 'history',
    name: 'Branch review',
    updatedAt: 1,
    edges: [],
    nodes: [
      {
        id: 'source',
        type: 'chat',
        position: { x: 100, y: 100 },
        style: { width: 400, height: 540 },
        data: {
          title: 'Source conversation',
          color: 'purple',
          note: '',
          messages: [
            { id: 'first', role: 'user', content: 'First saved question' },
            { id: 'second', role: 'assistant', content: 'First saved reply' },
            { id: 'third', role: 'user', content: 'Later question must not leak' },
          ],
        },
      },
    ],
  },
};

async function importJSON(page: Page, value: unknown) {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
}
async function openBackups(page: Page) {
  await command(page, 'Backups & snapshots');
  return page.getByRole('dialog', { name: 'Backups & snapshots', exact: true });
}

test('historical branching uses only chosen turns, remains live, undoes, and persists', async ({
  page,
}) => {
  await page.goto('/');
  await importJSON(page, backup);
  const original = page.locator('.react-flow__node-chat').first();
  await original
    .locator('[data-message-id="second"]')
    .getByRole('button', { name: 'Branch from this message' })
    .click();
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(2);
  await command(page, 'Undo');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(1);
  await command(page, 'Redo');
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(2);
  const child = page.locator('.react-flow__node-chat').last();
  await child.getByRole('button', { name: 'Inspect AI context' }).click();
  let inspector = page.getByRole('dialog', { name: 'What the AI sees' });
  await expect(inspector.locator('.context-list')).toContainText('First saved reply');
  await expect(inspector.locator('.context-list')).not.toContainText('Later question');
  await page.keyboard.press('Escape');
  await command(page, 'Fit canvas');
  await original
    .locator('[data-message-id="first"]')
    .getByRole('button', { name: 'Edit message', exact: true })
    .click();
  const editor = page.getByRole('dialog', { name: 'Edit message', exact: true });
  await editor.getByRole('textbox').fill('Live corrected question');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('Live corrected question');
  await page.reload();
  await child.getByRole('button', { name: 'Inspect AI context' }).click();
  inspector = page.getByRole('dialog', { name: 'What the AI sees' });
  await expect(inspector.locator('.context-list')).toContainText('Live corrected question');
  await expect(inspector.locator('.context-list')).not.toContainText('Later question');
});

test('snapshots survive reload and canvas deletion, restore a new copy and confirm deletion safely', async ({
  page,
}) => {
  await page.goto('/');
  await importJSON(page, backup);
  let dialog = await openBackups(page);
  await dialog.getByLabel('Snapshot name for Branch review').fill('Before revision');
  await dialog.getByRole('button', { name: 'Save snapshot' }).click();
  await expect(dialog.getByRole('region', { name: 'Snapshot Before revision' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  page.once('dialog', (d) => d.accept());
  await command(page, 'Delete current canvas');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .not.toContain('Branch review');
  await page.reload();
  dialog = await openBackups(page);
  const snapshot = dialog.getByRole('region', { name: 'Snapshot Before revision' });
  await snapshot.getByRole('button', { name: 'Restore as new canvas' }).click();
  await expect(page.getByRole('textbox', { name: 'Canvas name' })).toHaveValue(
    'Branch review (restored)',
  );
  await expect(page.locator('[data-message-id="first"]')).toContainText('First saved question');
  dialog = await openBackups(page);
  await snapshot.getByRole('button', { name: 'Delete snapshot', exact: true }).click();
  await expect(snapshot.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await snapshot.getByRole('button', { name: 'Cancel' }).click();
  await expect(snapshot).toBeVisible();
  await snapshot.getByRole('button', { name: 'Delete snapshot', exact: true }).click();
  await snapshot.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(snapshot).toHaveCount(0);
  await page.reload();
  dialog = await openBackups(page);
  await expect(dialog).toContainText('No snapshots yet');
});

test('workspace download/import includes all canvases, snapshots and active canvas without overwriting', async ({
  page,
}) => {
  await page.goto('/');
  await importJSON(page, backup);
  let dialog = await openBackups(page);
  await dialog.getByLabel('Snapshot name for Branch review').fill('Exported version');
  await dialog.getByRole('button', { name: 'Save snapshot' }).click();
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export workspace backup', exact: true }).click();
  const file = await pending;
  const value = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(value.kind).toBe('workspace');
  expect(value.boards).toHaveLength(2);
  expect(value.snapshots).toHaveLength(1);
  expect(value.boards.find((b: { id: string }) => b.id === value.currentId).name).toBe(
    'Branch review',
  );
  const previousIds = value.boards.flatMap((b: { nodes: { id: string }[] }) =>
    b.nodes.map((n) => n.id),
  );
  await importJSON(page, value);
  await expect(
    page.getByRole('navigation', { name: 'Boards' }).locator('.board-link:not(.new-board)'),
  ).toHaveCount(4);
  await expect(dialog.locator('.snapshot-item')).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Canvas name' })).toHaveValue('Branch review');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain(value.boards[0].id);
  await page.waitForTimeout(450);
  const restoredIds = await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('branchboard.workspace.v1')!);
    return w.boards.slice(2).flatMap((b: { nodes: { id: string }[] }) => b.nodes.map((n) => n.id));
  });
  expect(restoredIds.every((id: string) => !previousIds.includes(id))).toBe(true);
  await page.reload();
  dialog = await openBackups(page);
  await expect(dialog.locator('.snapshot-item')).toHaveCount(2);
});

test('invalid workspace import is atomic; storage failure is visible; backup dialog fits mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await importJSON(page, {
    version: 1,
    kind: 'workspace',
    boards: [backup.board, { bad: true }],
    currentId: 'history',
    snapshots: [],
  });
  await expect(page.getByRole('status')).toContainText('Invalid board');
  await expect(
    page.getByRole('navigation', { name: 'Boards' }).locator('.board-link:not(.new-board)'),
  ).toHaveCount(1);
  const dialog = await openBackups(page);
  await dialog.getByLabel(/Snapshot name for/).fill('Quota failure');
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'branchboard.snapshots.v1')
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: 'Save snapshot' }).click();
  await expect(dialog.getByRole('alert')).toContainText('storage is full');
  await expect(dialog.locator('.snapshot-item')).toHaveCount(0);
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('unreadable durable snapshots are not silently overwritten', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('branchboard.snapshots.v1', 'unreadable originals');
  });
  await page.goto('/');
  const dialog = await openBackups(page);
  await expect(dialog.getByRole('alert')).toContainText('have not been overwritten');
  await dialog.getByLabel(/Snapshot name for/).fill('Cannot overwrite');
  await expect(dialog.getByRole('button', { name: 'Save snapshot' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('branchboard.snapshots.v1'))).toBe(
    'unreadable originals',
  );
});
