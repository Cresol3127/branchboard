// Creates new, explicitly labeled editions. Never edits an original release.
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const inputs = ['src', 'server', 'public', 'tests', 'scripts'];
const configs = [
  'package.json',
  'package-lock.json',
  'index.html',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  '.env.example',
  '.gitignore',
  '.prettierignore',
  '.prettierrc.json',
];
const material = await read('src/material.css');
const theme = await read('src/theme.ts');
const layout = (await read('src/graph.ts')).split('export function layoutNodes(')[1];

for (const minor of [1, 2, 3, 4, 5]) {
  const original = `releases/v1.${minor}`;
  const version = `1.${minor}.1`;
  const destination = `releases/v${version}`;
  try {
    await access(path.join(root, destination));
    throw new Error(`${destination} already exists; refusing to overwrite an edition.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(path.join(root, destination), { recursive: true });
  for (const name of [...inputs, ...configs]) {
    try {
      await cp(path.join(root, original, name), path.join(root, destination, name), {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const edit = async (file, transform) => {
    const target = path.join(root, destination, file);
    await writeFile(target, transform(await readFile(target, 'utf8')));
  };
  await edit('package.json', (text) => {
    const pkg = JSON.parse(text);
    pkg.version = version;
    pkg.dependencies['@fontsource-variable/roboto'] = '^5.3.0';
    pkg.devDependencies.esbuild = '^0.28.2';
    pkg.scripts.build =
      'tsc --noEmit && vite build && esbuild server/index.ts --bundle --platform=node --format=esm --packages=external --outfile=dist-server/index.js';
    pkg.scripts.start = 'node dist-server/index.js';
    return JSON.stringify(pkg, null, 2) + '\n';
  });
  await edit('package-lock.json', (text) => {
    const lock = JSON.parse(text);
    lock.version = version;
    lock.packages[''].version = version;
    lock.packages[''].dependencies['@fontsource-variable/roboto'] = '^5.3.0';
    lock.packages[''].devDependencies.esbuild = '^0.28.2';
    return JSON.stringify(lock, null, 2) + '\n';
  });
  await edit('src/main.tsx', (text) =>
    text
      .replace(/import '@fontsource\/[^']+';\n/g, '')
      .replace(
        "import './styles.css';",
        "import '@fontsource-variable/roboto/wght.css';\nimport './styles.css';\nimport './material.css';\nimport './edition.css';",
      ),
  );
  await writeFile(path.join(root, destination, 'src/material.css'), material);
  await writeFile(path.join(root, destination, 'src/theme.ts'), theme);
  await edit('src/App.tsx', (text) => {
    let app = text
      .replaceAll("colorTokens('#7b65c7'", "colorTokens('#8DB89A'")
      .replace("|| 'dark'", "|| 'system'")
      .replace(/<span>Personal space<\/span>\s*<span>\/<\/span>\s*/g, '')
      .replace(/\s*<IconButton label="Export board backup \(JSON\)"[^]*?<\/IconButton>/, '')
      .replace('  ArrowUpFromLine,\n', minor <= 3 ? '' : '  ArrowUpFromLine,\n')
      .replace(
        "<h1>{board.name || 'Untitled canvas'}</h1>",
        `<h1>${minor <= 3 ? 'A thought. A connection.' : 'Your ideas, connected.'}</h1>\n            <span className="edition-badge">${minor <= 3 ? 'Prototype' : 'Refreshed edition'} · ${version}</span>`,
      );
    if (minor <= 3) {
      app = app
        .replace(/\s*<div className="workspace-section">[^]*?<\/div>\s*<\/div>/, '')
        .replace('  FolderOpen,\n', '');
    }
    // Move creation above navigation, rather than mixing actions with saved canvases.
    const create = app.match(
      /            <button\s+className="board-link new-board"[^]*?<\/button>/,
    );
    if (!create) throw new Error(`Missing creation control in ${original}`);
    app = app
      .replace(create[0], '')
      .replace('</a>', `</a>\n${create[0].replace('New board</span>', 'New canvas</span>')}`);
    app = app.replace(
      /(if \(!board.viewport\) |else )void flow.fitView\(\{ padding: (0.18|fitPadding\(\)), maxZoom: 1 \}\);/g,
      (_, prefix, padding) => `${prefix}{
        const reading = window.matchMedia('(max-width: 700px)').matches && board.nodes.find((n) => n.type === 'chat');
        void flow.fitView({ padding: ${padding}, maxZoom: 1, ...(reading ? { nodes: [{ id: reading.id }], minZoom: ${minor === 5 ? 0.75 : 0.65} } : {}) });
      }`,
    );
    return app;
  });
  if (minor <= 3) {
    await edit('src/store.ts', (text) =>
      text
        .replace(
          /  const second = makeNode\('note'[^]*?  board.nodes = \[chat, note, second\];/,
          '  board.nodes = [chat, note];',
        )
        .replace("'A little space for big ideas'", "'Connect a thought'"),
    );
  }
  // Backport a data-safety fix, without adding features from later editions.
  await edit('src/components/Nodes.tsx', (text) =>
    text.replace(
      '.updateNode(id, { portPositions: { ...node?.data.portPositions, [kind]: point } });',
      '.updateNode(id, { portPositions: Object.fromEntries(Object.entries({ ...node?.data.portPositions, [kind]: point }).filter(([, value]) => value !== undefined)) });',
    ),
  );
  await edit('src/graph.ts', (text) =>
    text.replace(/export function layoutNodes\([^]*/, 'export function layoutNodes(' + layout),
  );
  await edit('server/app.ts', (text) =>
    text.replace(
      '  app.use(express.static(',
      "  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));\n  app.use(express.static(",
    ),
  );
  await writeFile(
    path.join(root, destination, 'src/edition.css'),
    `/* Only this refreshed edition; original source remains unchanged. */
:root, :root[data-theme='dark'] { --purple: var(--primary); }
.workspace-header { background: var(--app-bg); }
.offline-dot { background: var(--muted); }
.active-dot, .react-flow__handle { background: var(--primary); }
.edition-badge { display: block; color: var(--muted); font-size: 12px; margin-bottom: 8px; }
.canvas-caption { max-width: calc(100% - 340px); }
.workspace-sidebar > .search-button { margin-bottom: 16px; width: 100%; }
.workspace-sidebar { overflow-y: auto; }
.canvas-caption h1 { font-size: ${minor <= 3 ? 18 : 20}px; }
.board-tools { top: 24px; }
.composer .icon-button { color: var(--md-sys-color-on-primary); }
${minor <= 3 ? '.local-status { font-size: 11px; }\n.node-heading { height: 44px; min-height: 44px; }' : ''}
@media (max-width: 700px) {
  .workspace-sidebar > .search-button { padding: 12px; margin-bottom: 8px; }
  .workspace-sidebar > .search-button span, .workspace-sidebar > .search-button kbd { display: none; }
  .canvas-caption { display: none; }
}
`,
  );
  await writeFile(
    path.join(root, destination, 'README.md'),
    `# BranchBoard ${version} — ${minor <= 3 ? 'prototype' : 'refreshed'} edition

Created 2026-10-22 from the preserved v1.${minor} snapshot (whose embedded package version was 1.0.0). This is a new, explicitly labeled redesign, not a claim about the original release date or appearance.

## Run locally
Node.js 22.12+; npm ci, npm run build, npm start; open http://127.0.0.1:3001. Development: npm run dev on port 3000. Credentials stay server-side. Use a separate browser profile/origin when comparing editions: browser storage is shared by origin, not app version. Export your workspace first.

## Scope
${minor <= 3 ? 'A focused working prototype: two starter cards, real conversations and Markdown notes, connections, branching, provider settings, undo and portable board backups.' : 'Preserves this snapshot’s real features, with neutral Material surfaces, locally bundled Roboto, clearer navigation and reduced decoration.'}
${minor === 2 ? 'Includes inherited-context controls and estimates.\n' : ''}${minor === 3 ? 'Includes context controls and searchable editable conversation history.\n' : ''}${minor === 4 ? 'Includes annotations, rich notes, canvas export, imports, organization and snapshots.\n' : ''}${minor === 5 ? 'Includes the fixed composer, text-selection tools and automatic model discovery.\n' : ''}
No mock AI, new storage migration, automatic recovery, attachment feature or hosted service was added. Auto-layout performance, port reset serialization and unknown API responses receive focused maintenance fixes. Original source/builds remain at ../v1.${minor}/ and in the external pre-redesign backup.

See the download's adjacent verification.json for actual checks; inherited browser tests document original layouts and are not a claim that this edition passed them unchanged. Release evidence uses the refreshed-edition smoke suite. No paid provider request was made. No distribution license has been selected by the owner; do not infer one.
`,
  );
  await writeFile(
    path.join(root, destination, 'AGENTS.md'),
    '# Refreshed edition\n\nOwner-authorized new edition. Preserve its source and provenance; never edit the original sibling snapshot. Keep credentials server-side, local-only defaults, validated DAG context and independent portable backups. Follow the maintained root contributor guide.\n',
  );
  console.log(`Created ${destination} from ${original}`);
}
