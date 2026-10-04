// Create new, traceable cleanup editions. Never edit or extract over an existing edition.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editions = [
  ['1.1.1', '1.1.2'],
  ['1.2.1', '1.2.2'],
  ['1.3.1', '1.3.2'],
  ['1.4.1', '1.4.2'],
  ['1.5.1', '1.5.2'],
  ['1.6.0', '1.6.1'],
  ['1.7.0', '1.7.1'],
];
const selected = process.argv.slice(2);
const requested = selected.length ? editions.filter(([, v]) => selected.includes(v)) : editions;
if (selected.some((v) => !editions.some(([, next]) => next === v)))
  throw Error('Unknown cleanup edition');
for (const [, version] of requested) {
  if (fs.existsSync(path.join(root, 'releases', `v${version}`)))
    throw Error(`Destination exists: ${version}`);
}

function splice(text, edits) {
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return text;
}
function listRemoval(node, source) {
  let start = node.getStart(source),
    end = node.end;
  while (/\s/.test(source.text[end] || '') && end < source.text.length) end++;
  if (source.text[end] === ',') end++;
  else {
    start = node.getStart(source);
    let previous = start - 1;
    while (previous >= 0 && /\s/.test(source.text[previous])) previous--;
    if (source.text[previous] === ',') start = previous;
  }
  return { start, end, text: '' };
}
function jsxRemoval(node) {
  let target = node;
  while (
    target.parent &&
    (ts.isParenthesizedExpression(target.parent) ||
      (ts.isBinaryExpression(target.parent) && target.parent.right === target) ||
      ts.isJsxExpression(target.parent))
  )
    target = target.parent;
  return target;
}
function transform(file, previous, version) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const remove = (node) => edits.push({ start: node.getStart(source), end: node.end, text: '' });
  function visit(node) {
    const value = node.getText(source);
    if (ts.isConditionalExpression(node) && /state\.group\b/.test(node.whenFalse.getText(source))) {
      edits.push({
        start: node.getStart(source),
        end: node.end,
        text: `${node.condition.getText(source)} && ${node.whenTrue.getText(source)}`,
      });
      return;
    }
    if (
      ts.isImportDeclaration(node) &&
      /ContextInspector/.test(node.moduleSpecifier.getText(source))
    ) {
      remove(node);
      return;
    }
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(source);
      const attributes = opening.attributes.getText(source);
      if (
        tag === 'ContextInspector' ||
        /setContextOpen\(|setContextId\(/.test(attributes) ||
        (/\bModal$/.test(tag) && /What the AI sees/.test(attributes)) ||
        /(?:onClick=\{state\.group\}|label="Group selection")/.test(attributes)
      ) {
        remove(jsxRemoval(node));
        return;
      }
    }
    if (
      ts.isObjectLiteralExpression(node) &&
      ts.isArrayLiteralExpression(node.parent) &&
      /label:\s*['"]Group selection['"]/.test(value)
    ) {
      edits.push(listRemoval(node, source));
      return;
    }
    if (
      ts.isArrayLiteralExpression(node) &&
      ts.isArrayLiteralExpression(node.parent) &&
      /['"]Group selection['"]/.test(value)
    ) {
      edits.push(listRemoval(node, source));
      return;
    }
    if (ts.isIfStatement(node) && /state\.group\(/.test(node.thenStatement.getText(source))) {
      edits.push({
        start: node.getStart(source),
        end: node.end,
        text: node.elseStatement?.getText(source) || '',
      });
      return;
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(source);
      if (name === 'selectionKeyCode') {
        edits.push({
          start: node.getStart(source),
          end: node.end,
          text: 'selectionKeyCode={["Control", "Meta"]}',
        });
        return;
      }
      if (name === 'selectionOnDrag') {
        edits.push({
          start: node.getStart(source),
          end: node.end,
          text: 'selectionOnDrag={false}',
        });
        return;
      }
      if (name === 'panOnDrag') {
        edits.push({ start: node.getStart(source), end: node.end, text: 'panOnDrag={[0, 1, 2]}' });
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  let result = splice(text, edits).replace(/Shift[- ]drag/g, 'Ctrl/⌘-drag');
  if (path.basename(file) === 'App.tsx') result = result.replaceAll(previous, version);
  fs.writeFileSync(file, result.replace(/^[ \t]+$/gm, ''));
}

// Remove only compiler-proven unused imports/variables introduced by the removals.
function cleanUnused(directory) {
  for (let pass = 0; pass < 12; pass++) {
    const config = ts.readConfigFile(path.join(directory, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory);
    const program = ts.createProgram(parsed.fileNames, {
      ...parsed.options,
      noEmit: true,
      incremental: false,
    });
    const edits = new Map();
    for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
      if (![6133, 6192, 6198].includes(diagnostic.code) || !diagnostic.file) continue;
      const source = diagnostic.file;
      let target;
      const find = (node) => {
        if (diagnostic.start >= node.getFullStart() && diagnostic.start < node.end) {
          target = node;
          ts.forEachChild(node, find);
        }
      };
      find(source);
      while (
        target &&
        !ts.isImportSpecifier(target) &&
        !ts.isImportDeclaration(target) &&
        !ts.isVariableDeclaration(target)
      )
        target = target.parent;
      if (!target)
        throw Error(
          `Cannot safely clean ${source.fileName}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
        );
      let edit;
      if (ts.isImportSpecifier(target)) {
        edit = listRemoval(target, source);
        if (target.parent.elements.length === 1 && !target.parent.parent.name) {
          target = target.parent.parent.parent;
          edit = { start: target.getStart(source), end: target.end, text: '' };
        }
      } else if (ts.isVariableDeclaration(target)) {
        if (target.parent.declarations.length === 1) {
          target = target.parent.parent;
          edit = { start: target.getStart(source), end: target.end, text: '' };
        } else edit = listRemoval(target, source);
      } else edit = { start: target.getStart(source), end: target.end, text: '' };
      const changes = edits.get(source.fileName) || [];
      if (!changes.some((e) => e.start === edit.start)) changes.push(edit);
      edits.set(source.fileName, changes);
    }
    if (!edits.size) return;
    for (const [file, changes] of edits)
      fs.writeFileSync(
        file,
        splice(fs.readFileSync(file, 'utf8'), changes).replace(/^[ \t]+$/gm, ''),
      );
  }
  throw Error(`Unused cleanup did not converge: ${directory}`);
}

for (const [previous, version] of requested) {
  const original = path.join(root, 'releases', `v${previous}`);
  const directory = path.join(root, 'releases', `v${version}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(original, 'manifest.json'), 'utf8'));
  const artifact = manifest.artifacts.find((a) => a.kind === 'source');
  const archive = path.join(original, artifact.file);
  if (createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== artifact.sha256)
    throw Error(`Original archive checksum mismatch: ${previous}`);
  execFileSync('python3', [
    '-c',
    `
import hashlib, json, pathlib, sys, tarfile
archive, destination, record = sys.argv[1:]
record = json.loads(record)
destination = pathlib.Path(destination)
allowed = {'src', 'server', 'public', 'tests'}
config = {'package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts','vitest.config.ts','playwright.config.ts','.env.example','.gitignore','.prettierignore','.prettierrc.json'}
with tarfile.open(archive) as tar:
    for member in tar.getmembers():
        assert member.isfile() and not member.issym() and not member.islnk()
        parts = pathlib.PurePosixPath(member.name).parts
        relative = pathlib.PurePosixPath(*parts[1:])
        assert '..' not in relative.parts and not relative.is_absolute()
        data = tar.extractfile(member).read()
        assert hashlib.sha256(data).hexdigest() == record[str(relative)]['sha256']
        if relative.parts[0] not in allowed and str(relative) not in config: continue
        if relative.parts[:2] == ('tests','e2e') or relative.name == 'ContextInspector.tsx': continue
        target = destination.joinpath(*relative.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
`,
    archive,
    directory,
    JSON.stringify(artifact.files),
  ]);
  for (const name of ['package.json', 'package-lock.json']) {
    const file = path.join(directory, name),
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.version = version;
    if (data.packages) data.packages[''].version = version;
    if (data.scripts) {
      delete data.scripts.screenshot;
      data.scripts['test:e2e'] = 'playwright test';
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
  const sourceFiles = fs
    .readdirSync(path.join(directory, 'src'), { recursive: true })
    .filter((n) => /\.(tsx?|css)$/.test(n))
    .map((n) => path.join(directory, 'src', n));
  for (const file of sourceFiles.filter((n) => /\.tsx?$/.test(n)))
    transform(file, previous, version);
  const nodes = path.join(directory, 'src/components/Nodes.tsx');
  if (Number(version.split('.')[1]) >= 2) {
    let text = fs.readFileSync(nodes, 'utf8');
    text = text.replace(
      "{type !== 'group' && <Ports",
      `{data.contextTokenLimit && <button className="nodrag nopan" onClick={() => update({ contextTokenLimit: undefined, error: undefined }, true)}>Remove old input limit</button>}
      {type !== 'group' && <Ports`,
    );
    fs.writeFileSync(nodes, text.replace(/^[ \t]+$/gm, ''));
  }
  const css = path.join(directory, 'src', 'cleanup.css');
  fs.writeFileSync(css, '.react-flow__nodesselection-rect { pointer-events: none; }\n');
  const entry = path.join(directory, 'src/main.tsx');
  fs.appendFileSync(entry, '\nimport "./cleanup.css";\n');
  cleanUnused(directory);
  fs.mkdirSync(path.join(directory, 'tests/e2e'), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'scripts/cleanup-smoke.spec.ts.template'),
    path.join(directory, 'tests/e2e/cleanup.spec.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'scripts/cleanup-playwright.config.ts.template'),
    path.join(directory, 'playwright.config.ts'),
  );
  const sourcePath = path.relative(root, directory);
  fs.writeFileSync(
    path.join(directory, 'README.md'),
    `# BranchBoard ${version} — Canvas cleanup\n\nA new, explicitly identified revision of ${previous}. The original tagged source and artifacts remain recoverable; this is not a rewritten historical release.\n\nRemoved context-inspection and persistent-group creation controls. Ctrl/Command-drag draws a selection rectangle; Shift-click changes selection; Space/middle drag pans. Existing parent groups, context settings and historical branches remain readable. No later feature set was backported.\n\nNode.js 22.12+: npm ci, npm run build, npm start. Open http://127.0.0.1:3001. Keys stay server-side. Back up browser work before changing origin/edition. No paid model test was performed.\n\nSee the download's adjacent verification.json for exact checks. The dedicated cleanup smoke replaces obsolete UI-layout tests, not the unit/HTTP suite. Source: ${sourcePath}. Private local distribution; no license selected.\n`,
  );
  fs.writeFileSync(
    path.join(directory, 'AGENTS.md'),
    '# Cleanup edition\n\nOwner-authorized new edition. Follow the root security/data/graph invariants. Preserve older tagged artifacts. No context-inspection or persistent-group creation UI. Existing legacy group/context data must remain compatible.\n',
  );
  fs.writeFileSync(
    path.join(directory, 'RELEASE_NOTES.md'),
    `# BranchBoard ${version} — Canvas cleanup\n\nDerived from ${previous}, source archive SHA256 ${artifact.sha256}. New identity; no retagging of the original. Removes context-inspection and group-creation entry points, with native rectangle selection and compatible legacy data.\n\nPrivate local source/runtime. Source: npm ci, npm run build, npm start. Runtime: npm ci --omit=dev, npm start. Node.js 22.12+, http://127.0.0.1:3001. Back up browser work before switching origin. No paid AI verification, hosted service, database migration or license selection. Exact evidence is adjacent to the download.\n`,
  );
  fs.writeFileSync(
    path.join(directory, 'verification.json'),
    JSON.stringify(
      {
        version,
        title: 'Canvas cleanup',
        date: '2026-10-24',
        derivedFrom: {
          version: previous,
          sourceArchiveSha256: artifact.sha256,
          sourceCommit: manifest.sourceCommit,
        },
        build: 'pending',
        unitAndHttp: { status: 'pending' },
        browser: { status: 'pending' },
        screenshots: { inspected: false },
        cleanInstall: { status: 'pending' },
        runtimeExpectations: {
          starterNodes: Number(version.split('.')[1]) <= 3 ? 2 : 3,
          settingsRole: 'dialog',
          settingsName: 'Settings',
        },
        paidProviderRequests: false,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Created ${version} from verified ${previous} source archive`);
}
