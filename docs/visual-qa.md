# Visual and interaction QA

## Windowed workspace — 1.10.0 (2026-10-26)

- Verified independent Models and Settings windows at 1440px: first open docks, opening
  the other floats it, reopening raises it, docking swaps the previous panel and
  maximize/restore returns to the prior layout. Multiple floating windows retain
  z-order and pinned drafts.
- Verified all four snaps and the opposite-half canvas mapping, including the reported
  docked-canvas case and vertical top/bottom snapping. Drag-to-edge previews stay above
  the moving window; the canvas moves only after release.
- Verified move, corner/edge resize, keyboard Arrow/Shift+Arrow/Alt+Arrow/Enter,
  restore-under-pointer, embedded pop-out/dock controls and focus restoration. Window
  bounds remain inside the desk with 320x280 minima and a usable canvas.
- Verified `branchboard.windows.v1` round trips mode and floating bounds only; open
  panels, maximized state, drafts and credentials do not survive reload. Reset layout
  clears persisted geometry without touching workspace data.
- At 760px and 390px, open panels become full-stage sheets, the canvas is inert but
  remains mounted, focus stays contained, Escape/Back restores the origin, and dirty
  guards/drafts behave as on desktop.
- Connection review covered multiple conversation roots and branches: edges and ports
  inherit target-family colors in six light/dark hues, note inputs match the
  conversation they feed, paths render at 3px with 12px ports, and selected/related
  edges keep their family color at 3.75px with a glow. Arrowheads remain small and
  family-colored. The prior Alt-drag endpoint mismatch was traced to hover-scaling
  handles and fixed without changing port geometry.
- Strict build and **241 unit/HTTP tests in 27 files** passed, followed by the full
  **123-test Chromium suite**. Reopening two panels whose stored layouts were both
  snapped keeps only the first snapped, opens the second floating and persists that
  resolved mode. Evidence: `/tmp/opencode/build-110-final2.log`,
  `/tmp/opencode/unit-110-final.log`, `/tmp/opencode/full-e2e-final2.log`.
- All **159 numbered screenshots**, `motion-samples.json` and PNG/PDF exports were
  inspected through eight contact sheets, including a full-resolution look at the PNG
  and the PDF's one-page A4/1000x1052 embedded render. The final nine captures cover
  family-colored connections, docked Models, left/top/bottom snaps, maximize, floating
  Settings, drag preview and the narrow sheet. Motion sampling recorded two running
  animations for desktop panel entry/close, one for mobile entry, and zero for reduced
  motion; closing opacity was **0.086** and toolbar/canvas-menu opacity was **0.943**.
  Evidence: `/tmp/opencode/screenshots-110-final/` and
  `/tmp/opencode/contact-110-final/`.
- The built production assets on 3001 passed the isolated browser pass at 1440x960 and
  390x844: docked canvas relocation, Settings floating without replacing the dock, top
  snap below the canvas, mode-only persistence across reload, and a full-stage narrow
  sheet over an inert mounted canvas. Evidence: `/tmp/opencode/production-110/` with
  `pageErrors: []`; the only failed request was the expected local Ollama catalog probe
  (502 while Ollama is not running), which the Models UI reports as unavailable.
- No uncaught browser errors occurred. No paid provider requests, credential writes,
  `data/` changes, release-payload rewrites or Tailscale configuration changes were made;
  all 152 existing release checksum entries still match.

## Fluid workspace — 1.9.0 (2026-10-26)

- Replaced the workspace transitions with the published Material 3 Expressive web
  tokens: spatial fast/default/slow curves at 350/500/650 ms for geometry and effects
  fast/default/slow curves at 150/200/300 ms for opacity and color. Panels, menus,
  model dropdowns, the sidebar, toolbar reveals, node entry and annotations use the
  matching token family; spatial overshoot is preserved and effects never overshoot.
