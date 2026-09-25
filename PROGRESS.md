# Progress

## Settings origin fix — 1.7.0 development (2026-10-23)

- Fixed legitimate API-key saves being rejected by the development proxy. It now
  preserves the browser's Host; the server's same-origin protection is unchanged.
- Real Vite-proxy regressions cover `localhost` and `127.0.0.1`: save, private server
  persistence, reload and removal. Foreign hosts and ports still return 403 without
  writing settings. The two legitimate-origin tests failed before the fix and pass now.
- Production build and **154 unit/HTTP tests across 17 files** passed, as did the
  **11 focused provider/appearance Chromium tests**. An additional isolated browser
  check saved, reloaded and removed a test key through the real proxy on both hosts;
  no existing user settings or canvases were modified, and no paid request was made.
- Screenshot script: **93 inspected captures**, PNG/PDF downloads and no browser
  errors at `/tmp/opencode/branchboard-origin-fix-qa/`. Four additional desktop/mobile
  settings-save captures were inspected. Existing release artifacts remain unchanged.

## Keyless model catalogs — 1.7.0 development (2026-10-23)

- Public cloud model selections update automatically without saved API keys, using
  Models.dev and OpenRouter's public catalog. Visible, online sessions check stale
  catalogs every 15 minutes; Settings and the model picker also offer Check for updates.
- Source/update labels, bounded public responses, request deduplication and a separate
  disposable browser cache keep offline choices usable. Selected, default and custom
  model IDs remain available; no workspace, history or backup format changed.
- Cloud-key listing is explicit, not automatic. Local Ollama continues to list installed
  models independently. Public metadata does not guarantee account access or adapter support.
- Both canvas top corners are rounded and clipped on desktop and mobile; port dragging,
  portal menus, mobile bounds and saved viewports retain their regression coverage.
- Full production frontend/server build, **151 unit/HTTP tests across 16 files** and
  **79 Chromium tests** passed. The screenshot script completed **93 captures** plus
  actual PNG/PDF exports with no browser errors. All captures were inspected in six
  contact sheets, with the new desktop/mobile catalog views also reviewed at full size.
  Evidence: `/tmp/opencode/branchboard-public-catalog-final/`.
- A real keyless catalog request returned all six supported cloud provider lists
  without source errors. No paid generation request was made. Earlier interrupted
  checks were rerun completely after the development server restarted.
- This is an unreleased source increment; tagged 1.6.0 and all historical release
  artifacts remain unchanged.

## Material workspace — 1.6.0 (2026-10-22)

- Neutral Material surfaces now consume generated semantic roles; locally bundled
  Roboto, softer sage containers, prominent header search, clear New canvas action,
  quieter cards, tonal navigation, consistent rounded controls and dialogs.
- System theme on fresh installs; saved choices preserved. Readable mobile first
  conversation and a Focus conversation action; saved viewports remain untouched.
- Port resets serialize safely through board/workspace backups and snapshots.
  Branches retain their source provider/model. Unknown API routes return JSON 404.
  Indexed topological auto-layout avoids repeated traversal of shared ancestors.
- Fixed PDF.js type/lifecycle drift without enabling unfinished attachment work.
  Production start uses a bundled Node server, not a development-only tsx dependency.
  Unused SQLite groundwork is optional, so missing native build tools do not block
  installing the current application.
- Full production build passed; **141 unit/HTTP tests** and **78 Chromium tests** passed.
  **90 screenshot views** and actual PNG/PDF exports completed with no browser errors;
  all views inspected in contact sheets, with key desktop/mobile/dark views at full size.
  Evidence: `/tmp/opencode/branchboard-material-qa/`.
- Original releases backed up before edits and preserved. New 1.1.1–1.5.1 refreshes
  are separately labeled, with minimal two-card starters in the earliest prototypes.
  Per-edition checks and artifact hashes are recorded under `releases/`.
- No paid AI request, workspace migration, automatic recovery timeline or attachment
  integration was performed. Those experimental modules are still unfinished.

The assessment below is historical; its earlier verification counts are not the
current release's verification results.

Codebase assessment against `SPEC.md` (2026-10-21). This is a local-first,
single-user implementation; the full product specification is not complete.

## Done

- React Flow canvas: pan/zoom, selection, grid/snapping, minimap, fit view,
  auto-layout, collision avoidance when adding nodes from the toolbar.
- Chat, Markdown note, and group nodes: creation, resizing, collapse,
  duplication, grouping/ungrouping, deletion, and note color overrides.
