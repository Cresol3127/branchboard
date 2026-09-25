# Branchboard — contributor guide

## Scope and guardrails

- Implement the working canvas/node/conversation core described in `SPEC.md`; the specification also contains future features that are not implemented.
- Release work is explicitly authorized by the owner: preserve original editions and artifacts, create a verified external backup before changes, and label redesigned editions with new versions and provenance. Never silently rewrite historical artifacts. Leave the pre-existing `data/` directory alone; it is not application storage.
- Do not add placeholder AI, synthetic answers, nonfunctional controls, or hard-coded credentials. Deterministic AI fixtures belong only in tests.
- This is a single-user local-first application, not a public authenticated service.

## Stack

- React 19, strict TypeScript, Vite 7; Node.js 22.12+.
- `@xyflow/react` for canvas coordinates, drag/selection, handles/edges, resizing, grid and minimap.
- Zustand for the workspace, node actions, streaming state and undo/redo.
- Express 5 + native `fetch`/AbortController for streaming provider adapters. `tsx` runs TypeScript in development; esbuild bundles the production server, which runs directly in Node. `concurrently` runs both dev processes.
- `react-markdown` + `remark-gfm` for rendered assistant text (no raw HTML), Lucide icons, CSS, locally bundled Roboto Variable.
- Vitest for pure/store/HTTP tests; Playwright for actual Chromium interactions.

## Directory structure

```text
src/
  main.tsx              React entry and stylesheet imports
  App.tsx               Workspace shell, sidebar, React Flow canvas, tools, shortcuts, import/export
  types.ts              Message, NodeData, BoardNode and Board contracts
  graph.ts              Cycle checks, context traversal, coordinates, layout (pure functions)
  theme.ts              Material color roles generated from the sage-green seed
  store.ts              Workspace actions, history snapshots, generation, autosave, import validation
  styles.css            Interaction geometry and baseline component styles
  material.css          Material semantic roles and responsive presentation
  components/
    Nodes.tsx           Chat/note/group node UI, composer, Markdown, context inspector
    Settings.tsx        API-key settings and shortcut reference
    ui.tsx              Accessible icon buttons and focus-trapped portal dialogs
server/
  index.ts              Environment configuration and listener
  app.ts                createApp factory, config/chat API, security, static production serving
  stream.ts             Shared incremental UTF-8/SSE parser (also used by browser)
tests/
  graph.test.ts         Context merging, DAG validation and layout
  stream.test.ts        Arbitrary byte boundaries, UTF-8, CRLF and cancellation
  store.test.ts         Node operations, import/persistence, generation/history
  server.test.ts        Real HTTP integration against a local SSE test provider
  e2e/workspace.spec.ts Browser navigation, graph operations, AI/history and backup flows
public/favicon.svg     Brand mark
vite.config.ts         React plugin, local API proxy, production chunk splitting
vitest.config.ts       Node test configuration
playwright.config.ts   Browser and dev-server configuration
.env.example           Server-side configuration template; never commit .env
```

## Conventions and invariants