- Panels clip and slide without changing settled canvas geometry. Closing controls
  become inert, lose their accessible roles and stop pointer hits at logical close
  while the visual exit finishes. Focus return, filtered-row fallback, dirty-navigation
  guards, drafts, viewport and history remain protected, and explicit model tests abort
  at logical close.
- Strict build and **225 unit/HTTP tests in 25 files** passed, followed by the full
  **119-test Chromium suite**, including exact token curves, spatial overshoot, inert
  exit, rapid-reopen draft safety and immediate reduced motion. Evidence:
  `/tmp/opencode/branchboard-md3e-build.log`,
  `/tmp/opencode/branchboard-md3e-tests.log` and
  `/tmp/opencode/branchboard-md3e-e2e2.log` (output
  `/tmp/opencode/branchboard-md3e-full2-results`).
- All **150 numbered screenshots**, `motion-samples.json`, PNG/PDF exports and six
  contact sheets were inspected. The panel captures reported three running animations,
  the toolbar and canvas menu two, and reduced motion **zero**; the closing panel was
  captured at its midpoint with opacity 0.086 and the opening canvas menu at 0.943.
  The toolbar exceeded its settled width at midpoint, confirming spatial overshoot.
  Evidence: `/tmp/opencode/branchboard-md3e-verified/` and six sheets in
  `/tmp/opencode/branchboard-contact-md3e-verified/`.
- No browser errors occurred. No paid provider requests, credential writes, data
  changes, release-payload rewrites or Tailscale configuration changes were made; all
  138 existing release checksum entries still match.

## Canvas context menus — Unreleased (2026-10-25)

- Replaced inline canvas Favorite/Delete controls with a clean expanded/collapsed
  button and a portal menu containing icon-labeled Favorite/Unfavorite, Move to project
  and Delete actions. This supersedes the intermediate fixed delete control below.
- Verified right-click, Shift+F10/ContextMenu, normal Enter/Space activation, arrow/
  Home/End/Escape navigation, focus restoration, touch hold/release and movement
  cancellation. Long lists and nested project destinations stay within the viewport.
- Inactive actions retain their exact canvas ID without switching the active canvas
  or changing its draft, viewport or history. Delete retains the integrated confirmation
  and desktop/mobile unsaved-key navigation guard; discarded keys do not enter storage.
- Strict build and **222 unit/HTTP tests in 24 files** passed. All **15 focused browser
  scenarios** passed, then the full **111-test Chromium suite passed in 3.7 minutes**.
  Evidence: `/tmp/opencode/branchboard-canvas-menu-e2e.log`.
- All **144 numbered screenshots** plus PNG/PDF exports were inspected, including
  full-size expanded/collapsed/mobile menus, nested destinations and the complete
  one-page raster PDF. No browser errors occurred. Evidence:
  `/tmp/opencode/branchboard-canvas-menu-final/` and 13 contact sheets in
  `/tmp/opencode/branchboard-canvas-menu-contact/`.
- Production checks at `http://127.0.0.1:3001` covered 1440px/390px in Gruvbox light/dark,
  with all six captures inspected. Favorite/nested moves persisted; cancellation was
  safe; inactive deletion preserved the active draft/viewport. All four scoped menu
  WCAG A/AA scans reported zero violations, not whole-application certification.
- Production HTTP config/forged-origin/unknown-route responses were 200/403/404, with
  no page errors or API writes. Evidence: `/tmp/opencode/branchboard-canvas-menu-production.json`.
  No data, credentials, release payloads or Tailscale settings changed; all 138 release
  checksum entries still match.

## Collapsed sidebar overflow — Unreleased (2026-10-25)

- Reproduced the owner's clipped circular wedge and horizontal rail scrollbar. The
  absolute delete button overflowed a scrolling/clipped ancestor; legacy link padding
  and flexible width also offset the canvas number.
- Navigation targets now remain centered and 44px wide. Hover/focus delete controls
  retain their DOM/tab order but use measured fixed positioning beside the rail.
  Scrolling and resize update their anchor; offscreen rows cannot leave stray actions.
