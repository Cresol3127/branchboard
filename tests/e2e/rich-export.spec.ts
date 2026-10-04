import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { command } from './helpers';

async function newNote(page: Page, source: string) {
  await page.goto('/');
  await command(page, 'New canvas');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand creation tools', exact: true }).click();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note content', exact: true }).fill(source);
  await command(page, 'Fit canvas');
  return page.locator('.react-flow__node-note');
}
async function savedNote(page: Page) {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('branchboard.workspace.v1') || 'null');
    return state?.boards.find((b: { id: string }) => b.id === state.currentId)?.nodes[0]?.data
      .note as string | undefined;
  });
}
test('WYSIWYG formats real text, uses workspace undo, and retains Markdown through reload', async ({
  page,
}) => {
  const note = await newNote(page, 'A real thought');
  await expect.poll(() => savedNote(page)).toBe('A real thought');
  await note.getByRole('button', { name: 'Rich text', exact: true }).click();
  const editor = note.getByRole('textbox', { name: 'Rich note content' });
  await expect(editor).toHaveText('A real thought');
  // Merely opening the editor must not normalize or checkpoint the source.
  expect(await savedNote(page)).toBe('A real thought');
  await editor.click();
  await page.keyboard.press('Control+a');
  await note.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('A real thought');
  await expect.poll(() => savedNote(page)).toBe('**A real thought**');
  await page.keyboard.press('Control+z');
  await expect(editor.locator('strong')).toHaveCount(0);
  await expect(editor).toHaveText('A real thought');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor.locator('strong')).toHaveText('A real thought');
  await expect.poll(() => savedNote(page)).toBe('**A real thought**');
  await page.reload();
  await page
    .locator('.react-flow__node-note .node-bottom-actions')
    .click({ position: { x: 5, y: 12 } });
  await page.getByRole('button', { name: 'Rich text', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Rich note content' }).locator('strong'),
  ).toHaveText('A real thought');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note content', exact: true })).toHaveValue(
    '**A real thought**',
  );
});

test('rich editing preserves GFM tables, nested tasks, links and code', async ({ page }) => {
  const source =
    '## Plan\n\n- [ ] Parent\n  - [x] Child\n\n| Name | State |\n| --- | --- |\n| Work | Ready |\n\n[Safe](https://example.com) and `inline`\n\n```js\nconst count = 1;\n```';
  const note = await newNote(page, source);
  await expect.poll(() => savedNote(page)).toBe(source);
  await note.getByRole('button', { name: 'Rich text', exact: true }).click();
  const editor = note.getByRole('textbox', { name: 'Rich note content' });
  await expect(editor.locator('h2')).toHaveText('Plan');
  await expect(editor.locator('table')).toContainText('Ready');
  await expect(editor.locator('input[type=checkbox]')).toHaveCount(2);
  await expect(editor.locator('input[type=checkbox]').nth(1)).toBeChecked();
  const checkbox = await editor.locator('input[type=checkbox]').first().boundingBox();
  const taskText = await editor.locator('li > div > p').first().boundingBox();
  expect(Math.abs(checkbox!.y - taskText!.y)).toBeLessThan(20);
  expect(checkbox!.x).toBeLessThan(taskText!.x);
  expect(await editor.locator('script').count()).toBe(0);
  expect(await page.evaluate(() => 'richInjected' in window)).toBe(false);
  expect(await savedNote(page)).toBe(source);
  await editor.locator('input[type=checkbox]').first().check();
  await expect.poll(() => savedNote(page)).toContain('- [x] Parent');
  const result = await savedNote(page);
  expect(result).toContain('Child');
  expect(result).toContain('| Work');
  expect(result).toContain('https://example.com');
  expect(result).toContain('const count = 1');
  await command(page, 'Undo');
  await expect(editor.locator('input[type=checkbox]').first()).not.toBeChecked();
});

