# Changelog

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