- DAG connections, multiple-parent context merging, branches with live ancestor
  history, shared-ancestor deduplication, movable ports, and drop-to-branch.
- Real streaming, stop with partial output, retry/regenerate, parallel requests,
  persistent conversations, and originating-board stream updates.
- Per-node provider/model routing, native Anthropic/Gemini/Ollama adapters,
  OpenAI-compatible providers, model discovery, and server-only credentials.
- Provider-specific automatic model discovery: startup, settings saves, and stale
  checks every 15 minutes while visible/online, with focus, visibility and reconnect
  recovery. Concurrent checks are deduplicated, timed out and cancelled on cleanup;
  changed credentials/endpoints discard old in-flight results. Provider errors stay
  independent and retain successful lists, saved extras and selected/default IDs.
  Model dropdowns show refresh state/time/errors and an immediate retry. Search
  also accepts exact model IDs with an explicit provider choice; saved conversation
  IDs remain reusable in other nodes. Settings offers discovered default-model
  suggestions while still allowing text. Discovery never changes routing or creates
  generation/history entries; cache/status metadata stays out of workspace backups.
- Context inspection, manual source inclusion/exclusion, heuristic node/branch/
  selection/board token estimates, and blocking input-token budgets.
- Multiple canvases, rename/delete, title-based command-palette navigation,
  JSON board backups/import validation/ID remapping, and Markdown export.
- Debounced browser autosave, pagehide flush, quota/unreadable-storage warnings,
  and 50-step current-board undo/redo (disabled during generation).
- Local fonts, light/dark/system themes, responsive dialogs, sidebar toggle,
  keyboard shortcuts, focus-trapped dialogs, and accessible icon controls.
- Local-only API defaults, origin checks, input/stream limits, disconnect/timeout
  cancellation, and provider-error redaction. Provider config is persisted with
  owner-only permissions, but is not encrypted.
- Saved-message editing (original Missing 1): user, assistant, and system turns;
  Markdown rendering, blank/oversized-input protection, cancellation, autosave,
  single-step undo/redo, and updated context for connected branches. Later turns
  are retained; the dialog warns they may be stale. No automatic AI requests.
- Individual-message deletion (original Missing 2): preview and confirmation,
  safe default focus on Cancel, preserved remaining history, persistence and
  undo/redo. Editing/deletion are blocked while any generation is active so
  streaming history and undo snapshots cannot be corrupted. Duplicate message
  IDs within an imported node are rejected to keep targeting unambiguous.
- Local cross-board content search (original Missing 3): literal case-insensitive
  matching in saved messages (including system turns), notes, and node titles;
  bounded contextual snippets, board/source labels, keyboard navigation, honest
  100-result limit, and empty states. Available in the sidebar and command palette.
  Selecting a result switches boards, expands/selects the node, fits the canvas,
  and scrolls/focuses/highlights the matching message at the current zoom. Search
  within the current board preserves undo history; no provider key is needed.
- Historical-turn branching: every saved user, assistant, or system turn can start
  an empty connected chat inheriting only the source turn IDs through that point.
  Edits remain live, deleted turns disappear, and later/replacement turns stay out.
  Merged paths union included turns once in source order; full connections or manual
  inclusion intentionally include full history. Cutoffs survive undo/redo, reload,
  duplication and imports. Branching is blocked during generation; no AI request
  is made automatically. Context inspection uses the same effective history.
- Full-workspace JSON backup/import: includes every canvas, the active canvas,
  named snapshots, projects/folders, favorites and templates, but not credentials
  or appearance preferences. Import validates
  the complete file, adds independent ID-remapped copies without overwriting work,
  and activates the imported active canvas. Existing board-only backups still work.
  Files are limited to 20 MB and workspace imports to 100 canvases/30 snapshots;
  malformed data or failed snapshot persistence leaves the workspace unchanged.
- Named manual canvas snapshots: up to 30 immutable copies persist in separate
  browser storage beyond reload, undo and source-canvas deletion. Restore creates
  a new canvas; deletion requires confirmation with Cancel as the safe default.
  Quota failures are visible, unreadable snapshot data is protected, and the cap
  never silently prunes older copies. Workspace downloads include snapshots for
  independent recovery. Clearing browser data can still erase local snapshots;
  this is not server-backed storage or an automatic version-history timeline.
- Honest autosave wording: “Autosave enabled” describes the debounced policy,
  rather than falsely acknowledging a completed write. Existing failure warnings
  remain visible.