- All nine focused Chromium sidebar scenarios passed, including desktop/mobile target
  geometry, cardinal-edge hit testing, keyboard deletion of an inactive canvas, draft/
  viewport preservation and a long vertically scrolling list without horizontal scroll.
- The complete **107-test Chromium suite passed in 3.6 minutes**. All **142 numbered
  screenshots** and PNG/PDF exports were inspected, with no browser errors. Full-size
  hover, keyboard-focus and mobile rail captures show centered numbers, complete delete
  targets and no clipped wedge or scrollbar. Evidence: `/tmp/opencode/branchboard-rail-e2e.log`,
  `/tmp/opencode/branchboard-rail-final/` and 13 contact sheets in
  `/tmp/opencode/branchboard-rail-contact/`.
- Production checks covered 1440px/390px in Gruvbox light/dark, with all four captures
  inspected. API responses were 200 for config, 403 for a forged origin and 404 for an
  unknown route; page errors and API writes were empty. Evidence:
  `/tmp/opencode/branchboard-rail-production.json`.
- Strict build and **222 unit/HTTP tests in 24 files** passed. No data, credentials,
  release payloads or Tailscale configuration were changed; all 138 release checksum
  entries still match.

## Window-centered search and Settings surfaces — Unreleased (2026-10-25)

- Search is centered on the complete window rather than the remaining canvas. It
  follows measured sidebar movement, shrinks symmetrically around the same center,
  and becomes a compact button when panels or narrow widths leave insufficient room.
- Five new header scenarios passed **15 repeated Chromium runs**: 1440/1920px sidebar
  states and reload, paused/reversed animation, docked-panel resizing, long names and
  320–1440px windows. Geometric assertions retain under-1px centering, control clearance
  and no horizontal overflow; resize checks wait for the ResizeObserver layout frame.
- Fixed a narrow-panel focus race by capturing the opener before the workspace becomes
  inert and restoring it after the host removes inert, without overriding a new target.
- The owner's two gray Settings rectangles came from legacy modal background rules.
  Docked headers and sticky action rows now use the panel surface. Actual rendered
  colors are checked for Original Sage and all 12 presets in both light/dark modes.
- Final strict frontend/server build and **222 unit/HTTP tests in 24 files** passed.
  Full actual Chromium suite: **104/104 passed** (3.4 minutes), recorded in
  `/tmp/opencode/branchboard-search-complete-e2e.log`.
  All **139 numbered screenshots**, the full exported PNG and one-page raster PDF
  were visually inspected at `/tmp/opencode/branchboard-search-settings-final/`.
  Contact sheets: `/tmp/opencode/branchboard-search-settings-contact/`.
  No screenshot browser errors or remaining collisions were found.
- Local production smoke at `http://127.0.0.1:3001` checked expanded/collapsed/docked
  centering, compact mobile controls, panel surface consistency, Search keyboard/focus
  behavior and unchanged drafts/viewport. Same-origin config returned 200, forged
  origins 403 and unknown API routes 404; no page errors or API writes were recorded.
  Results: `/tmp/opencode/branchboard-search-production.json`.
- The previous Tailscale root externally changed to Joplin; it was left untouched and
  is not counted as BranchBoard verification. All 138 existing release checksum entries
  still match. Protected data, credentials, tags and released payloads were not changed.

## Palettes and model selection — Unreleased (2026-10-25)

- Final production build and **218 unit/HTTP tests in 23 files** passed. Full actual
  Chromium suite: **99/99 passed**, including palette application without workspace/
  viewport mutation, custom CRUD/reload, preview cancellation, mobile bounds, exact
  model IDs, legacy selections, provider icons and no automatic generation/testing.
- Inspected all **135 numbered desktop/mobile captures**, the full exported PNG and
  the one-page raster PDF at `/tmp/opencode/branchboard-palettes-final/`. Reviewed
  contact sheets: `/tmp/opencode/branchboard-palettes-contact-final-fields/`.
  All 12 presets were captured in both modes; custom tuning/warnings/saved copies,
  dropdowns and manual-ID forms were checked alongside existing workspace flows.