- Use typed React function components, hooks, ESM imports, and functional immutable state updates. Keep graph logic pure in `src/graph.ts`; put mutations in `src/store.ts`.
- Format source with Prettier (`npm run format`): two-space indentation, single quotes, semicolons, trailing commas, 100-column target. TypeScript also checks unused locals and parameters.
- IDs come from `crypto.randomUUID()`. Import remaps **all** node, parent and edge IDs so two copies cannot share active generation IDs. Group parents precede their children in the node array. Child positions are parent-relative; use `absolutePosition` for world coordinates.
- Nodes are `chat`, `note`, or `group`; data always includes title, color, messages, and note. Group children are found through `parentId`. Group deletion removes descendants and their edges; ungrouping preserves world positions.
- Connections are a directed acyclic graph. All connection paths, including imports, must reject self-links, duplicates and cycles. Context traversal is parent-first and visits shared ancestors once; connected notes become explicit user context. A branch gets an edge, not a copy of its ancestor’s messages.
- Call `checkpoint()` **before** a user mutation or at the start of a drag/resize/edit, not for every pointer movement, keystroke or streaming token. Keep selection changes out of history. Undo/redo is intentionally disabled during generation.
- A stream is associated with its **originating board and node**, even if the user switches canvases. Abort when stopping/deleting, preserve partial content, report provider/transport errors, and never silently substitute fake content. Regenerate removes the last assistant reply without duplicating the user turn.
- Credentials remain on the server. `GET /api/config` returns public provider configuration/status and model IDs, never keys. `POST /api/config` accepts a validated provider patch (and legacy `{ apiKey }`), persisted atomically with owner-only permissions. `POST /api/chat` accepts `{ provider, model, messages }`; endpoint URLs come only from validated server configuration. Responses are SSE JSON events `{ token }`, `{ done: true }`, or `{ error }`. Unknown API routes return JSON 404, not the SPA.
- Do not enable permissive CORS. Preserve same-origin validation, body/message limits, concurrent-stream limits, timeout and disconnect cancellation. Never use `VITE_` variables for secrets. The server is local-only by default; production hosting would need authentication and per-user keys.
- The development API proxy must preserve the browser's Host (`changeOrigin: false`), so legitimate settings/chat POST requests pass the same-origin guard. Test the actual Vite proxy, not only direct API calls or browser route fixtures.
- Browser workspace storage is `{ boards, currentId, organization? }` at `branchboard.workspace.v1`; named snapshots use `branchboard.snapshots.v1`. Autosave is debounced 350 ms and flushed on pagehide. Never overwrite unreadable saved data silently; show a warning. Quota failures must be visible. Board JSON export is `{ version: 1, board }`; workspace backups additionally carry all boards, organization and snapshots. Validate the entire import before changing workspace state. App release versions are independent of backup schema versions.
- Default cloud model updates use keyless public catalogs (`GET /api/models/catalog`); never automatically use saved cloud keys for discovery. Only fixed public source URLs may be fetched, without credentials or workspace data. Public IDs are not proof of account access or adapter compatibility. Keep the disposable `branchboard.model-catalog.v1` browser cache separate from workspace/history/backups, retain previous lists on failures, and preserve all selected/custom/default IDs. Local Ollama discovery remains installed-model-only; authenticated cloud/custom discovery is explicit.
- Use shared `Modal` (portaled outside the transformed canvas) and `IconButton`; give every icon-only control an accessible label. Keep keyboard shortcuts inactive in text inputs and dialogs. Cards drag from their non-interactive surface with a 5px threshold; use `nodrag` on controls and `nowheel` on scrolling regions. T enables text-selection mode; touch scrolling inside content must remain available.
- CSS uses Material semantic color roles, neutral surfaces, restrained sage accents, and locally bundled Roboto. New installations follow the system theme; saved light/dark/system preferences remain respected at `branchboard.theme`. Keep canvas tools contextual and maintain readable mobile navigation. Workspace data never includes credentials; assets must not require remote fonts or images.
- Grid/snapping and the interactive minimap are optional canvas toggles, available through the board tools or command palette. The command palette (Ctrl/Command K) is the searchable entry point for workspace actions, board switching, and node navigation.
- Connection suggestions use a 20-screen-pixel radius and must still pass DAG validation. Alt-drag repositions each port independently; a short Alt-drag resets that port. Dropping a dragged node within 35 pixels of another node's output creates a fresh chat branch and restores the dragged node; Shift-drag bypasses branching.

## Commands and validation

```sh
npm install
npm run dev          # Vite on 3000 + API on PORT (3001 default)
npm run build        # must pass with no TS errors before delivery
npm start            # serves dist + API, requires prior build
npm test
npm run test:e2e     # requires Playwright Chromium and platform libraries
npm run format      # format maintained source/docs, excludes releases/ and data/
```

Run both test suites after graph, persistence, streaming or interaction changes. E2E AI responses are deterministic route fixtures; HTTP tests cover the actual proxy protocol against a local provider. Do not claim a live paid-provider check unless a real key/request was used. Respect `.gitignore` and keep test artifacts, `.env`, `node_modules`, and `dist` out of source control.

## QA Protocol

After implementing any feature:

1. Run the screenshot script (scripts/screenshot.mjs)
2. Look at the output
3. Fix visual issues and non-functional elements
4. Re-screenshot to verify
   Do NOT consider a feature done until the screenshot looks correct.