- Automatic content sizing for chat and note nodes: opt in through Node actions;
  content and width changes resize the height between the existing minimum and
  900 px, with scrolling beyond the cap. Saved-message edits, streamed content,
  Markdown previews and note edits are measured in local canvas pixels. Collapse
  suspends sizing; manual resize switches back to fixed sizing. The preference
  survives reload, imports/backups and undo/redo. Existing nodes stay fixed-size
  until opted in; sizing does not add per-token/keystroke history entries.
- Collision-aware drag/resize completion and automatic growth: edited sibling
  rectangles settle with a 24 px gap without moving their neighbors. Multi-node
  drags keep relative positions, parent moves preserve child coordinates, and
  children collide with siblings rather than their containing group. Gesture
  correction is included in the same undo step. Drop-to-branch and Shift bypass
  still work; no new connection or AI request is created by collision handling.
- Rich Markdown notes: Edit/Preview modes, selected-text bold/italic/code and
  heading/list/task toolbar actions; rendered headings, links, tables and lists.
  Content remains portable Markdown and continues to participate in search,
  context, export, persistence and history. Raw HTML and unsafe URL schemes are
  not executed. The source editor remains available alongside rich editing.
- Interactive Markdown checklists: nested and pre-checked tasks toggle their
  exact source marker, persist through reload and support single-step undo/redo.
  Code examples are not treated as tasks; checking a task does not unexpectedly
  select the node and replace the preview with its editor.
- Freehand drawing and highlighting: real pointer-drawn canvas-coordinate strokes,
  adjustable color/width, Escape/pointer-cancel protection, selection, pointer and
  keyboard movement, deletion, and single-step undo/redo per completed gesture.
  Open through Drawing & annotations in the toolbar or command palette. Editing
  pauses during generation, and unfinished gestures cancel on history changes.
- Canvas shapes: rectangles, ellipses and directional arrows, drawn at the current
  pan/zoom with the same color/width, selection, movement and deletion controls.
  Marks remain visible with tools closed and never become AI context or DAG nodes.
  Fit includes visible annotations and nodes; annotation-only imports without a
  saved viewport fit automatically once their canvas is initialized.
- Annotation layers: add, rename, hide/show, lock/unlock, reorder and confirmed
  deletion with Cancel as the safe default. Layer deletion and its marks undo
  together; hidden layers remain in storage. Marks/layers survive autosave, board
  and workspace backups/imports, and named snapshots, with independent IDs on
  import/restore. Imports validate geometry, colors and layer references with
  explicit limits (30 layers, 2,000 marks, 5,000 points per mark/100,000 total).
- WYSIWYG note editing: optional Rich text mode with direct rendered-text editing,
  headings, bold/italic, lists, interactive nested tasks, links, tables, quotes and
  code. Markdown remains the portable storage format. Opening rich mode does not
  rewrite source; actual edits can normalize Markdown formatting. Raw HTML/image
  notes are read-only in rich mode to avoid losing unsupported content. Edits
  autosave, participate in search/context/export, and use workspace undo/redo;
  editing pauses during generation. The Markdown editor/preview remain available.
- PNG canvas export: real local rendering with preview, embedded local fonts,
  node/edge/group and visible annotation bounds independent of viewport position.
  Controls, handles and hidden layers are excluded; export leaves canvas/history
  unchanged. Images are capped at 4,096 pixels per side/16 megapixels. Export
  reflects the current node presentation, including collapsed and clipped content,
  rather than a full transcript. Empty canvases report a useful error.
- PDF canvas export: the same preview rendered to a downloadable, centered A4
  page with automatic orientation and margins. This is a raster-image PDF, not
  selectable text or a paginated transcript. Generation blocks both export modes.
- External conversation imports: text-only ChatGPT, Claude, and generic role/content
  message JSON, individually or in arrays. Local preview and per-conversation
  selection precede importing independent canvases; existing work is preserved.
  Complete-file validation rejects malformed or unsupported messages atomically,
  with no provider requests or credential import. ChatGPT follows current_node
  and explicitly excludes alternate branches. Attachments/tool messages are not
  supported. Limits: 20 MB, 100 conversations, 5,000 total messages and 100,000
  characters per message. Imported history supports branching, persistence and
  existing backup/export flows. Import pauses during generation.