- Fixed issues found during review: native controls ignoring palette colors, short
  mobile text fields, swatches retaining the previous mode and invalid hex drafts
  surviving reset. Re-ran build, both test suites and screenshots after the fixes.
  Safe preview/revert and contrast-warning controls remain readable even when users
  deliberately set foreground equal to background.
- Checked actual select backgrounds, foregrounds and opaque borders against the
  palette; normal text meets 4.5:1 and control borders 3:1 in built-in schemes.
  Palette editor inputs have at least 44px height. Theme label/control spacing is
  tested, dropdowns retain first-Escape dismissal and normal Tab navigation, and
  saved content swatches are not recolored by changing UI palettes.
- Production smoke at `http://127.0.0.1:3001`: custom palette survives reload; desktop/
  mobile Settings and manual-ID entry work. After transition settling, axe reported
  zero WCAG 2 A/AA and 2.1 AA violations in `.palette-settings` across all **24 schemes**.
  This scoped scan is not a claim of whole-app accessibility compliance. Results:
  `/tmp/opencode/branchboard-palette-accessibility-final.json`.
- Production checks recorded no page errors, paid/config writes or external browser
  requests. Same-origin config access succeeds; forged origins receive 403 and unknown
  API routes 404. The previous Tailscale root now serves Joplin, so it was not counted
  as BranchBoard verification or reconfigured. No real credentials, protected data,
  tagged artifacts or release archives were changed.

## Docked workspace — 1.8.0 (2026-10-24)

- Reviewed docked Models/Settings/Help/editors, titleless cards, rectangle selection,
  integrated confirmations, original-order canvas navigation and the right creation
  toolbar at desktop/mobile widths and in both themes.
- Kept 24px minimap clearance, 44px sidebar targets, visible rounded canvas corners,
  readable panel hierarchy, focus return, native text selection and touch scrolling.
- Fixed annotation/tool overlap, Favorite/delete overlap, Shift-click interception,
  a stale pointer-draft completion race and narrow mobile layer-name fields.
- Full-size PNG inspection found narrow cloned table cells wrapping the header and
  clipping the last row. Export now lets cell widths recompute without table clipping;
  a real-image pixel regression covers the final row. PNG/PDF use the same raster.
- Seven cleanup editions passed their own builds, unit suites and three production
  Chromium tests each. All four previews per edition were reviewed; no full historical
  browser-suite pass is implied. Existing parent groups remain readable/ungroupable.
- The final current build, 181 unit/HTTP tests and 95 Chromium tests passed; all 104
  desktop/mobile captures and the downloaded PNG were inspected after the fixes.
  Current final evidence lives in `releases/v1.8.0/verification.json`. No paid provider
  requests were used; browser generation fixtures and local HTTP upstreams are explicit.

## Design improvements — 1.7.0 (2026-10-23)

- The picker is search-first, with five persistent recent choices and only configured
  keyed providers or successfully discovered local Ollama. Existing selections and
  drafts survive provider removal; no selection automatically sends a request.
- Settings presents essential fields and Save before collapsed setup/advanced details.
  Help separates a three-step guide from searchable, grouped shortcuts. Titles are
  24px, section headings 18px and body text 14–15px, with keyboard focus support.
- View controls descend without the minimap and maintain 24px above it when shown.
  Measured composer/keyboard bounds avoid overlap without resetting the graph viewport.
  Compact sidebar glyphs retain 44px targets; both canvas top curves remain visible.
- Full-size mobile review exposed clipped wrapped draft text after narrowing the
  window. Width-aware textarea sizing fixes it; a regression verifies both shrinking
  and widening while preserving text and graph position.
- Full production frontend/server build, **163 unit/HTTP tests in 18 files** and all
  **88 Chromium tests** passed. Screenshot script: **104 inspected captures**, actual
  PNG/PDF downloads and `browser-errors.json: []`, at
  `/tmp/opencode/branchboard-design-improvements-final/`.
