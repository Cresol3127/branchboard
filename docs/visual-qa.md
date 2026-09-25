# Visual and interaction QA

## Settings origin fix — 1.7.0 development (2026-10-23)

- Production build, **154 unit/HTTP tests** and **11 focused Chromium tests** passed.
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
