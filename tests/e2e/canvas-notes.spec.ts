import { expect, test, type Page } from '@playwright/test';
import { command } from './helpers';

async function workspace(
  page: Page,
  note = '# Plan\n\n**Real formatting** and *emphasis*.\n\n- [ ] Review changes\n- [x] Read specification\n  - [ ] Nested task\n\n`- [ ] not a task`',
) {
  await page.addInitScript((note) => {
    if (localStorage.getItem('branchboard.workspace.v1')) return;
    localStorage.setItem(
      'branchboard.workspace.v1',
      JSON.stringify({
        currentId: 'notes',
        boards: [
          {
            id: 'notes',
            name: 'Notes',
            updatedAt: 0,
            viewport: { x: 0, y: 0, zoom: 1 },
            edges: [],
            nodes: ['a', 'b'].map((id, i) => ({
              id,
              type: 'note',
              position: { x: 60 + i * 450, y: 100 },
              style: { width: 340, height: 260 },
              data: {
                title: id === 'a' ? 'Plan' : 'Neighbor',
                color: 'amber',
                messages: [],
                note: i ? 'Keep my position' : note,
              },
            })),
          },
        ],
      }),
    );
  }, note);
  await page.goto('/');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
}

test('Markdown notes render safely and checklists toggle exact source items with undo and reload', async ({
  page,
}) => {
  await workspace(page);
  const note = page.locator('[data-id="a"]');
  await expect(note.getByRole('heading', { name: 'Plan' })).toBeVisible();
  await expect(note.locator('strong')).toHaveText('Real formatting');
  await expect(note.getByRole('checkbox')).toHaveCount(3);
  await note.getByRole('checkbox', { name: 'Task: Nested task', exact: true }).check();
  await expect(
    note.getByRole('checkbox', { name: 'Task: Review changes', exact: true }),
  ).not.toBeChecked();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('- [x] Nested task');
  await command(page, 'Undo');
  await expect(
    note.getByRole('checkbox', { name: 'Task: Nested task', exact: true }),
  ).not.toBeChecked();
  await command(page, 'Redo');
  await expect(
    note.getByRole('checkbox', { name: 'Task: Nested task', exact: true }),
  ).toBeChecked();
  await page.waitForTimeout(450);
  await page.reload();
  await expect(
    note.getByRole('checkbox', { name: 'Task: Nested task', exact: true }),
  ).toBeChecked();
  await note.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
  const editor = note.getByRole('textbox', { name: 'Note content' });
  await editor.fill(
    '<script>window.bad = true</script>\n\n[unsafe](javascript:alert(1))\n\n- [ ] Safe task',
  );
  await note.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(note.locator('script')).toHaveCount(0);
  await expect(note.locator('a')).not.toHaveAttribute('href', /javascript:/);
  await expect(note.getByRole('checkbox', { name: 'Task: Safe task' })).toBeVisible();
});

test('formatting toolbar changes saved Markdown and toggles a working rendered preview', async ({
  page,
}) => {
  await workspace(page, 'Choose an approach');
  const note = page.locator('[data-id="a"]');
  await note.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
  const editor = note.getByRole('textbox', { name: 'Note content' });
  await editor.focus();
  await editor.evaluate((input: HTMLTextAreaElement) => input.setSelectionRange(0, 6));
  await note.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(editor).toHaveValue('**Choose** an approach');
  await note.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(note.locator('strong')).toHaveText('Choose');
  await command(page, 'Undo');
  await expect(note.locator('strong')).toHaveCount(0);
  await note.getByRole('button', { name: 'Edit', exact: true }).click();
  await editor.focus();
  await editor.evaluate((input: HTMLTextAreaElement) => input.setSelectionRange(0, 0));
  await note.getByRole('button', { name: 'Add checklist item' }).click();
  await expect(editor).toHaveValue('- [ ] Choose an approach');
  await note.getByRole('button', { name: 'Preview', exact: true }).click();
  await note.getByRole('checkbox').check();
  await note.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor).toHaveValue('- [x] Choose an approach');
});

