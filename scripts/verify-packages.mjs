// Verify private downloads independently; keep fresh installs/logs in /tmp/opencode.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = await mkdtemp('/tmp/opencode/branchboard-release-verify-');
const requested = process.argv.slice(2);
const versions = requested.length
  ? requested
  : ['1.1.1', '1.2.1', '1.3.1', '1.4.1', '1.5.1', '1.6.0'];
if (versions.some((version) => !/^\d+\.\d+\.\d+$/.test(version)))
  throw new Error('Pass explicit release versions, for example: 1.7.0');
const browser = await chromium.launch();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(command, args, cwd, logName) {
  let log = '';
  const child = spawn(command, args, { cwd, env: process.env });
  child.stdout.on('data', (data) => (log += data));
  child.stderr.on('data', (data) => (log += data));
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  await writeFile(path.join(output, logName), log);
  if (code !== 0)
    throw new Error(`${command} ${args.join(' ')} failed: ${logName}\n${log.slice(-5000)}`);
  return log.replace(/\u001b\[[0-9;]*m/g, '');
}

try {
  for (const [index, version] of versions.entries()) {
    const release = path.join(root, 'releases', `v${version}`);
    const manifest = JSON.parse(await readFile(path.join(release, 'manifest.json'), 'utf8'));
    const expected = JSON.parse(await readFile(path.join(release, 'verification.json'), 'utf8'))
      .runtimeExpectations || {
      starterNodes: ['1.1.1', '1.2.1', '1.3.1'].includes(version) ? 2 : 3,
      settingsRole: 'dialog',
      settingsName: 'Settings',
    };
    if (
      !Number.isInteger(expected.starterNodes) ||
      !['dialog', 'region'].includes(expected.settingsRole)
    )
      throw new Error(`Invalid runtime expectations: ${version}`);
    const checks = {};
    for (const kind of ['source', 'runtime']) {
      const artifact = manifest.artifacts.find((entry) => entry.kind === kind);
      const archive = path.join(release, artifact.file);
      const bytes = await readFile(archive);
      if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256)
        throw new Error(`Checksum mismatch: ${archive}`);
      const destination = path.join(output, `${version}-${kind}`);
      await mkdir(destination);
      // The data filter rejects traversal/special files; also compare every byte
      // of the extracted inventory against the release manifest.
      await run(
        'python3',
        [
          '-c',
          `
import hashlib, json, pathlib, sys, tarfile
archive, destination, manifest, kind = sys.argv[1:]
record = next(a for a in json.loads(pathlib.Path(manifest).read_text())['artifacts'] if a['kind'] == kind)
with tarfile.open(archive) as tar:
    assert all(m.isfile() and not m.issym() and not m.islnk() for m in tar.getmembers())
    tar.extractall(destination, filter='data')
base = next(pathlib.Path(destination).iterdir())
actual = {p.relative_to(base).as_posix(): {'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size} for p in base.rglob('*') if p.is_file()}
assert actual == record['files'], 'Extracted inventory differs from manifest'
`,
          archive,
          destination,
          path.join(release, 'manifest.json'),
          kind,
        ],
        root,
        `${version}-${kind}-extract.log`,
      );
      const cwd = path.join(destination, `branchboard-${version}`);
      await run(
        'npm',
        kind === 'source' ? ['ci'] : ['ci', '--omit=dev'],
        cwd,
        `${version}-${kind}-install.log`,
      );
      if (kind === 'source') {
        await run('npm', ['run', 'build'], cwd, `${version}-source-build.log`);
        const tests = await run('npm', ['test'], cwd, `${version}-source-test.log`);
        const count = Number(tests.match(/Tests\s+(\d+) passed/)?.[1]);
        if (!count) throw new Error(`Missing passing test summary for ${version}`);
        checks.source = {
          status: 'passed',
          artifactSha256: artifact.sha256,
          commands: ['npm ci', 'npm run build', 'npm test'],
          tests: count,
          extractedInventory: 'matched manifest',
        };
      } else {
        for (const name of ['tsx', 'typescript', '@playwright/test']) {
          const present = await access(path.join(cwd, 'node_modules', name)).then(
            () => true,
            () => false,
          );
          if (present) throw new Error(`Unexpected development dependency in runtime: ${name}`);
        }
        const port = 3201 + index;
        const url = `http://127.0.0.1:${port}`;
        let serverLog = '';
        const server = spawn('npm', ['start'], {
          cwd,
          detached: true,
          env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
        });
        server.stdout.on('data', (data) => (serverLog += data));
        server.stderr.on('data', (data) => (serverLog += data));
        const context = await browser.newContext({
          viewport: { width: 1440, height: 960 },
          colorScheme: 'light',
          reducedMotion: 'reduce',
        });
        try {
          let ready = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            if (server.exitCode !== null) throw new Error(`Runtime exited: ${serverLog}`);
            try {
              ready = (await fetch(url)).ok;
            } catch {
              /* Listener not ready. */
            }
            if (ready) break;
            await pause(100);
          }
          if (!ready) throw new Error(`Runtime startup timeout: ${version}`);
          const config = await fetch(`${url}/api/config`);
          if (config.status !== 200 || !(await config.json()).providers)
            throw new Error('Invalid public configuration');
          const unknown = await fetch(`${url}/api/not-a-route`);
          if (unknown.status !== 404 || !(await unknown.json()).error)
            throw new Error('Missing API JSON 404');
          if (
            (await fetch(`${url}/api/config`, { headers: { Origin: 'https://untrusted.example' } }))
              .status !== 403
          )
            throw new Error('Origin protection failed');
          const page = await context.newPage();
          const errors = [];
          const unavailableProviders = [];
          page.on('pageerror', (error) => errors.push(error.message));
          page.on('requestfailed', (request) =>
            errors.push(`${request.url()}: ${request.failure()?.errorText}`),
          );
          page.on('response', (response) => {
            if (
              response.status() === 502 &&
              response.url() === `${url}/api/providers/ollama/models`
            )
              unavailableProviders.push(
                'Ollama model discovery: local service unavailable (HTTP 502)',
              );
            else if (response.status() >= 400)
              errors.push(`${response.status()}: ${response.url()}`);
          });
          await page.goto(url, { waitUntil: 'networkidle' });
          await page.locator('.react-flow__node').first().waitFor();
          await page.evaluate(() => document.fonts.ready);
          const nodeCount = await page.locator('.react-flow__node').count();
          if (nodeCount !== expected.starterNodes)
            throw new Error(`Unexpected starter nodes: ${nodeCount}`);
          await page.getByRole('button', { name: 'Settings', exact: true }).click();
          await page
            .getByRole(expected.settingsRole, { name: expected.settingsName, exact: true })
            .waitFor();
          await page.screenshot({
            path: path.join(output, `${version}-runtime.png`),
            animations: 'disabled',
          });
          if (errors.length) throw new Error(`Production browser errors: ${errors.join('\n')}`);
          checks.runtime = {
            status: 'passed',
            artifactSha256: artifact.sha256,
            commands: ['npm ci --omit=dev', 'npm start'],
            developmentDependenciesAbsent: true,
            extractedInventory: 'matched manifest',
            http: ['frontend', 'public config', 'JSON API 404', 'origin rejection'],
            chromium: `rendered ${expected.starterNodes} starter cards, local assets/fonts and working settings ${expected.settingsRole}`,
            pageErrors: errors,
            unavailableProviders,
          };
        } finally {
          await context.close();
          try {
            process.kill(-server.pid, 'SIGTERM');
          } catch {
            /* Already stopped. */
          }
          await writeFile(path.join(output, `${version}-runtime-server.log`), serverLog);
        }
      }
    }
    const file = path.join(release, 'verification.json');
    const verification = JSON.parse(await readFile(file, 'utf8'));
    verification.cleanInstall = {
      status: 'passed',
      node: process.version,
      platform: process.platform,
      ...checks,
    };
    await writeFile(file, JSON.stringify(verification, null, 2) + '\n');
    console.log(
      `${version}: extracted source install/build/${checks.source.tests} tests and production-only runtime/browser passed`,
    );
  }
  console.log(`Fresh installs, logs and runtime screenshots: ${output}`);
} finally {
  await browser.close();
}
