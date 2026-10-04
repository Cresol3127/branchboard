import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Isolated browser storage; no fixtures, credentials, or changes to existing canvases.
const directory = path.resolve(process.env.SCREENSHOT_DIR || 'screenshots');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(directory, name), fullPage: true });
}
async function command(name, preserveSelection = false) {
  if (!preserveSelection) {
    await page.keyboard.press('Escape');
    await page.locator('.canvas-area').click({ position: { x: 10, y: 10 } });
  }
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox', { name: 'Search commands and nodes' }).fill(name);
  await page.getByRole('option', { name, exact: true }).click();
  // Palette actions and new-node focus use animation frames; let both finish before typing.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      ),
  );
  if (name === 'Fit canvas') await page.waitForTimeout(300);
}
try {
  await page.goto('http://localhost:3000');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await capture('01-canvas.png');
  await command('Theme: light');
  await command('New canvas');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await capture('02-node-created.png');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await command('Auto-arrange nodes');
  await page.waitForTimeout(500);
  const nodes = page.locator('.react-flow__node-chat');
  await expect(nodes).toHaveCount(3);
  for (let i = 0; i < 2; i++) {
    const from = await nodes.nth(i).locator('.source').boundingBox();
    const to = await nodes
      .nth(i + 1)
      .locator('.target')
      .boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
    await page.mouse.up();
  }
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await command('Auto-arrange nodes');
  await capture('03-connected.png');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
  await capture('04-settings.png');
  await page.keyboard.press('Escape');
  await nodes
    .first()
    .getByRole('button', { name: /^Select model:/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'Model selector' })).toBeVisible();
  await capture('05-model-selector.png');
  await page.keyboard.press('Escape');
  await nodes
    .first()
    .locator('.board-node')
    .click({ button: 'right', position: { x: 12, y: 12 } });
  await expect(page.getByRole('menu', { name: 'Node actions' })).toBeVisible();
  await capture('06-context-menu.png');
  await page.keyboard.press('Escape');
  await command('Fit canvas');
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('region', { name: 'Command palette' })).toBeVisible();
  await capture('07-command-palette.png');
  await page.keyboard.press('Escape');
  await command('Theme: dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await capture('08-dark.png');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await command('New canvas');
  await page.getByRole('button', { name: 'Add conversation', exact: true }).click();
  await capture('09-mobile-canvas.png');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await capture('10-mobile-settings.png');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Select model:/ }).click();
  await capture('11-mobile-model-selector.png');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Node actions', exact: true }).click();
  await capture('12-mobile-context-menu.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect(page.locator('.sidebar-shell')).toHaveCSS('width', '64px');
  await command('Fit canvas');
  await capture('13-sidebar-collapsed.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await command('Fit canvas');
  await capture('14-mobile-sidebar-collapsed.png');
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Projects and boards' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 960 });
  await command('Fit canvas');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(async () => {
    document.querySelector('[aria-controls="workspace-sidebar"]').click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (const animation of document
      .querySelector('.sidebar-shell')
      .getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 110;
    }
  });
  await capture('15-sidebar-animation.png');
  await page.evaluate(() => {
    for (const animation of document
      .querySelector('.sidebar-shell')
      .getAnimations({ subtree: true }))
      animation.finish();
  });
  await command('New canvas');
  await command('New note');
  await page
    .getByRole('textbox', { name: 'Note content', exact: true })
    .fill(
      'Use TypeScript. Keep credentials on the server. Explain tradeoffs before choosing an approach.',
    );
  await command('New conversation');
  const conversation = page.locator('.react-flow__node-chat');
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('How should we structure the next feature?');
  await expect(conversation.locator('.node-title')).toHaveCount(0);
  await capture('16-titleless-conversation.png');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Models', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Test model', exact: true })).toBeVisible();
  // Never run a paid model test from the screenshot script.
  await capture('17-models-and-explicit-test.png');
  await page.keyboard.press('Escape');
  await command('Theme: dark');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await capture('18-dark-models-panel.png');
  await page.keyboard.press('Escape');
  await command('Theme: light');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await capture('19-mobile-models-panel.png');
  await page.keyboard.press('Escape');
  await command('Fit canvas');
  await capture('20-mobile-quiet-canvas.png');

  // Import our own saved user text through the real backup UI. No synthetic AI replies.
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'history-review.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        board: {
          id: 'history-review',
          name: 'History review',
          updatedAt: Date.now(),
          edges: [],
          nodes: [
            {
              id: 'review-conversation',
              type: 'chat',
              position: { x: 100, y: 100 },
              style: { width: 400, height: 520 },
              data: {
                title: 'Review checklist',
                color: 'lavender',
                note: '',
                messages: [
                  {
                    id: 'review-question',
                    role: 'user',
                    content: 'Review the history tools and record any unanswered questions.',
                  },
                ],
              },
            },
          ],
        },
      }),
    ),
  });
  const saved = page.locator('[data-message-id="review-question"]');
  await expect(saved).toBeVisible();
  await capture('21-history-controls.png');
  await saved.getByRole('button', { name: 'Edit message', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Edit message', exact: true });
  await editor.getByRole('textbox').fill('Review the history tools, then record the next steps.');
  await capture('22-edit-message.png');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(saved).toContainText('next steps');
  await saved.getByRole('button', { name: 'Delete message', exact: true }).click();
  await capture('23-delete-message.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await command('Search saved content');
  const historySearch = page.getByRole('region', { name: 'Search saved content', exact: true });
  await historySearch.getByRole('searchbox').fill('history tools');
  await expect(historySearch.locator('.history-search-results button')).toHaveCount(1);
  await capture('24-history-search.png');
  await historySearch.locator('.history-search-results button').click();
  await expect(saved).toBeFocused();
  await capture('25-history-search-target.png');
  await command('Theme: dark');
  await command('Search saved content');
  await historySearch.getByRole('searchbox').fill('history tools');
  await capture('26-dark-history-search.png');
  await page.keyboard.press('Escape');
  await command('Theme: light');
  await page.setViewportSize({ width: 390, height: 844 });
  await command('Search saved content');
  await historySearch.getByRole('searchbox').fill('history tools');
  await capture('27-mobile-history-search.png');
  await historySearch.locator('.history-search-results button').click();
  await expect(saved).toBeFocused();
  await saved.getByRole('button', { name: 'Edit message', exact: true }).click();
  await capture('28-mobile-edit-message.png');
  await page.keyboard.press('Escape');
  await saved.getByRole('button', { name: 'Delete message', exact: true }).click();
  await capture('29-mobile-delete-message.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  await saved.getByRole('button', { name: 'Branch from this message' }).click();
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(2);
  await command('Fit canvas');
  await capture('30-historical-branch.png');
  await page
    .locator('.react-flow__node-chat')
    .last()
    .locator('.node-bottom-actions')
    .click({ position: { x: 5, y: 12 } });
  await page.getByRole('button', { name: /^Message model:/ }).click();
  await capture('31-historical-branch-model-picker.png');
  await page.keyboard.press('Escape');
  await command('Backups & snapshots');
  const backups = page.getByRole('region', { name: 'Backups & snapshots', exact: true });
  await backups.getByLabel(/Snapshot name for/).fill('Before the next revision');
  await backups.getByRole('button', { name: 'Save snapshot' }).click();
  await expect(backups.locator('.snapshot-item')).toHaveCount(1);
  await capture('32-workspace-backups.png');
  const downloaded = page.waitForEvent('download');
  await backups.getByRole('button', { name: 'Export workspace backup', exact: true }).click();
  const workspaceFile = path.join(directory, 'workspace-backup.json');
  await (await downloaded).saveAs(workspaceFile);
  await page.locator('input[type="file"]').setInputFiles(workspaceFile);
  await expect(backups.locator('.snapshot-item')).toHaveCount(2);
  await capture('33-workspace-imported.png');
  await backups
    .locator('.snapshot-item')
    .first()
    .getByRole('button', { name: 'Restore as new canvas' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Canvas name' })).toHaveValue(
    'History review (restored)',
  );
  await command('Fit canvas');
  await capture('34-snapshot-restored.png');
  await command('Theme: dark');
  await command('Backups & snapshots');
  await capture('35-dark-backups.png');
  await page.keyboard.press('Escape');
  await command('Theme: light');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.toast')).toHaveCount(0);
  await command('Backups & snapshots');
  await capture('36-mobile-backups.png');
  await backups
    .locator('.snapshot-item')
    .first()
    .getByRole('button', { name: 'Delete snapshot', exact: true })
    .click();
  await expect(backups.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await capture('37-mobile-snapshot-delete.png');
  await backups.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  if (await page.getByRole('button', { name: 'Expand sidebar', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'canvas-notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        board: {
          id: 'canvas-notes',
          name: 'Canvas notes QA',
          updatedAt: Date.now(),
          edges: [],
          nodes: [
            {
              id: 'plan-note',
              type: 'note',
              position: { x: 80, y: 100 },
              style: { width: 360, height: 260 },
              data: {
                title: 'Implementation notes',
                color: 'amber',
                messages: [],
                note: '# Canvas improvements\n\n**Keep it local-first.** Use *real* saved content and preserve undo history.\n\n## Review checklist\n\n- [x] Read the specification\n- [ ] Review collision handling\n  - [ ] Check grouped nodes\n- [ ] Download a backup\n\nUse `Shift-drag` to move without branching.\n\n| Mode | Behavior |\n| --- | --- |\n| Automatic | Fit content, up to 900 px |\n| Manual | Keep the chosen size |',
              },
            },
            {
              id: 'neighbor-note',
              type: 'note',
              position: { x: 550, y: 100 },
              style: { width: 300, height: 260 },
              data: {
                title: 'Neighbor stays put',
                color: 'sage',
                messages: [],
                note: 'Dragging or resizing another node must not move this note.\n\n- [ ] Verify the gap\n- [ ] Undo the gesture',
              },
            },
          ],
        },
      }),
    ),
  });
  const richNote = page.locator('.react-flow__node-note').first();
  await richNote.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
  await richNote.getByRole('button', { name: 'Node actions', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Automatic content sizing' }).click();
  await command('Fit canvas');
  await richNote.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
  await capture('38-auto-sized-markdown-editor.png');
  await richNote.getByRole('button', { name: 'Preview', exact: true }).click();
  await richNote
    .getByRole('checkbox', { name: 'Task: Review collision handling', exact: true })
    .check();
  await command('Fit canvas');
  await capture('39-markdown-checklists.png');
  await command('Theme: dark');
  await capture('40-dark-markdown-checklists.png');
  await command('Theme: light');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await command('Fit canvas');
  await capture('41-mobile-markdown-checklists.png');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await command('Fit canvas');
  const neighbor = page.locator('.react-flow__node-note').last();
  await neighbor.locator('.node-bottom-actions').click({ position: { x: 5, y: 12 } });
  const beforeDrag = await neighbor.evaluate((el) => getComputedStyle(el).transform);
  const heading = await neighbor.locator('.node-bottom-actions').boundingBox();
  const plan = await richNote.boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.move(heading.x + 5, heading.y + 12);
  await page.mouse.down();
  await page.mouse.move(plan.x + plan.width - 50, plan.y + 25, { steps: 20 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(neighbor).not.toHaveCSS('transform', beforeDrag);
  await command('Fit canvas');
  await capture('42-collision-settled.png');
  await command('Undo');
  await command('Fit canvas');
  await capture('43-collision-undone.png');
  await command('New canvas');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Canvas name', exact: true }).fill('Visual planning');
  if (await page.getByRole('button', { name: 'Expand creation tools' }).count())
    await page.getByRole('button', { name: 'Expand creation tools' }).click();
  await page.getByRole('button', { name: 'Drawing & annotations', exact: true }).click();
  async function drawAnnotation(tool, points) {
    await page.getByRole('button', { name: tool, exact: true }).click();
    const rect = await page.getByLabel('Annotation drawing surface').boundingBox();
    await page.mouse.move(rect.x + points[0][0], rect.y + points[0][1]);
    await page.mouse.down();
    for (const [x, y] of points.slice(1))
      await page.mouse.move(rect.x + x, rect.y + y, { steps: 5 });
    await page.mouse.up();
  }
  await drawAnnotation('Freehand pen', [
    [160, 260],
    [190, 210],
    [220, 270],
    [250, 220],
    [290, 260],
  ]);
  await capture('44-freehand.png');
  await drawAnnotation('Rectangle', [
    [120, 230],
    [330, 360],
  ]);
  await drawAnnotation('Ellipse', [
    [520, 180],
    [740, 310],
  ]);
  await drawAnnotation('Arrow', [
    [350, 245],
    [490, 245],
  ]);
  await page.getByRole('button', { name: 'Select annotations', exact: true }).click();
  await page.getByLabel('Annotation color', { exact: true }).fill('#b38a22');
  await drawAnnotation('Highlighter', [
    [140, 350],
    [310, 350],
  ]);
  await page.getByRole('button', { name: 'Select annotations', exact: true }).click();
  await capture('45-shapes-highlighting.png');
  await page.getByRole('button', { name: 'Annotation layers', exact: true }).click();
  const annotationLayers = page.getByRole('region', { name: 'Annotation layers', exact: true });
  await annotationLayers.getByLabel('Layer name 1').fill('Planning marks');
  await annotationLayers.getByLabel('Layer name 1').press('Enter');
  await annotationLayers.getByRole('button', { name: 'Add annotation layer' }).click();
  await capture('46-annotation-layers.png');
  await annotationLayers.getByRole('button', { name: 'Delete layer Planning marks' }).click();
  await capture('47-delete-annotation-layer.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.keyboard.press('Escape');
  await command('Theme: dark');
  await capture('48-dark-annotations.png');
  await command('Theme: light');
  await page.getByRole('button', { name: 'Close annotation tools', exact: true }).click();
  await command('Collapse sidebar');
  await page.setViewportSize({ width: 390, height: 844 });
  await command('Fit canvas');
  await page.getByRole('button', { name: 'Drawing & annotations', exact: true }).click();
  await capture('49-mobile-annotations.png');
  await page.getByRole('button', { name: 'Annotation layers', exact: true }).click();
  await capture('50-mobile-annotation-layers.png');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close annotation tools', exact: true }).click();
  await capture('51-mobile-annotation-canvas.png');
  // Re-import the drawing far from the origin without a viewport to verify initial fitting.
  const remoteDrawing = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('branchboard.workspace.v1'));
    const board = workspace.boards.find((b) => b.id === workspace.currentId);
    return {
      version: 1,
      board: {
        ...board,
        name: 'Imported visual plan',
        viewport: undefined,
        annotations: {
          ...board.annotations,
          items: board.annotations.items.map((a) => ({
            ...a,
            points: a.points.map((p) => ({ x: p.x - 9000, y: p.y + 8000 })),
          })),
        },
      },
    };
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await command('Expand sidebar');
  await expect(page.getByRole('complementary', { name: 'Projects and boards' })).toBeVisible();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: 'visual-plan.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(remoteDrawing)),
  });
  await expect(page.getByRole('textbox', { name: 'Canvas name', exact: true })).toHaveValue(
    'Imported visual plan',
  );
  await expect(page.locator('[data-annotation-id]')).toHaveCount(5);
  await expect
    .poll(() =>
      page.locator('[data-annotation-id]').evaluateAll((marks) => {
        const canvas = document.querySelector('.react-flow').getBoundingClientRect();
        return marks.every((mark) => {
          const box = mark.getBoundingClientRect();
          return (
            box.left >= canvas.left &&
            box.top >= canvas.top &&
            box.right <= canvas.right &&
            box.bottom <= canvas.bottom
          );
        });
      }),
    )
    .toBe(true);
  await capture('52-imported-annotations-fitted.png');
  // Real rich-text edits and generated PNG/PDF files, with no provider requests.
  await command('New canvas');
  await expect(page.getByRole('textbox', { name: 'Canvas name', exact: true })).toHaveValue(
    'Untitled canvas',
  );
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Canvas name', exact: true }).fill('Research notes');
  await expect(page.getByRole('textbox', { name: 'Canvas name', exact: true })).toHaveValue(
    'Research notes',
  );
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Note content', exact: true })
    .fill(
      '## A clearer workspace\n\nKeep ideas connected with **portable Markdown**.\n\n- [x] Capture the plan\n- [ ] Review the canvas\n\n| Format | Purpose |\n| --- | --- |\n| PNG | Share a visual |\n| PDF | Print the plan |\n\n`Local-first` and ready to edit.',
    );
  await page.getByRole('button', { name: 'Rich text', exact: true }).click();
  const richEditor = page.getByRole('textbox', { name: 'Rich note content' });
  await expect(richEditor.locator('h2')).toHaveText('A clearer workspace');
  await page.getByRole('button', { name: 'Node actions', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Automatic content sizing' }).click();
  await expect
    .poll(() =>
      page.locator('.react-flow__node-note').evaluate((n) => n.getBoundingClientRect().height),
    )
    .toBeGreaterThan(450);
  const fitRichNote = async () => {
    // Reveal the note before selecting it; the composer partially covers the initial position.
    await command('Fit canvas');
    await page
      .locator('.react-flow__node-note .node-bottom-actions')
      .click({ position: { x: 5, y: 12 } });
    await page.waitForTimeout(300);
    // Keep the note selected so automatic sizing includes the editor controls.
    await command('Fit canvas', true);
    await page.waitForTimeout(300);
  };
  await fitRichNote();
  await capture('53-rich-note-editor.png');
  await richEditor.locator('input[type=checkbox]').nth(1).check();
  await capture('54-rich-note-checklist.png');
  await command('Theme: dark');
  await fitRichNote();
  await capture('55-dark-rich-note.png');
  await command('Theme: light');
  await page
    .locator('.react-flow__node-note .node-bottom-actions')
    .click({ position: { x: 5, y: 12 } });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await command('Export canvas (PNG)');
  let exportDialog = page.getByRole('region', { name: 'Export canvas', exact: true });
  await exportDialog.getByRole('button', { name: 'Generate preview', exact: true }).click();
  await expect(exportDialog.getByRole('img', { name: /^Export preview of/ })).toBeVisible();
  await capture('56-png-export-preview.png');
  let downloading = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Download PNG', exact: true }).click();
  await (await downloading).saveAs(path.join(directory, 'canvas-export.png'));
  await exportDialog.getByRole('combobox', { name: 'Format', exact: true }).selectOption('pdf');
  await capture('57-pdf-export-preview.png');
  downloading = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Download PDF', exact: true }).click();
  await (await downloading).saveAs(path.join(directory, 'canvas-export.pdf'));
  await page.keyboard.press('Escape');
  await command('Collapse sidebar');
  await page.setViewportSize({ width: 390, height: 844 });
  await command('Fit canvas');
  await page
    .locator('.react-flow__node-note .node-bottom-actions')
    .click({ position: { x: 5, y: 12 } });
  await page.getByRole('button', { name: 'Rich text', exact: true }).click();
  await expect(richEditor).toBeVisible();
  await page.locator('.note-body').evaluate((body) => {
    body.scrollTop = 0;
  });
  await fitRichNote();
  await capture('58-mobile-rich-note.png');
  await command('Export canvas (PDF)');
  exportDialog = page.getByRole('region', { name: 'Export canvas', exact: true });
  await exportDialog.getByRole('button', { name: 'Generate preview', exact: true }).click();
  await expect(exportDialog.getByRole('img', { name: /^Export preview of/ })).toBeVisible();
  await capture('59-mobile-export-preview.png');
  await page.keyboard.press('Escape');
  await command('Theme: dark');
  await command('Export canvas (PNG)');
  await page.getByRole('button', { name: 'Generate preview', exact: true }).click();
  await expect(page.getByRole('img', { name: /^Export preview of/ })).toBeVisible();
  await capture('60-dark-mobile-export.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  await command('Theme: light');
  await command('Import conversations');
  const importDialog = page.getByRole('region', { name: 'Import conversations', exact: true });
  await importDialog.getByLabel('Conversation JSON file').setInputFiles({
    name: 'planning-conversations.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify([
        {
          title: 'Release checklist',
          messages: [
            {
              role: 'user',
              content: 'Review the new editor, verify the exports, then record the next steps.',
            },
          ],
        },
        {
          name: 'Research questions',
          chat_messages: [{ sender: 'human', text: 'Which questions still need investigation?' }],
        },
      ]),
    ),
  });
  await expect(importDialog.getByRole('checkbox')).toHaveCount(2);
  await capture('61-conversation-import-preview.png');
  await importDialog.getByRole('checkbox', { name: /Research questions/ }).uncheck();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('62-mobile-conversation-import.png');
  // Theme is changed only after closing the dialog, as workspace shortcuts are inactive inside it.
  await page.keyboard.press('Escape');
  await command('Theme: dark');
  await command('Import conversations');
  await importDialog.getByLabel('Conversation JSON file').setInputFiles({
    name: 'unsupported.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ messages: [{ role: 'tool', content: 'Unsupported tool payload' }] }),
    ),
  });
  await expect(importDialog.getByRole('alert')).toBeVisible();
  await capture('63-dark-mobile-import-error.png');
  await importDialog.getByLabel('Conversation JSON file').setInputFiles({
    name: 'planning.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        title: 'Imported release checklist',
        messages: [
          { role: 'user', content: 'Review the editor and check the actual downloaded files.' },
        ],
      }),
    ),
  });
  await expect(importDialog.getByRole('checkbox')).toHaveCount(1);
  await importDialog.getByRole('button', { name: 'Import 1 conversation', exact: true }).click();
  await expect(page.locator('.messages')).toContainText('check the actual downloaded files');
  await capture('64-imported-mobile-conversation.png');
  await page.setViewportSize({ width: 1440, height: 960 });
  await command('Theme: light');
  await command('Fit canvas');
  await capture('65-imported-conversation.png');
  await command('Expand sidebar');
  await command('Projects & folders');
  const projects = page.getByRole('region', { name: 'Projects & folders', exact: true });
  await projects.getByLabel('Project or folder name', { exact: true }).fill('Release planning');
  await projects.getByRole('button', { name: 'Create project / folder', exact: true }).click();
  await projects
    .getByLabel('Parent project or folder', { exact: true })
    .selectOption({ label: 'Release planning' });
  await projects.getByLabel('Project or folder name', { exact: true }).fill('Checklists');
  await projects.getByRole('button', { name: 'Create project / folder', exact: true }).click();
  await projects
    .getByLabel('Current canvas folder')
    .selectOption({ label: 'Release planning / Checklists' });
  await capture('66-projects-folders.png');
  await page.keyboard.press('Escape');
  await command('Favorite current canvas');
  await page
    .getByLabel('Filter canvases by project or folder')
    .selectOption({ label: 'Release planning' });
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await capture('67-folder-favorites-sidebar.png');
  await command('Canvas templates');
  const templates = page.getByRole('region', { name: 'Canvas templates', exact: true });
  await templates.getByLabel('Template name', { exact: true }).fill('Release checklist');
  await templates.getByRole('button', { name: 'Save template', exact: true }).click();
  await templates.getByLabel('Template name', { exact: true }).fill('Checklist with saved context');
  await templates.getByRole('checkbox', { name: 'Include saved conversation messages' }).check();
  await templates.getByRole('button', { name: 'Save template', exact: true }).click();
  await templates
    .getByLabel('Template destination folder')
    .selectOption({ label: 'Release planning / Checklists' });
  await capture('68-canvas-templates.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('69-mobile-templates.png');
  await page.keyboard.press('Escape');
  await command('Theme: dark');
  await command('Projects & folders');
  await capture('70-dark-mobile-projects.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  await command('Projects & folders');
  await projects
    .getByRole('region', { name: 'Folder Release planning / Checklists', exact: true })
    .getByRole('button', { name: 'Remove folder', exact: true })
    .click();
  const libraryBounds = await projects.boundingBox();
  const libraryHeading = await projects
    .getByRole('heading', { name: 'Projects & folders' })
    .boundingBox();
  expect(libraryHeading.y).toBeGreaterThanOrEqual(libraryBounds.y + 8);
  await capture('71-safe-folder-removal.png');
  await projects.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.keyboard.press('Escape');
  await command('Theme: light');
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await command('Canvas templates');
  await templates
    .getByLabel('Template destination folder')
    .selectOption({ label: 'Release planning / Checklists' });
  await templates
    .getByRole('region', { name: 'Template Checklist with saved context', exact: true })
    .getByRole('button', { name: 'Create canvas from template' })
    .click();
  await expect(page.locator('.messages')).toContainText('check the actual downloaded files');
  await command('Fit canvas');
  await capture('72-independent-template-canvas.png');
  await command('Canvas templates');
  await templates
    .getByRole('region', { name: 'Template Release checklist', exact: true })
    .getByRole('button', { name: 'Delete template', exact: true })
    .click();
  await capture('73-template-delete-confirmation.png');
  await page.keyboard.press('Escape');
  const destination = page.getByLabel('Message destination', { exact: true });
  const message = page.getByRole('textbox', { name: 'Message', exact: true });
  await destination.selectOption({
    label: 'Review the editor and check the actual downloaded files.',
  });
  await message.fill('What should we verify before the release?');
  await expect(message).toHaveCount(1);
  await expect(page.locator('.react-flow__node .composer')).toHaveCount(0);
  await capture('74-unified-message-bar.png');
  await page.getByRole('button', { name: /^Message model:/ }).click();
  await capture('75-unified-message-models.png');
  await page.keyboard.press('Escape');
  await destination.selectOption('');
  await message.fill('A separate conversation starts here.');
  await capture('76-new-conversation-composer.png');
  await destination.selectOption({
    label: 'Review the editor and check the actual downloaded files.',
  });
  await expect(message).toHaveValue('What should we verify before the release?');
  await page.setViewportSize({ width: 390, height: 844 });
  await command('Fit canvas');
  await capture('77-mobile-unified-message-bar.png');
  await command('Theme: dark');
  await capture('78-dark-mobile-message-bar.png');
  await page.setViewportSize({ width: 1440, height: 960 });
  await command('Fit canvas');
  await capture('79-forest-floating-composer.png');
  await message.fill(
    'Explore the release plan.\nList the remaining checks.\nKeep the useful context connected.\nThen review the results.',
  );
  await capture('80-expanded-floating-composer.png');
  await command('Collapse sidebar');
  await command('Fit canvas');
  await expect(page.locator('.sidebar-shell')).toHaveCSS('width', '64px');
  await capture('81-forest-icon-rail.png');
  await message.fill('What should we verify before the release?');
  await page.locator('.react-flow__pane').dblclick({ position: { x: 20, y: 90 } });
  await expect(page.getByRole('menu', { name: 'Canvas actions' })).toBeVisible();
  await capture('82-quick-create-menu.png');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Text selection mode', exact: true }).click();
  await capture('83-text-selection-mode.png');
  await page.getByRole('button', { name: 'Text selection mode', exact: true }).click();
  await page
    .locator('.react-flow__node-chat .node-bottom-actions')
    .first()
    .click({ position: { x: 5, y: 12 } });
  await command('Duplicate selection', true);
  await expect(page.locator('.react-flow__node-chat')).toHaveCount(2);
  await command('Auto-arrange nodes');
  await page.waitForTimeout(350);
  const from = await page.locator('.react-flow__node-chat .source').first().boundingBox();
  const to = await page.locator('.react-flow__node-chat .target').last().boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
  const midpoint = await page
    .locator('.react-flow__edge-path')
    .last()
    .evaluate((path) => {
      const p = path.getPointAtLength(path.getTotalLength() / 2);
      const point = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM());
      return { x: point.x, y: point.y };
    });
  await page.mouse.click(midpoint.x, midpoint.y);
  await expect(page.getByRole('region', { name: 'Connection context' })).toBeVisible();
  await capture('84-connection-context-preview.png');
  await page.getByRole('button', { name: 'Disconnect nodes', exact: true }).click();
  await page.setViewportSize({ width: 800, height: 700 });
  await command('Fit canvas');
  await capture('85-forest-tablet.png');
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  phone.on('pageerror', (error) => errors.push(error.message));
  await phone.goto('http://localhost:3000');
  await expect(phone.locator('.react-flow__node')).toHaveCount(3);
  await phone.evaluate(() => document.fonts.ready);
  await phone.waitForTimeout(600);
  await phone.screenshot({
    path: path.join(directory, '86-mobile-first-open.png'),
    fullPage: true,
  });
  await phone.close();
  await page.setViewportSize({ width: 1440, height: 960 });
  await command('Fit canvas');
  await page.locator('.model-selector').first().click();
  const modelPicker = page.getByRole('dialog', { name: 'Model selector', exact: true });
  await expect(modelPicker).toBeVisible();
  const firstModel = modelPicker.getByRole('option').first();
  if (await firstModel.count()) {
    await firstModel.click();
    await page.locator('.react-flow__node-chat .model-selector').first().click();
    await expect(
      modelPicker.getByRole('group', { name: 'Recent models', exact: true }),
    ).toBeVisible();
  }
  await capture('87-provider-model-refresh-status.png');
  await modelPicker
    .getByRole('textbox', { name: 'Search models' })
    .fill('my-provider/exact-model-id');
  if (await modelPicker.getByLabel('Custom model provider').count())
    await expect(
      modelPicker.getByRole('button', { name: 'Use custom model', exact: true }),
    ).toBeEnabled();
  await capture('88-exact-model-id.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await command('Fit canvas');
  await page.locator('.model-selector').first().click();
  await modelPicker.getByRole('textbox', { name: 'Search models' }).fill('my-exact-model');
  await capture('89-mobile-exact-model-id.png');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  const providerSettings = page.getByRole('region', { name: 'Models', exact: true });
  await providerSettings.getByLabel('Provider', { exact: true }).selectOption('ollama');
  await providerSettings.getByText('Models & advanced options', { exact: true }).click();
  await providerSettings.locator('.model-discovery-status').scrollIntoViewIfNeeded();
  await capture('90-provider-model-settings.png');
  await providerSettings.getByLabel('Provider', { exact: true }).selectOption('openai');
  await providerSettings.getByText('Models & advanced options', { exact: true }).click();
  await providerSettings.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(
    providerSettings.getByRole('button', { name: 'Check for updates', exact: true }),
  ).toBeEnabled();
  await providerSettings.locator('.model-discovery-status').first().scrollIntoViewIfNeeded();
  await capture('91-mobile-keyless-catalog-settings.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  await command('Fit canvas');
  await page.locator('.model-selector').first().click();
  await expect(
    modelPicker.getByRole('button', { name: 'Check for updates', exact: true }),
  ).toBeVisible();
  await capture('92-keyless-public-models.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await command('Fit canvas');
  await page.locator('.model-selector').first().click();
  await capture('93-mobile-public-models.png');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Message model:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Model selector', exact: true })).toBeVisible();
  await capture('94-mobile-composer-models.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: /^Message model:/ }).click();
  await capture('95-desktop-composer-models.png');
  await page.keyboard.press('Escape');
  if ((await page.locator('html').getAttribute('data-theme')) !== 'dark') {
    await command('Theme: dark');
  }
  await capture('96-visible-canvas-corners-dark.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('97-mobile-canvas-corners-dark.png');
  await page.setViewportSize({ width: 1440, height: 960 });
  await command('Keyboard shortcuts & help');
  await capture('98-help-getting-started.png');
  await page.getByRole('tab', { name: 'Keyboard shortcuts', exact: true }).click();
  await capture('99-grouped-keyboard-shortcuts.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('100-mobile-keyboard-shortcuts.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  if (!(await page.locator('.react-flow__minimap').count()))
    await page.getByRole('button', { name: 'Toggle minimap', exact: true }).click();
  await capture('101-minimap-toolbar-spacing.png');
  if (await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).count())
    await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await capture('102-compact-icon-rail.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('103-mobile-overlay-spacing.png');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await capture('104-minimal-mobile-settings.png');
  await writeFile(path.join(directory, 'browser-errors.json'), JSON.stringify(errors, null, 2));
  expect(errors).toEqual([]);
  console.log(
    `Saved 104 desktop/mobile screenshots and PNG/PDF downloads to ${directory}; no browser errors.`,
  );
} catch (error) {
  await page.screenshot({ path: path.join(directory, 'failure.png'), fullPage: true });
  await writeFile(path.join(directory, 'failure.html'), await page.content());
  await writeFile(path.join(directory, 'browser-errors.json'), JSON.stringify(errors, null, 2));
  throw error;
} finally {
  await browser.close();
}