test('unsupported images and raw HTML stay untouched and cannot execute through rich editing', async ({
  page,
}) => {
  const source =
    'Keep this ![Image](/not-loaded.png)\n\n<script>window.richInjected = true</script>';
  const note = await newNote(page, source);
  await expect.poll(() => savedNote(page)).toBe(source);
  await note.getByRole('button', { name: 'Rich text', exact: true }).click();
  const editor = note.getByRole('textbox', { name: 'Rich note content' });
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(note.getByRole('status')).toContainText('read-only');
  await expect(note.getByRole('button', { name: 'Bold', exact: true })).toBeDisabled();
  await expect(editor.locator('script, img')).toHaveCount(0);
  expect(await page.evaluate(() => 'richInjected' in window)).toBe(false);
  expect(await savedNote(page)).toBe(source);
  await note.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(note.getByRole('textbox', { name: 'Note content', exact: true })).toHaveValue(
    source,
  );
});

test('rich text keyboard typing remains in the note and grouped edits undo together', async ({
  page,
}) => {
  const note = await newNote(page, 'Original');
  await note.getByRole('button', { name: 'Rich text', exact: true }).click();
  const editor = note.getByRole('textbox', { name: 'Rich note content' });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('New words g');
  await expect(editor).toHaveText('New words g');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await expect(editor).toHaveText('New words ');
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveText('Original');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveText('New words ');
});

test('full-canvas PNG and A4 PDF downloads contain real content without changing the viewport or history', async ({
  page,
}) => {
  await newNote(page, '## Exported plan\n\n**Readable content**\n\n- [x] Finished');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const readViewport = () =>
    page.locator('.react-flow__viewport').evaluate((el) => {
      const matrix = new DOMMatrix(getComputedStyle(el).transform);
      return [matrix.a, matrix.d, matrix.e, matrix.f];
    });
  const transform = await readViewport();
  const undoDisabled = await page.getByRole('button', { name: 'Undo', exact: true }).isDisabled();
  await command(page, 'Export canvas (PNG)');
  const dialog = page.getByRole('region', { name: 'Export canvas', exact: true });
  await dialog.getByRole('button', { name: 'Generate preview', exact: true }).click();
  const image = dialog.getByRole('img', { name: /^Export preview of/ });
  await expect(image).toBeVisible();
  const pixels = await image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(element, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < rgba.length; i += 4)
      if (rgba[i] < 150 && rgba[i + 1] < 150 && rgba[i + 2] < 150 && rgba[i + 3] > 200) dark++;
    return { width: canvas.width, height: canvas.height, dark };
  });
  expect(pixels.width).toBeGreaterThan(500);
  expect(pixels.dark).toBeGreaterThan(100);
  const pngDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const png = await readFile((await (await pngDownload).path())!);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBe(pixels.width);
  await dialog.getByRole('combobox', { name: 'Format', exact: true }).selectOption('pdf');
  const pdfDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const pdf = await readFile((await (await pdfDownload).path())!, 'latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf).toContain('/Subtype /Image');
  expect(pdf).toContain('/Count 1');
  await page.keyboard.press('Escape');
  const after = await readViewport();
  after.forEach((value, index) => expect(value).toBeCloseTo(transform[index], 3));
  expect(await page.getByRole('button', { name: 'Undo', exact: true }).isDisabled()).toBe(
    undoDisabled,
  );
});

test('PNG export keeps the last Markdown table row readable', async ({ page }) => {
  await newNote(
    page,
    '## Export table\n\n| Format | Purpose |\n| --- | --- |\n| PNG | Share a visual |\n| PDF | Print the plan |\n\nAfter the table.',
  );
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('button', { name: 'Node actions', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Automatic content sizing' }).click();
  await command(page, 'Export canvas (PNG)');
  const cell = await page
    .locator('.note-preview tbody tr:last-child td:last-child')
    .evaluate((el) => {
      const card = el.closest('.react-flow__node')!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const zoom = card.width / (el.closest('.react-flow__node') as HTMLElement).offsetWidth;
      return {
        x: 80 + (box.x - card.x) / zoom + 6,
        y: 80 + (box.y - card.y) / zoom + 6,
        width: box.width / zoom - 12,
        height: box.height / zoom - 12,
      };
    });
  const dialog = page.getByRole('region', { name: 'Export canvas', exact: true });
  await dialog.getByRole('button', { name: 'Generate preview', exact: true }).click();
  const image = dialog.getByRole('img', { name: /^Export preview of/ });
  await expect(image).toBeVisible();
  const dark = await image.evaluate(async (el: HTMLImageElement, box) => {
    await el.decode();
    const canvas = document.createElement('canvas');
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(el, 0, 0);
    const pixels = ctx.getImageData(box.x * 2, box.y * 2, box.width * 2, box.height * 2).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] < 150 && pixels[i + 1] < 150 && pixels[i + 2] < 150) count++;
    return count;
  }, cell);
  expect(dark).toBeGreaterThan(60);
});