- Reviewed all 104 in six contact sheets, with the mobile overlays, minimal Settings,
  grouped shortcuts and desktop composer picker also inspected at full size. The
  clipped draft was fixed and the entire script rerun before accepting this evidence.
  Provider-generation tests use deterministic fixtures/local HTTP; no paid AI request
  was made. Public-catalog updates were exercised without exposing or changing keys.

## Settings origin fix — 1.7.0 development (2026-10-23)

- Production build, **154 unit/HTTP tests** and all **79 Chromium tests** passed.
  Real proxy regressions accept both local browser hosts and reject foreign origins.
- A separate real-browser check saved, reloaded and removed an isolated test key on
  both hosts without changing user settings. Reviewed all four desktop/mobile captures
  at `/tmp/opencode/branchboard-origin-browser-oJBWvZ/`; keys are not displayed or
  stored in browser storage. No paid provider request was used.
- Full screenshot script: **93 captures** plus PNG/PDF downloads, with
  `browser-errors.json: []`, at `/tmp/opencode/branchboard-origin-fix-qa/`.
  Inspected all captures in six contact sheets; no visual changes were needed.

## Keyless model catalogs — 1.7.0 development (2026-10-23)

- Full production build, **151 unit/HTTP tests** and **79 Chromium tests** passed.
  Browser coverage includes updates before entering a key, periodic refresh, manual
  checks, offline cache, preserved exact selections and no automatic cloud-key listing.
- Screenshot script: **93 captures**, actual PNG/PDF exports and
  `browser-errors.json: []`. Artifacts: `/tmp/opencode/branchboard-public-catalog-final/`.
  Reviewed all captures in six contact sheets and the three new catalog views at
  full size: mobile Settings, desktop picker and mobile picker.
- Public-source labels, update controls and setup guidance remain visible without
  keys. Mobile dialogs and the portaled model picker stay within the viewport.
  Both canvas top corners visibly clip content; existing port/gesture tests still pass.
- Live public-catalog fetch succeeded without credentials. Catalog entries are not
  an API-access or adapter-compatibility guarantee. Paid generation was not tested.
- A server restart interrupted an earlier run; the complete final rerun passed.
  No historical release artifact was changed or newly published.

## Material workspace — 1.6.0 (2026-10-22)

Design baseline: neutral Workspace-like surfaces, sage tonal accents, locally bundled
Roboto, header search, clear creation/navigation hierarchy, quieter cards and a
Gemini-inspired fixed composer. It retains BranchBoard's identity, without Google
branding, remote fonts, new AI behavior or a workspace migration.

- **141 unit/HTTP tests**, **78 Chromium interactions**, and the full production
  frontend/server build passed. A first heavily concurrent browser run timed out;
  the complete two-worker rerun passed without increasing timeouts or skipping tests.
- Screenshot script: **90 captures**, actual PNG/PDF exports and `browser-errors.json: []`.
  Artifacts: `/tmp/opencode/branchboard-material-qa/`. Reviewed all 90 in six contact
  sheets plus full-size desktop light/dark and mobile-first-open views.
- Review softened overly saturated accent fills before the final screenshot run.
  Mobile now starts with a readable conversation rather than a miniature whole graph;
  Fit canvas still intentionally zooms out for overview, while Focus conversation
  returns to a reading view. No saved viewport is silently replaced.
- Search remains accessible when the sidebar collapses. Message controls reveal on
  hover/focus (always visible on touch); reduced motion and native text selection remain.
- Historical refreshed editions have their own production smoke screenshots and
  verification records; their inherited full browser suites are not claimed as rerun.

Everything below records earlier iterations, not the current design.

## Earlier forest workspace (historical)

The current design uses a charcoal canvas in an inset rounded workspace, sage
accents, neutral cards, a compact sidebar that collapses to a usable icon rail,
and a floating composer. Light/system themes remain available. The older visual
iteration below is a historical record, not a description of the current layout.

