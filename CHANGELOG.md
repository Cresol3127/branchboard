# Changelog

Notable changes, newest first. See the [release catalog](releases/README.md) for
artifacts, provenance and verification. Early entries were reconstructed from preserved
sources; original v1.1–v1.5 release dates are unknown.

## 1.11.0 — 2026-10-30

- Added comprehensive Product Requirements Document (`PRD.md`) with algorithmic flowcharts.
- Added token comparison stats island and node interconnection modal.
- Updated AI provider configurations, error diagnostics for local server availability, and model choices.
- Added dual light/dark desktop workspace preview screenshot to documentation.

## 1.10.1 — 2026-10-26

- Replaced visible connection ports and freehand link drawing with one hidden source
  origin at each card's exact center. Edges now emerge from that shared origin and are
  created only by branching, imports, merging or dropping a card near another card's
  right edge. Legacy `portPositions` imports remain readable but no longer affect layout.
- Added **Merge selected parents**: select exactly two non-group cards to create a blank
  shared chat child beside them with two parent edges. The child inherits both parent
  histories as context, deduplicates shared ancestors, inherits a stable model and
  family color, and restores in one undo step. Available in the command palette, node
  menu and conditional board toolbar; blocked for groups, invalid selections and busy
  generations.
- Kept family-colored 3px paths, arrowheads and selected-edge weight/glow. Automatic
  drag-drop branches now avoid overlapping existing cards so the new branch remains
  visible and selectable.

## 1.10.0 — 2026-10-26

- Added independent Models and Settings windows with one docked panel, multiple floating
  panels, at most one snapped panel, dock swapping, maximize/restore and focus/z-order.
- Added Windows-style edge snapping to all four halves. The canvas now always moves to
  the opposite half, including vertical top/bottom splits and snapping from a docked
  panel. Snap previews sit above the dragged window and dragging directly to an edge works.
- Added direct move, corner/edge resize and keyboard window control: Arrow moves,
  Shift+Arrow resizes, Alt+Arrow snaps and Enter maximizes or restores. Minimum window
  and canvas sizes remain bounded to the measured workspace.
- Persisted only each panel's mode and last floating bounds at
  `branchboard.windows.v1`; open panels, drafts, keys and maximized state are not saved.
  Added **Reset window layout** to Settings.
- Made every dockable surface movable, including Models, Settings, Help, Library,
  Backups, import/export, history, message editing and annotation layers. Command
  palettes and confirmations remain transient overlays.
- Added narrow full-stage sheets with an inert canvas below 820px usable workspace width,
  focus restoration, dirty-form guards and preserved drafts.
- Improved node connections: edges and ports now inherit conversation-family colors,
  use heavier rounded paths and family-colored arrowheads. Selected edges stay in their
  family color with a distinct weight and glow instead of switching to a generic accent.
- Fixed canvas placement under snapped panels, missing vertical snapping, resize-handle
  hit testing, stale keyboard window geometry, transient focus races and panel/header
  surface mismatches.

## 1.9.0 — 2026-10-26

- Adopted Material 3 Expressive motion: published spatial curves at 350/500/650 ms for
  geometry and effects curves at 150/200/300 ms for opacity and color, applied to
  panels, menus, dropdowns, toolbar reveals, the sidebar and node feedback.
- Kept closing UI inert, preserved focus and drafts, prevented discarded-form revival,
  and cancelled explicit model tests before their panel's visual exit finishes.
- Replaced sidebar Favorite/Delete buttons with an icon-based canvas context menu for
  favorites, project moves and confirmed deletion; supports keyboard and touch.
- Kept collapsed canvas numbers centered without horizontal scrolling or overlapping controls.
- Centered workspace search on the window, adapting to sidebar motion, open panels and
  narrow layouts; restored opener focus after closing full-view panels.
- Added 12 complete UI palettes and named custom palettes with live preview, light/dark
  tuning, contrast warnings, reset controls and safe local persistence.
- Limited automatic model suggestions to the latest known generation per supported
  family; retained saved selections and persistent exact-ID additions separately.