- Local projects and nested folders: create/rename, assign the current canvas,
  filter the sidebar by a project including descendants or by unfiled canvases,
  and create canvases in the selected folder. Confirmed subtree removal keeps all
  canvases, moving them to the surviving parent or unfiled. Organization is separate
  from canvas undo. Up to 100 projects/folders persist through autosave and reload.
- Reusable canvas templates: save/rename/delete up to 50 local immutable templates,
  then create independent ID-remapped canvases in an optional destination folder.
  Layout, notes, connections, model choices and annotations are retained; saved
  conversations are excluded unless explicitly opted in. Saving/using templates
  pauses during generation and never sends an AI request. Deleting a template
  requires confirmation and does not delete canvases made from it.
- Favorite canvases: accessible per-canvas star toggles, a sidebar favorites filter,
  and favorite/unfavorite command-palette actions, including on mobile. Favorites
  survive reload and are cleaned up on canvas deletion.
- Organization, favorites and templates are included in workspace JSON backups.
  Import validates the complete metadata and merged limits before changing state,
  remaps folder/canvas/template references and graph IDs, and retains existing work.
  Legacy workspaces/backups without metadata remain supported. Corrupt saved metadata
  is protected and storage quota failures are visible. Board-only JSON remains a
  canvas backup, not an organization/template backup.
- Unified message bar replaces per-node message inputs and stays outside canvas
  zoom. Select a chat to continue it, or choose New conversation to create an
  independent chat on send. Multiple selected nodes require an explicit destination;
  messages are never broadcast. Per-conversation models, context, branching and
  regeneration remain available in the nodes.
- The bar shows destination, model, inherited context/token estimate and generation
  state, opens the existing context inspector, and supports Enter/Shift+Enter,
  IME composition and Stop. Drafts are retained separately per canvas/conversation
  during the session, including while another conversation streams; drafts are not
  persisted across reloads or included in backups. Missing provider setup and
  blocked context budgets preserve drafts without creating empty conversations.
  Stale destinations and double submissions are rejected; creating a chat and
  sending its first message is one undo step.
- Vitest and Chromium interaction suites; extended screenshot QA script covering
  history, recovery, annotations, rich notes, PNG/PDF downloads, external imports,
  projects/folders, templates, favorites, the unified message bar, and
  desktop/mobile/light/dark UI.
- Forest workspace redesign: dark charcoal and sage by default, complementary light
  and system themes, neutral compact cards, full-bleed canvas, slim header and a
  collapsible icon-rail sidebar. One search entry opens workspace commands and
  carries a query into saved-content search; import/export/backups live in Utilities.
- The message bar now floats above the canvas, independently of pan/zoom, with a
  compact destination/context row and an automatically growing multiline input.
  Fit includes safe space for the toolbar and composer; controls move above expanded
  drafts rather than covering them. Existing routing, drafts, provider safeguards,
  streaming and context inspection remain functional.
- Cards drag from their non-interactive surface after a 5px threshold. Controls,
  links, editors and ports are excluded; T enables text selection. Empty-space
  dragging pans, Shift-drag selects a rectangle, Shift-click selects multiple nodes,
  and Space pans over cards. Fit, zoom reset and saved viewports remain available.
- Double-clicking empty canvas opens quick creation at that location; dropping an
  output connection on open canvas creates a connected branch and focuses the
  composer. Connections show direction, related-node emphasis and an inspectable
  context preview with undoable disconnection.
- Internal node copy/paste works across canvases with remapped IDs, internal
  connections, group descendants and context references. It uses session memory,
  not the operating-system clipboard. Existing duplication, auto-arrange and undo/
  redo remain available; deleting groups or five selected nodes asks for confirmation.
  Drag autosave waits for the gesture to finish. Markdown rendering and context
  calculations avoid repeated parsing during position-only updates; large-board
  scaling is still unverified.

## Broken

- Browser QA caught a mobile settings Save button below the visible dialog; the
  settings actions now remain reachable while scrolling. Rich-note persistence
  assertions now wait for debounced autosave rather than reading absent storage.
- Regression QA caught rich-editor editability changes emitting content updates:
  opening rich mode could normalize unchanged source Markdown. Editability updates
  now suppress content events; actual edits still normalize Markdown as documented.
- Unified-composer QA caught cancellation replacing Stop with Send during the same
  click, which could submit the next draft. Separate control identities and explicit
  cancellation now prevent that accidental submission and preserve the draft.
