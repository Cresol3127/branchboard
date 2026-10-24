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
  families.ts           Conversation-family assignment and edge color mapping
  theme.ts              Material color roles generated from the sage-green seed
  store.ts              Workspace actions, history snapshots, generation, autosave, import validation
  styles.css            Interaction geometry and baseline component styles
  material.css          Material semantic roles and responsive presentation
  workspace.css         Window frames, snapping, quiet cards and measured canvas tools
  motion.ts / motion.css Material 3 Expressive spatial/effects tokens and presentation-only transitions
  workspacePanels.ts    Multi-window registry, dock/snap/maximize behavior and layout persistence
  windowGeometry.ts     Pure desk-relative window move, resize, snap and bounds geometry
  components/
    Nodes.tsx           Titleless chat/note UI, legacy groups, ports and contextual actions
    Settings.tsx        Models/testing, workspace preferences and Help panel bodies
    ui.tsx              Persistent panel frames, transient Modal, anchored menus/buttons
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
- Persistent group creation and context-inspection UI are removed. Keep legacy group/context data, DAG inheritance, historical cutoffs and old title metadata compatible. Ctrl/Command-drag selects a rectangle only; Shift-click toggles individual selection. Never create containers from selection. Legacy blocking input limits need an undoable reset that preserves the draft.
- Connections are a directed acyclic graph. All connection paths, including imports, must reject self-links, duplicates and cycles. Context traversal is parent-first and visits shared ancestors once; connected notes become explicit user context. A branch gets an edge, not a copy of its ancestor’s messages.
- Call `checkpoint()` **before** a user mutation or at the start of a drag/resize/edit, not for every pointer movement, keystroke or streaming token. Keep selection changes out of history. Undo/redo is intentionally disabled during generation.
- A stream is associated with its **originating board and node**, even if the user switches canvases. Abort when stopping/deleting, preserve partial content, report provider/transport errors, and never silently substitute fake content. Regenerate removes the last assistant reply without duplicating the user turn.
- Credentials remain on the server. `GET /api/config` returns public provider configuration/status and model IDs, never keys. `POST /api/config` accepts a validated provider patch (and legacy `{ apiKey }`), persisted atomically with owner-only permissions. `POST /api/chat` accepts `{ provider, model, messages }`; endpoint URLs come only from validated server configuration. Responses are SSE JSON events `{ token }`, `{ done: true }`, or `{ error }`. Unknown API routes return JSON 404, not the SPA.
- Do not enable permissive CORS. Preserve same-origin validation, body/message limits, concurrent-stream limits, timeout and disconnect cancellation. Never use `VITE_` variables for secrets. The server is local-only by default; production hosting would need authentication and per-user keys.
- The development API proxy must preserve the browser's Host (`changeOrigin: false`), so legitimate settings/chat POST requests pass the same-origin guard. Test the actual Vite proxy, not only direct API calls or browser route fixtures.
- Browser workspace storage is `{ boards, currentId, organization? }` at `branchboard.workspace.v1`; named snapshots use `branchboard.snapshots.v1`. Autosave is debounced 350 ms and flushed on pagehide. Never overwrite unreadable saved data silently; show a warning. Quota failures must be visible. Board JSON export is `{ version: 1, board }`; workspace backups additionally carry all boards, organization and snapshots. Validate the entire import before changing workspace state. App release versions are independent of backup schema versions.
- Default cloud model updates use keyless public catalogs (`GET /api/models/catalog`); never automatically use saved cloud keys for discovery. Only fixed public source URLs may be fetched, without credentials or workspace data. Public IDs are not proof of account access or adapter compatibility. Catalog protocol/cache version 2 (`branchboard.model-catalog.v2`) contains only latest-known conversation generations selected by the reviewed family/version policy in `src/modelGeneration.ts`; do not trust or migrate the old ID-only cache as verified recommendations. OpenRouter's native list must not reintroduce older/unreviewed IDs. Retain verified lists on failures and preserve selected/custom/default IDs separately. Local Ollama discovery remains installed-model-only; authenticated cloud/custom discovery is explicit.
- Persistent panels mount in `WorkspacePanelHost` beside the sidebar; Models and Settings are independent, with one docked panel, multiple floating panels and at most one snapped panel. First open docks; another open panel floats; opening an existing panel raises it; docking swaps the previous docked panel to floating; snapping releases the dock. Snap left/right/top/bottom must move the canvas to the opposite half, never underneath the window. Maximize fills the desk and releases the dock. Use the multi-window registry, dirty-form navigation, target board/node/message IDs and stale-async guards. Desktop canvas remains directly usable; below 820px usable workspace width, open panels become full-stage sheets and the main workspace is inert, not unmounted. Opening or restoring panels never resets the graph viewport. Preserve focus/z-order, drag/resize bounds, 320x280 minimums and 44px controls. Persist only mode and last floating bounds per panel at `branchboard.windows.v1`; never open state, maximized state, drafts or keys. Keep anchored menus, model pickers, command palettes and confirmations transient above windows; close menus before their panel on Escape and restore focus. Use `IconButton` with accessible labels. Canvas shortcuts ignore panel controls. Cards drag from their non-interactive surface with a 5px threshold; use `nodrag` on controls, not the entire bottom-action padding. T enables native text selection and touch content scrolling remains available.
- Model testing is explicit, model-ID-only and server-key-only. Reuse production adapters with provider-native output caps, deadlines, character bounds, disconnect cancellation, at most one test and the shared five-request gate. Never send board content, auto-test public catalogs or silently retry uncapped. Empty/interrupted/error output is not a passing test. Tests use local HTTP upstreams, not paid credentials.
- Number canvases by full creation/insertion order before filtering; never infer creation time from updatedAt. Deleting an inactive board must preserve active board/history/viewport/streams and clean only that board's session references. Confirmations pin their exact board/node/edge IDs.
- The message bar reuses `ModelSelector` on desktop and mobile. Model changes target only its current destination, never discard drafts or send requests, and reject stale/ambiguous/streaming targets. Only configured, keyed providers and successfully discovered local Ollama appear as choices. Keep five recent provider/model pairs at `branchboard.model-preferences.v1`, separate from workspace/history/backups; remember the last choice across reloads for new conversations without changing existing chats. Per-canvas session overrides remain supported; creating and sending remains one undo step.
- Coordinate canvas overlays from their measured bounds: a visible minimap has at least 24px clearance from view controls, controls move lower when it is disabled, and composer/keyboard/sidebar changes never automatically reset the graph viewport. Keep 44px collapsed-sidebar targets with smaller visual glyphs. Settings/Help use readable hierarchy, progressive details and keyboard-accessible disclosures/tabs; preserve actual actions and focus restoration.
- Collapsed canvas numbers stay centered in 44px targets without inline Favorite/Delete controls or horizontal scrolling. Canvas actions use a portaled context menu with relevant icons, opened by right-click, Shift+F10/ContextMenu or touch long-press. Keep native touch scrolling/tap selection; opening/using an inactive canvas menu never switches canvases or loses drafts, history or viewport. Favorite/project moves target the exact board ID; deletion retains the ID-pinned confirmation and dirty-panel guard. Menus stay within the viewport, including long project lists, and restore keyboard focus.
- Header search centers on the full browser window using measured header/control bounds, including live sidebar resizing. Shrink it symmetrically or use the compact control when the canvas name/actions/panels leave insufficient room; never overlap controls or reset React Flow. Keep the existing Search accessible name and keyboard behavior. Capture panel opener focus before the host makes the main workspace inert; restore after inert is removed without stealing focus from a new panel or command destination.
- CSS uses Material semantic color roles, neutral surfaces, restrained sage accents, and locally bundled Roboto. New installations follow the system theme; saved light/dark/system preferences remain respected at `branchboard.theme`. Keep canvas tools contextual and maintain readable mobile navigation. Workspace data never includes credentials; assets must not require remote fonts or images.
- Full UI palettes live in `src/palettes.ts`; apply all semantic surface/text/accent roles, not just a seed. `branchboard.appearance.v1` stores the selected palette and named personal copies separately from workspace/history/backups. Built-ins are read-only; editing previews stay in memory until explicit Save, with dirty-navigation/discard restoration. Validate color-only data, preserve unreadable storage, expose quota errors and contrast warnings, and never recolor saved card data. Source/asset attribution is in `docs/palette-sources.md`.
- `ModelDropdown` is shared by cards, composer and provider settings. Use flat options with local `ProviderIcon` assets/fallbacks and accessible provider+ID labels, not provider headings or remote runtime SVGs. Manual IDs persist at `branchboard.added-models.v1`, independently of the five recents. Provider settings may select unconfigured providers for setup; generation selectors must still enforce connected/keyed/installed-provider guards. Adding or selecting an ID never sends/tests automatically. Preserve normal Tab exit, combobox navigation, first-Escape dismissal and mobile viewport bounds.
- Shared motion lives in `src/motion.ts`, `src/motion.css` and `components/Motion.tsx`, using the published Material 3 Expressive web tokens verbatim: spatial curves at 350/500/650 ms for geometry and effects curves at 150/200/300 ms for opacity/color. Never mix the two token families or substitute custom curves. Honor reduced motion in CSS and JavaScript. Presence retains the actual subtree only for visual exit: remove roles/events, make it inert, release panel guards/restore previews and abort explicit model tests at logical close. Reopening must mount a fresh form, cancel stale timers and never revive discarded keys/drafts. Do not clone provider-form DOM or serialize exit state. Keep focus return, dirty navigation and viewport bounds intact; measure popup layout without animated transforms. Node motion is presentation-only: never transition React Flow positioning, direct drag/resize/ports or streaming tokens, and never persist intermediate animation sizes. Toolbar controls become inert immediately when collapsed. Test motion-enabled entry/exit/reversal as well as immediate reduced-motion behavior.
- Grid/snapping and the interactive minimap are optional canvas toggles, available through the board tools or command palette. The command palette (Ctrl/Command K) is the searchable entry point for workspace actions, board switching, and node navigation.
- Connection suggestions use a 20-screen-pixel radius and must still pass DAG validation. Alt-drag repositions each port independently; a short Alt-drag resets that port. Dropping a dragged node within 35 pixels of another node's output creates a fresh chat branch and restores the dragged node; Shift-drag bypasses branching. Edges and ports derive their color from the conversation family they feed, including note inputs; keep the six family colors readable in light/dark palettes and preserve family color on hover/selection with weight and glow as the state cue.

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