- Unified model dropdowns across settings, cards and the message bar; replaced provider
  headings with local accent-tinted logos and fallback icons.
- Improved appearance-label spacing, keyboard/mobile selection and unsaved-preview handling.
- Unified Settings header and action backgrounds with the panel instead of separate gray blocks.

## 1.8.0 — 2026-10-24

- Added docked workspace panels, draft-safe navigation and integrated confirmations.
- Simplified cards, creation tools and canvas navigation; removed Inspector and
  persistent group-creation controls while preserving legacy data.
- Added explicit, bounded and cancellable model testing without canvas content.
- Made Ctrl/Command-drag rectangle-only; preserved active work when deleting other canvases.
- Fixed annotation completion, exported Markdown tables, selection and mobile spacing.

## Historical cleanup editions — 2026-10-24

**1.1.2, 1.2.2, 1.3.2, 1.4.2, 1.5.2, 1.6.1, 1.7.1**

- Removed Inspector and group-creation entry points; standardized rectangle selection.
- Preserved each edition's feature set, legacy groups and inherited context without
  backporting the docked redesign. Original artifacts and tags remain unchanged.

## 1.7.0 — 2026-10-23

- Added keyless public model catalogs, offline caching and five persistent recent choices.
- Shared the model picker with the message bar; simplified Settings and Help.
- Improved responsive overlays, minimap clearance, sidebar targets and canvas corners.
- Fixed development-proxy key saves and wrapped composer drafts; hardened release verification.

## 1.6.0 — 2026-10-22

- Introduced Material surfaces, local Roboto, system theme defaults and readable mobile views.
- Added Focus conversation and standalone production-server builds.
- Fixed port serialization, branch routing, auto-layout, API 404s and install/build blockers.
- Added verified source/runtime packages, inventories and preserved release provenance.

## Historical Material refreshes — 2026-10-22

**1.1.1, 1.2.1, 1.3.1, 1.4.1, 1.5.1**

- Refreshed the corresponding v1.1–v1.5 snapshots with Material styling, clearer
  navigation, mobile fitting and standalone production servers.
- Simplified early prototypes to two starter cards; retained later feature sets.
- Fixed port resets, shared-ancestor layout and unknown API responses without rewriting originals.

## v1.5 — Forest workspace

- Added a unified, zoom-independent message bar with separate session drafts.
- Introduced charcoal/sage styling, an icon rail, quick creation and cross-canvas copy/paste.
- Added automatic provider discovery, exact model IDs and refresh/error controls.
- Improved card dragging, native text selection, edge actions and saved viewports;
  fixed cancellation accidentally submitting drafts.

## v1.4 — Canvas tools and recovery

- Added historical-turn branching, workspace backups and named manual snapshots.
- Added rich Markdown editing, interactive checklists, automatic sizing and collision handling.
- Added drawings, shapes, annotation layers and PNG/PDF canvas export.
- Added conversation imports, projects/folders, reusable templates and favorites.
- Added Ollama Cloud and provider setup guides; improved validation and mobile dialogs.

## v1.3 — History and search

- Added saved-message editing/deletion with confirmation, persistence and undo.
- Added cross-canvas content search with keyboard navigation and matching-turn focus.
- Guarded history changes during generation and rejected duplicate imported message IDs.

## v1.2 — Context controls

- Added source inclusion/exclusion, ordered context previews and estimated input budgets.
- Added heuristic token estimates, animated sidebar transitions and consistent rounded surfaces.

## v1.1 — First recoverable implementation

- Introduced connected chat/note/group cards, branching, merged context and streaming AI.
- Added multi-provider routing, server-held credentials, model discovery and cancellation.
- Added multiple canvases, autosave, undo/redo, JSON backups and Markdown export.
- Included canvas navigation, movable ports, themes, responsive controls and automated QA.

## v1.0 — Unavailable

The preserved snapshot is empty; its implementation and original release date cannot
be established. No features or verification results are attributed to it.