- Interaction QA caught Chromium collapsing text selections at certain fractional
  canvas zoom levels. Text-selection mode now keeps a stable native selection anchor
  using screen-space caret hit testing, without changing font size or canvas zoom.
  Pointer listeners are removed on completion, cancellation, blur and unmount.
- Rich editing intentionally preserves Markdown storage, not an arbitrary rich
  document format. Image/raw-HTML notes require the source editor. Raster exports
  have bounded resolution and capture current presentation, not hidden overflow;
  PDFs do not contain selectable text. Unsupported external export formats and
  multimodal/tool payloads require a text-only conversion before import.
- Snapshots share the browser's storage quota with autosave and cannot survive
  browser-data clearing without an external JSON download. Corrupt snapshot bytes
  are preserved rather than automatically repaired or overwritten.
- Large-graph performance is unverified; several graph paths scan arrays
  repeatedly. Do not claim optimized support for thousands of nodes.

## Missing

Projects/folders, reusable user-created templates and favorites are now in Done
above. Remaining specification gaps include:

1. Automatic version history and recovery beyond manual browser snapshots and
   downloaded JSON backups.
2. Multimodal uploads, extraction, previews, and provider-aware AI processing.
3. Model-specific tokenization, billed usage/cost tracking, analytics and budgets.
4. Automatic family color propagation and chat color overrides.
5. Prompt libraries, comparisons, summaries, semantic search/RAG, and automation.
6. Guided setup and reusable example templates (no fake AI demo responses).
7. Collaboration, authentication/permissions, encryption, database/migrations,
   hosted deployment/CI, and extensive accessibility/performance coverage.

## Next

- Next suggested work: automatic version history with explicit retention/recovery
  limits. Local projects/folders, reusable templates and favorites are implemented.
- Benchmark large boards before making scaling claims. Keep an external workspace
  download when recovery independent of browser storage is needed.

### Verification of projects/folders, templates and favorites

- `npm run build`: passed (strict TypeScript and Vite production build); Vite
  reports a non-blocking size warning for the lazy-loaded rich editor chunk.
- `npm test`: **119 passed** across 12 files (previous batch: 109).
- `npm run test:e2e`: **65 passed** in Chromium, including four new
  projects/folders, favorites, templates and workspace round-trip tests.
  This NixOS environment requires the existing documented library path:
  `LD_LIBRARY_PATH="$(cat /tmp/opencode/branchboard-browser-library-path)"`.
- `npm run screenshot`: **73 captures** plus real PNG/PDF downloads, no browser
  errors. Inspected project hierarchy/location, filtered favorites, template history
  opt-in, desktop/mobile/light/dark dialogs, independent template canvases and safe
  deletion confirmations. Screenshot QA caught a scrolling library dialog clipping
  its heading; the library header now stays visible while scrolling.
  Final artifacts: `/tmp/opencode/branchboard-organization-final/`;
  `browser-errors.json` is `[]`.
- New regression coverage includes nested folder validation, descendant filtering,
  safe subtree deletion, canvas assignment/favorite cleanup, debounced autosave and
  legacy workspaces; template immutability, opt-in history and historical cutoffs,
  graph/context/annotation ID remapping, limits and generation guards; complete
  workspace metadata backup/import, atomic invalid imports, unreadable-byte
  protection, quota failures, confirmed deletions and mobile keyboard/focus flows.
  Existing branching, providers/streaming, history/search, backups, snapshots,
  keyboard navigation, port movement and responsive-layout suites also pass.
- No live paid-provider request was made. AI fixtures are confined to tests;
  screenshot history uses user-authored text imported through the real backup UI.

### Verification of the unified message bar

- `npm run build`: passed (strict TypeScript and Vite); the existing lazy rich
  editor chunk-size warning remains non-blocking.
- `npm test`: **125 passed** across 12 files, including six new routing/draft
  regression tests. Coverage includes selection ambiguity, stale submissions,
  independent draft slots, provider/budget guards, inherited context, single-step
  new-chat undo and concurrent originating-board requests.
- Four new Chromium composer tests cover destination changes, drafts across
  canvases, multiline/IME input, zoom independence, new-chat undo/redo, provider
  setup and mobile streaming cancellation without submitting the next draft.
- The complete Chromium suite passed **69 tests** for that batch.
- `npm run screenshot`: **78 captures**, real PNG/PDF downloads and no browser
  errors. Inspected the unified composer, context inspector, independent new-chat
  mode, and light/dark mobile layouts. Artifacts:
  `/tmp/opencode/branchboard-unified-composer/`; `browser-errors.json` is `[]`.