Regression checks cover whole-card dragging, text selection at fractional zoom,
Shift selection, Space panning, internal copy/paste, saved viewports, quick creation,
connection branching/inspection, touch scrolling and composer bounds.

- The forest-design batch passed its production build, **128 unit tests** and
  **75 Chromium tests**.
- That screenshot run completed **86 captures**, real PNG/PDF downloads and no
  browser errors. Reviewed desktop/mobile light/dark layouts, the floating and
  expanded composer, icon rail, quick-create menu, text-selection mode, connection
  context, tablet layout and a fresh mobile starter graph. Additional isolated
  checks verified the Utilities menu and its real backups action at both widths.
- Artifacts: `/tmp/opencode/branchboard-green-final/`; `browser-errors.json` is `[]`.
  Detailed verification is recorded in `PROGRESS.md`.

## Automatically updated provider models

The model picker shows per-provider discovery status, last successful update and
recoverable errors, with an independent Refresh action. Exact model IDs can be
typed and assigned explicitly to a provider. Saved/default IDs remain available
without promising account access. Mobile keyboard resizing preserves the picker,
and the settings heading stays visible while its form scrolls.

- Production build, **137 tests across 14 files** and **78 Chromium tests** pass.
- The screenshot script completed **90 captures** plus real PNG/PDF downloads,
  without browser errors. Reviewed desktop refresh/error states, exact-ID entry
  and mobile picker/settings layouts.
- Artifacts: `/tmp/opencode/branchboard-model-discovery-final/`;
  `browser-errors.json` is `[]`.
- Discovery HTTP tests use real local servers; browser AI responses remain
  test-only fixtures. No live paid-generation request was used for verification.

## Earlier visual iteration (historical)

### Screenshots reviewed

The eight requested desktop views were captured at **1440 × 960**, inspected, corrected, and captured again. Four additional views cover **390 × 844** mobile layouts, plus two views verify the collapsed sidebar on desktop and mobile. The script uses real UI interactions at `http://localhost:3000`, isolated browser storage, and no AI fixtures or credentials.

