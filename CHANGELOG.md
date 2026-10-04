# Changelog

## 1.8.0 — Docked workspace — 2026-10-24

### Changed

- Settings, Models, Help, history, backups and editors now share one docked workspace
  panel. On narrow screens, Back to canvas returns to the preserved canvas view.
- Conversation and note cards are titleless, with derived navigation labels and quiet
  contextual actions. Removed Inspector and persistent group-creation controls.
- Ctrl/Command-drag selects a rectangle; Shift-click toggles individual selection.
  Space/middle-drag pans. Existing groups remain readable and can be ungrouped.
- Creation tools dock at the right, collapsed to New conversation and an expand control.
  Removed routine autosave/header status, canvas token clutter and permanent hints.
- Canvas numbers follow original creation order. Delete controls appear on hover/focus;
  deleting another canvas preserves the active canvas, draft, viewport and history.

### Added

- Explicit bounded, cancellable testing of a selected configured provider/model using
  server-held credentials and no canvas content. Empty or interrupted output cannot pass.
- Integrated, target-pinned confirmations and dirty-panel navigation guards, with draft
  preservation, source-canvas return actions and keyboard focus restoration.
- Separate cleanup editions 1.1.2, 1.2.2, 1.3.2, 1.4.2, 1.5.2, 1.6.1 and 1.7.1,
  derived from verified originals with Inspector/group-creation entry points removed.

### Fixed

- Annotation gesture completion no longer depends on a potentially stale rendered draft.
- Markdown table export no longer wraps narrow cloned cells and clips the final row.
- Canvas-name focus spacing, mobile layer-name fields, toolbar/annotation placement
  and Favorite/delete hit targets are clearer without resetting canvas position.

### Compatibility

- Workspace formats, historical titles, context inheritance, cutoffs and legacy input
  limits remain compatible. Blocking legacy limits have an undoable reset.
- Original tags and artifacts remain unchanged. No paid requests, hosting, authentication,
  workspace migration or unfinished attachment/accounting features were introduced.

## 1.7.0 — Design improvements — 2026-10-23

### Changed

- Minimal model picker: only configured/keyed providers and connected local Ollama;
  recent choices first, search and progressive exact-ID entry, compact provider management.
- Settings shows essential fields and Save first, with collapsed setup/advanced details.
  Help separates a short guide from searchable, grouped keyboard shortcuts.
- Canvas overlays coordinate measured composer, minimap, keyboard and sidebar bounds.
  View controls move lower without the minimap and leave a 24px gap above it when shown.
  Layout changes preserve the graph viewport; collapsed-sidebar visuals are smaller
  while retaining 44px targets.

### Added

- Automatic keyless public model-catalog updates from Models.dev and OpenRouter,
  with manual checks before setup, source/update labels and an offline browser cache.
- Public catalogs remain independent of credentials, workspace backups and selected
  conversation models; authenticated listing is an explicit optional action.
- The message bar now opens the shared model picker for both existing and new
  conversations, including on mobile; drafts remain intact when changing models.
- Five persistent recent provider/model choices, with the last choice used for new
  conversations after reload. Existing conversations retain their own models.

### Fixed

- Both canvas top corners are rounded and clipped on desktop and mobile.
- Canvas corner cutouts now reveal the surrounding app surface rather than the
  identical canvas background, making both curves visible in light and dark themes.
- API-key settings saves incorrectly rejected as cross-origin in development; the
  Vite proxy now preserves the browser's host while the API keeps its origin checks.
- Wrapped composer drafts resize when available width changes instead of clipping
  extra lines; draft text and graph position remain unchanged.

### Compatibility

- Existing saved/default/custom IDs, installed local Ollama discovery and workspace
  formats are preserved. Public metadata is not an account-access guarantee.
- Released 1.6.0 and refreshed historical editions are unchanged.

## 1.6.0 — 2026-10-22

### Changed

- Material workspace: neutral semantic surfaces, local Roboto, softer sage accents,
  prominent search, clearer canvas navigation, quieter cards and consistent controls.
- Fresh installations follow system theme; mobile opens a readable conversation.
- Production startup runs the built Node server, with no tsx runtime requirement.

### Added

- Focus conversation view action.
- Recoverable release provenance, inventories, independent refreshed historical editions.

### Fixed

- Port reset values breaking validated exports and snapshots.
- Branches losing their source provider/model.
- Auto-layout repeatedly traversing merged ancestor paths.
- Unknown API routes returning successful HTML instead of JSON 404.
- PDF.js lifecycle/type drift blocking the build in inactive attachment groundwork.
- Unused native SQLite groundwork blocking installs without native build tools;
  it remains available as an optional dependency, not a current runtime requirement.

### Compatibility

- Existing workspace/backup formats and saved viewports are retained. No storage
  migration or unfinished attachment/recovery/accounting feature is enabled.
- Original release labels and artifacts remain preserved. Refreshes 1.1.1–1.5.1
  are new editions, not rewritten historical releases; see the release catalog.