- No live paid-provider request was made; deterministic AI responses remain test
  fixtures only.

### Verification of the forest workspace and canvas interactions

- `npm run build`: passed (strict TypeScript and Vite); the existing lazy rich
  editor chunk-size warning remains non-blocking.
- `npm test`: **128 passed** across 12 files. Added coverage checks internal
  copy/paste ID/context remapping, groups, detached children, single-step undo,
  clipboard exclusion from backups, legacy drag-handle migration and drag-end autosave.
- Six focused Chromium interaction tests pass, covering whole-card dragging and
  its threshold, native text selection at fractional zoom, control exclusions,
  multi-node movement, position persistence, empty-space and Space panning,
  Shift selection, fixed composer bounds, quick creation and connection branching,
  edge preview/disconnection, multiline input, internal cross-canvas copy/paste,
  universal search handoff and actual touch scrolling inside saved messages. Saved
  viewports survive reload and canvas switches even when all cards were panned
  off-screen; only new canvases without a saved viewport are initially fitted.
- `npm run test:e2e`: **75 passed** in Chromium, including the six new interaction
  tests and all existing provider/streaming, history, recovery, import/export,
  organization, rich-note, annotation, accessibility and responsive-layout tests.
- `npm run screenshot`: **86 captures** plus real PNG/PDF downloads, with no
  browser errors. Visually reviewed the dark/light workspace, floating and expanded
  composer, icon rail, quick-create menu, text-selection mode, connection context,
  tablet layout and a fresh mobile starter graph. All starter cards fit on first
  open; floating controls remain clear of the composer. Final artifacts:
  `/tmp/opencode/branchboard-green-final/`; `browser-errors.json` is `[]`.
- Additional isolated desktop/mobile checks confirm the Utilities menu stays
  bounded and opens the real Backups & snapshots dialog.
- No live paid-provider request was made; deterministic AI fixtures remain confined
  to tests. No dependencies were added. Large-board performance remains unverified.

### Rounded outer workspace

- The outer workspace now has a subtle border and 24px rounded corners with an
  8px inset. Mobile uses 16px corners and a 4px inset to preserve canvas space.
  The frame clips its contents cleanly while node connection ports remain usable.
- Updated responsive appearance coverage for the rounded, inset frame.
- Validation: production build, 128 unit tests and all 75 Chromium browser tests
  pass. Desktop and mobile screenshots confirm the rounded frame stays bounded.
- Screenshot QA completed 86 captures and PNG/PDF downloads without browser errors;
  reviewed desktop and fresh-mobile corners. Artifacts:
  `/tmp/opencode/branchboard-rounded-workspace-verified/`.

### Automatic provider model discovery and exact IDs

- Configured providers refresh independently at startup, after saved credential or
  endpoint changes, and when their last check is 15 minutes old while the app is
  visible and online. Returning to a stale list also triggers a refresh. Failed
  checks keep previous models, with status, last successful update time and a
  manual retry in the dropdown and settings. Refreshing never changes routing.
- The searchable dropdown accepts exact model IDs with an explicit provider and
  **Use custom model** action. Saved conversation IDs remain reusable; settings
  also offers discovered default-model suggestions and durable additional IDs.
  A note explains that retained IDs do not guarantee provider access.
- Requests are deduplicated per provider, time out, support cancellation, and
  discard late results after configuration changes. Discovery metadata stays out
  of workspace history, storage and backups. Native Google/Anthropic pagination
  and real HTTP authentication/error handling are covered by local test servers.
- Mobile keyboard resizing repositions the model picker without dismissing it.
  The scrollable settings dialog keeps its heading and close control visible.
- Verification: production build passes; **137 tests across 14 files** and
  **78 Chromium browser tests** pass. New coverage includes automatic refresh,
  provider-isolated failures, cached lists, exact-ID routing/reuse, unsupported
  discovery, keyboard interaction and configuration/cancellation races.
- Screenshot QA completed **90 captures** and real PNG/PDF downloads without
  browser errors. Reviewed refresh/error states, exact-ID entry and mobile
  provider settings. Artifacts: `/tmp/opencode/branchboard-model-discovery-final/`;
  `browser-errors.json` is `[]`.
- No dependencies were added. Protocol checks use local providers and browser
  fixtures; no live paid-generation check was performed. A listed or typed ID
  still requires actual provider access and chat support, with no silent fallback.

`releases/` and the pre-existing `data/` directory are out of scope and untouched.