| Screenshot               | Issues found                                                                                                                                                     | Corrections verified                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-canvas.png`          | Small, low-contrast labels; decorative sidebar clutter and misleading dropdown arrows; fitted nodes overlapped bottom controls.                                  | Readable type and contrast, simpler sidebar, removed false affordances, and a bounded canvas viewport that fits nodes clear of workspace controls.                                                              |
| `02-node-created.png`    | New nodes could stack over existing content; empty conversation guidance was unclear; blank Send was a dead disabled control.                                    | Additions find open space and fit into view. Empty-state guidance is explicit; Send appears when there is a message to send.                                                                                    |
| `03-connected.png`       | Node placement and canvas fitting made the graph difficult to scan; tools competed with the workspace.                                                           | Separated nodes, working drag-created edges, auto-arrange, and a compact contextual toolbar. The screenshot script asserts three nodes and two edges.                                                           |
| `04-settings.png`        | Unavailable Remove key / Refresh models actions appeared disabled; excessive spacing made the form long. Saving could lose focus and break Escape.               | Only applicable actions appear; busy actions explain their state. More compact form, correct provider targeting, and dialog-level Escape/focus handling even after focus loss.                                  |
| `05-model-selector.png`  | Unconfigured models were inert choices with misleading status; popup placement and empty search needed handling.                                                 | Selecting an unconfigured model opens that provider's setup. Explicit setup labels, hollow unconfigured indicators, bounded placement, keyboard navigation/focus containment, and a no-results message.         |
| `06-context-menu.png`    | Right-click only worked on the heading; chat color choices had no visible effect; menus could escape viewport bounds and lacked keyboard navigation.             | Whole-node context menus, colors only for notes with a visible selected state, measured/clamped positioning, and Arrow/Home/End/Escape navigation. Empty AI-context inspection now explains how to add context. |
| `07-command-palette.png` | No-op actions appeared without selection/history; two highlighted rows could appear; keyboard selection could scroll out of view; shortcut badges assumed macOS. | Only available actions appear, one active row, automatic scrolling, accessible active-option tracking, and platform-appropriate shortcut badges. The footer shortcut is a real button.                          |
| `08-dark.png`            | Inconsistent contrast and hierarchy carried over from light mode; theme switching was buried.                                                                    | Consistent themed surfaces, readable contrast, lavender interactive accent, and a direct light/dark toggle. Notes retain semantic content colors.                                                               |

Spacing and corner treatments are shared across tools, menus, nodes, and dialogs. Promotional decorations and redundant settings controls were removed rather than replaced with nonfunctional UI.

### Additional responsive checks

- `09-mobile-canvas.png`: compact navigation, visible canvas tools, fitted node, and unobstructed bottom controls.
- `10-mobile-settings.png`: review caught a clipped Save action. Shorter copy and reduced mobile decoration/spacing now expose both Save and Back to canvas without initial scrolling for the default provider.
- `11-mobile-model-selector.png`: search, results, and provider settings remain within the viewport.
- `12-mobile-context-menu.png`: all node actions remain within the viewport.
- `13-sidebar-collapsed.png` and `14-mobile-sidebar-collapsed.png`: the header toggle hides the sidebar and gives its space to the canvas without clipping controls. The toggle remains available to expand it; the preference survives reloads. Both actions also appear in the command palette.
- `15-sidebar-animation.png`: captures the 220 ms slide/fade at its midpoint. Canvas width changes smoothly; sidebar controls become inert immediately when collapsing. Motion can reverse mid-transition and is disabled for reduced-motion preferences.

Longer provider forms remain scrollable. Browser regressions also cover the initial canvas at 800 × 700.

### Rounded window and surfaces

The application now uses shared 8 / 12 / 16 / 24 px corner tokens. An inset, rounded window frame surrounds the sidebar and canvas; the main panel clips its header and footer to its curved border. Desktop and mobile retain appropriately sized gutters, including with the sidebar collapsed or animating.

Nodes, toolbars, zoom controls, dialogs, menus, inputs, composers, messages, code blocks, images, and the minimap use matching rounded treatments. Node cards keep overflow visible so their connection ports and resize handles remain usable; the minimap clips its contents to its rounded edge. Connection strokes also have rounded ends and joins. All 15 views were regenerated and visually reviewed after this change.

## Earlier verification and reproduction (historical)

Verification at that iteration:

- All 15 regenerated screenshots visually inspected; no remaining issues identified in these views.
- `browser-errors.json`: `[]`.
- `npm test`: **64 passed** across six files.
- `npm run test:e2e`: **28 passed** in Chromium, including desktop/mobile rounded-frame bounds and usable connection ports, sidebar persistence, keyboard access, command-palette recovery, intermediate animation states, reversal, and reduced motion.
- `npm run build`: **passed**, including strict TypeScript checking.

```sh
npm install
npx playwright install chromium
npm run dev
# In another terminal:
npm run screenshot
npm test
npm run test:e2e
npm run build
```

Screenshots are written to `screenshots/` (gitignored); `SCREENSHOT_DIR` can override the destination. Original desktop captures from this review are retained locally in `screenshots/before/`. The script writes `browser-errors.json` and fails on uncaught browser errors.

On this NixOS environment, Chromium requires the installed platform-library paths:

```sh
LD_LIBRARY_PATH="$(cat /tmp/opencode/branchboard-browser-library-path)" npm run screenshot
LD_LIBRARY_PATH="$(cat /tmp/opencode/branchboard-browser-library-path)" npm run test:e2e
```

AI generation and provider setup behavior are exercised with deterministic browser fixtures and a real local HTTP/SSE test provider, not paid live-provider requests. No credentials were entered by the screenshot script. Existing `releases/` and `data/` were left untouched.
