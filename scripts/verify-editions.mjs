// Real Chromium smoke checks for the newly labeled historical refreshes.
// No AI routes are mocked, no credentials are saved, no generation is requested.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.EDITION_SCREENSHOT_DIR || '/tmp/opencode/branchboard-edition-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const minor of [1, 2, 3, 4, 5]) {
    const version = `1.${minor}.1`;
    const cwd = path.join(root, `releases/v${version}`);
    const port = 3100 + minor;
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['dist-server/index.js'], {
      cwd,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
      stdio: 'pipe',
    });
    let serverOutput = '';
    child.stdout.on('data', (chunk) => {
      serverOutput += chunk;
    });
    child.stderr.on('data', (chunk) => {
      serverOutput += chunk;
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (child.exitCode !== null) throw new Error(serverOutput);
        try {
          ready = (await fetch(`${origin}/api/config`)).ok;
        } catch {
          /* startup */
        }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert(ready, `Server not ready: ${serverOutput}`);
      const missing = await fetch(`${origin}/api/unknown`);
      assert.equal(missing.status, 404);
      assert.match(missing.headers.get('content-type'), /json/);
      assert.equal(
        (await fetch(`${origin}/api/config`, { headers: { Origin: 'https://untrusted.example' } }))
          .status,
        403,
      );
      await page.goto(origin);
      await expect(page.locator('.react-flow__node')).toHaveCount(minor <= 3 ? 2 : 3);
      await expect(page.locator('.edition-badge')).toContainText(version);
      await page.screenshot({ path: path.join(output, `${version}-desktop.png`) });
      await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.screenshot({ path: path.join(output, `${version}-dark.png`) });
      await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
      const mobileContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      try {
        const mobile = await mobileContext.newPage();
        mobile.on('pageerror', (error) => errors.push(error.message));
        await mobile.goto(origin);
        await expect(mobile.locator('.react-flow__node')).toHaveCount(minor <= 3 ? 2 : 3);
        await mobile.waitForTimeout(400);
        await mobile.screenshot({ path: path.join(output, `${version}-mobile.png`) });
        assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await mobile.getByRole('button', { name: 'Settings', exact: true }).click();
        await expect(mobile.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
        await mobile.screenshot({ path: path.join(output, `${version}-settings.png`) });
        await mobile.keyboard.press('Escape');
      } finally {
        await mobileContext.close();
      }
      await page.getByRole('button', { name: 'New board', exact: true }).click();
      await expect(page.locator('.react-flow__node')).toHaveCount(0);
      await page.getByRole('button', { name: 'Add note', exact: true }).click();
      await expect(page.locator('.react-flow__node')).toHaveCount(1);
      await page
        .getByRole('textbox', { name: 'Node title', exact: true })
        .fill(`Saved note ${version}`);
      const note = page.getByRole('textbox', { name: 'Note content', exact: true });
      if ((await note.count()) === 0)
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await note.fill('A real note, saved locally.');
      await page.waitForTimeout(500);
      await page.reload();
      await expect(page.getByRole('textbox', { name: 'Node title', exact: true })).toHaveValue(
        `Saved note ${version}`,
      );
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Command palette', exact: true });
      await dialog.getByRole('combobox').fill('Export board backup (JSON)');
      const downloading = page.waitForEvent('download');
      await page.keyboard.press('Enter');
      const download = await downloading;
      const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
      assert.equal(backup.board.nodes.length, 1);
      assert.equal(backup.board.nodes[0].data.note, 'A real note, saved locally.');
      assert.deepEqual(errors, []);
      const file = path.join(cwd, 'verification.json');
      const verification = JSON.parse(await readFile(file, 'utf8'));
      verification.browser = {
        status: 'passed',
        scope:
          'production Chromium smoke: startup, API 404/origin rejection, starter cards, light/dark, mobile bounds, real settings, creation, editing, reload and JSON backup',
        screenshots: 4,
        pageErrors: errors,
        historicalFullSuite: 'not rerun against refreshed layouts',
      };
      await writeFile(file, JSON.stringify(verification, null, 2) + '\n');
      console.log(`${version}: production browser smoke passed; 4 screenshots`);
    } finally {
      await context.close();
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('close', resolve));
    }
  }
} finally {
  await browser.close();
}
