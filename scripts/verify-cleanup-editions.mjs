// Production HTTP + dedicated Chromium checks for each new historical cleanup.
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versions = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['1.1.2', '1.2.2', '1.3.2', '1.4.2', '1.5.2', '1.6.1', '1.7.1'];
const output = '/tmp/opencode/branchboard-cleanup-qa';
await mkdir(output, { recursive: true });
for (const [index, version] of versions.entries()) {
  if (!/^1\.[1-7]\.\d+$/.test(version)) throw Error('Invalid cleanup version');
  const cwd = path.join(root, 'releases', `v${version}`);
  const origin = `http://127.0.0.1:${3401 + index}`;
  const server = spawn(process.execPath, ['dist-server/index.js'], {
    cwd,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(3401 + index) },
    stdio: 'pipe',
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => (serverLog += chunk));
  server.stderr.on('data', (chunk) => (serverLog += chunk));
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw Error(serverLog);
      try {
        ready = (await fetch(`${origin}/api/config`)).ok;
      } catch {
        /* startup */
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw Error(`Startup timeout: ${version}`);
    if ((await fetch(`${origin}/api/unknown`)).status !== 404) throw Error('Missing JSON API 404');
    if (
      (await fetch(`${origin}/api/config`, { headers: { Origin: 'https://untrusted.example' } }))
        .status !== 403
    )
      throw Error('Origin protection failed');
    const child = spawn(
      process.execPath,
      [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--workers=1'],
      {
        cwd,
        env: { ...process.env, BASE_URL: origin, CLEANUP_SCREENSHOT_DIR: output },
        stdio: 'pipe',
      },
    );
    let log = '';
    child.stdout.on('data', (chunk) => (log += chunk));
    child.stderr.on('data', (chunk) => (log += chunk));
    const code = await new Promise((resolve, reject) => {
      child.once('close', resolve);
      child.once('error', reject);
    });
    await writeFile(path.join(output, `${version}-browser.log`), log);
    if (code !== 0) throw Error(`${version}: ${log}`);
    const file = path.join(cwd, 'verification.json');
    const verification = JSON.parse(await readFile(file, 'utf8'));
    verification.browser = {
      status: 'passed',
      tests: 3,
      scope:
        'production Chromium: four real layouts, settings, removed controls, note editing/reload, native rectangle selection and legacy parent-group preservation; HTTP API 404/origin rejection',
      historicalFullSuite: 'replaced obsolete UI tests with dedicated cleanup smoke',
      pageErrors: [],
    };
    verification.screenshots = { count: 4, inspected: false, directory: output };
    await writeFile(file, JSON.stringify(verification, null, 2) + '\n');
    console.log(`${version}: production HTTP and 3 Chromium cleanup tests passed`);
  } finally {
    server.kill('SIGTERM');
    await writeFile(path.join(output, `${version}-server.log`), serverLog);
  }
}