test('annotation-only export includes remote visible strokes at any zoom and omits hidden layers', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'ink.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        board: {
          id: 'b',
          name: 'Ink export',
          updatedAt: 1,
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 0.15 },
          annotations: {
            layers: [
              { id: 'visible', name: 'Visible', visible: true, locked: false },
              { id: 'hidden', name: 'Hidden', visible: false, locked: false },
            ],
            items: [
              {
                id: 'a',
                kind: 'rectangle',
                layerId: 'visible',
                color: '#ff0000',
                width: 10,
                points: [
                  { x: -9000, y: 8000 },
                  { x: -8700, y: 8200 },
                ],
              },
              {
                id: 'b',
                kind: 'ellipse',
                layerId: 'hidden',
                color: '#0000ff',
                width: 10,
                points: [
                  { x: 20000, y: 20000 },
                  { x: 30000, y: 30000 },
                ],
              },
            ],
          },
        },
      }),
    ),
  });
  await expect(page.getByRole('textbox', { name: 'Canvas name', exact: true })).toHaveValue(
    'Ink export',
  );
  await command(page, 'Export canvas (PNG)');
  await page.getByRole('button', { name: 'Generate preview', exact: true }).click();
  const image = page
    .getByRole('region', { name: 'Export canvas', exact: true })
    .getByRole('img', { name: /^Export preview of/ });
  await expect(image).toBeVisible();
  const colors = await image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(element, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0,
      blue = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] > 200 && rgba[i + 1] < 60 && rgba[i + 2] < 60) red++;
      if (rgba[i] < 60 && rgba[i + 1] < 60 && rgba[i + 2] > 200) blue++;
    }
    return { red, blue, width: canvas.width };
  });
  expect(colors.red).toBeGreaterThan(100);
  expect(colors.blue).toBe(0);
  expect(colors.width).toBeLessThan(1200);
});

test('empty-canvas export reports an error and the export dialog stays usable on mobile', async ({
  page,
}) => {
  await page.goto('/');
  await command(page, 'New canvas');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await command(page, 'Export canvas (PDF)');
  const dialog = page.getByRole('region', { name: 'Export canvas', exact: true });
  await dialog.getByRole('button', { name: 'Generate preview', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Add a node');
  await expect(dialog.getByRole('button', { name: 'Download PDF', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  const rect = await dialog.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('rich editing and export pause during generation and resume after stopping', async ({
  page,
}) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        configured: true,
        model: 'gpt-4o-mini',
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            configured: true,
            hasKey: true,
            baseURL: 'https://api.openai.com/v1',
            models: ['gpt-4o-mini'],
            extraModels: [],
            defaultModel: 'gpt-4o-mini',
          },
        ],
      },
    }),
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/chat', async (route) => {
    await held;
    await route.abort();
  });
  try {
    const note = await newNote(page, 'Do not change during generation');
    await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
    await command(page, 'Fit canvas');
    const chat = page.locator('.react-flow__node-chat');
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Test generation guard');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await note.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
    await note.getByRole('button', { name: 'Rich text', exact: true }).click();
    await expect(note.getByRole('textbox', { name: 'Rich note content' })).toHaveAttribute(
      'contenteditable',
      'false',
    );
    await expect(note.getByRole('button', { name: 'Bold', exact: true })).toBeDisabled();
    await command(page, 'Export canvas (PNG)');
    await expect(
      page.getByRole('button', { name: 'Generate preview', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await chat.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
    await page.getByRole('button', { name: 'Stop generating', exact: true }).click();
    await note.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
    await expect(note.getByRole('textbox', { name: 'Rich note content' })).toHaveAttribute(
      'contenteditable',
      'true',
    );
    await command(page, 'Export canvas (PNG)');
    await expect(page.getByRole('button', { name: 'Generate preview', exact: true })).toBeEnabled();
  } finally {
    release();
  }
});