test('automatic content sizing grows, caps, shrinks, persists and yields to manual resizing', async ({
  page,
}) => {
  await workspace(page, Array.from({ length: 18 }, (_, i) => `Line ${i + 1}`).join('\n\n'));
  const note = page.locator('[data-id="a"]');
  await note.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
  await note.getByRole('button', { name: 'Node actions', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Automatic content sizing' }).click();
  await expect
    .poll(() => note.evaluate((el) => parseFloat((el as HTMLElement).style.height)))
    .toBeGreaterThan(600);
  const editor = note.getByRole('textbox', { name: 'Note content' });
  await editor.fill('Short note');
  await expect
    .poll(() => note.evaluate((el) => parseFloat((el as HTMLElement).style.height)))
    .toBeLessThan(300);
  await editor.fill('Long line\n'.repeat(200));
  await expect
    .poll(() => note.evaluate((el) => parseFloat((el as HTMLElement).style.height)))
    .toBe(900);
  await editor.fill('Short again');
  await expect
    .poll(() => note.evaluate((el) => parseFloat((el as HTMLElement).style.height)))
    .toBeLessThan(300);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('branchboard.workspace.v1')))
    .toContain('"autoSize":true');
  await page.reload();
  await note.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
  const handle = (await note
    .locator('.react-flow__resize-control.handle.bottom.right')
    .boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 45, handle.y + 90, { steps: 12 });
  await page.mouse.up();
  await note.getByRole('button', { name: 'Node actions', exact: true }).click();
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Automatic content sizing' }),
  ).toHaveAttribute('aria-checked', 'false');
});

test('automatic conversation sizing follows saved message edits and respects collapse', async ({
  page,
}) => {
  await workspace(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'conversation.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        board: {
          id: 'chat-size',
          name: 'Conversation size',
          updatedAt: 0,
          edges: [],
          nodes: [
            {
              id: 'auto-chat',
              type: 'chat',
              position: { x: 100, y: 100 },
              style: { width: 400, height: 380 },
              data: {
                title: 'Sizing review',
                color: 'purple',
                note: '',
                autoSize: true,
                messages: [
                  {
                    id: 'long',
                    role: 'user',
                    content: 'A paragraph for layout review.\n\n'.repeat(60),
                  },
                ],
              },
            },
          ],
        },
      }),
    ),
  });
  const chat = page.locator('.react-flow__node-chat');
  await expect
    .poll(() => chat.evaluate((el) => parseFloat((el as HTMLElement).style.height)))
    .toBe(900);
  await command(page, 'Fit canvas');
  await chat
    .locator('[data-message-id="long"]')
    .getByRole('button', { name: 'Edit message', exact: true })
    .click();
  const dialog = page.getByRole('region', { name: 'Edit message', exact: true });
  await dialog.getByRole('textbox').fill('A short saved message.');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect
    .poll(() => chat.evaluate((el) => parseFloat((el as HTMLElement).style.height)))
    .toBeLessThan(600);
  await chat.getByRole('button', { name: 'Collapse node' }).click();
  await expect(chat).toHaveCSS('height', '50px');
  await page.waitForTimeout(300);
  await expect(chat).toHaveCSS('height', '50px');
  await chat.getByRole('button', { name: 'Expand node' }).click();
  await expect
    .poll(() => chat.evaluate((el) => parseFloat((el as HTMLElement).style.height)))
    .toBeGreaterThanOrEqual(320);
});

test('drag and resize settle collisions without moving neighbors and undo the whole gesture', async ({
  page,
}) => {
  await workspace(page, 'Move me');
  const a = page.locator('[data-id="a"]'),
    b = page.locator('[data-id="b"]');
  const beforeB = (await b.boundingBox())!;
  const heading = (await a.locator('.node-bottom-actions').boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.move(heading.x + 5, heading.y + 5);
  await page.mouse.down();
  await page.mouse.move(heading.x + 220, heading.y + 5, { steps: 16 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(a).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 60, 100)');
  const after = (await a.boundingBox())!,
    neighbor = (await b.boundingBox())!;
  expect(after.x + after.width + 23).toBeLessThanOrEqual(neighbor.x);
  expect(neighbor.x).toBeCloseTo(beforeB.x, 0);
  await command(page, 'Undo');
  await expect(a).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 60, 100)');
  await a.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
  const handle = (await a
    .locator('.react-flow__resize-control.handle.bottom.right')
    .boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 200, handle.y + 20, { steps: 16 });
  await page.mouse.up();
  await expect
    .poll(() => a.evaluate((el) => parseFloat((el as HTMLElement).style.width)))
    .toBeGreaterThan(340);
  await expect
    .poll(async () => {
      const box = (await a.boundingBox())!,
        other = (await b.boundingBox())!;
      return (
        box.x + box.width + 23 <= other.x ||
        box.y + box.height + 23 <= other.y ||
        other.y + other.height + 23 <= box.y
      );
    })
    .toBe(true);
  await command(page, 'Undo');
  await expect(a).toHaveCSS('width', '340px');
  await expect(a).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 60, 100)');
});
