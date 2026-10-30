# Release catalog

## Maintained downloads and previews

| Version   | Purpose                                                              | Source                                         |
| --------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| **1.11.0** | Documentation, provider updates, and token comparison               | Maintained project root                        |
| 1.10.1    | Center-origin automatic connections and shared-parent merging       | Preserved source/runtime archives in `v1.10.1/` |
| 1.10.0    | Windowed Models/Settings, four-way snapping and colored connections | Preserved source/runtime archives in `v1.10.0/` |
| 1.9.0     | Fluid workspace, personal palettes and refined model/canvas controls | Preserved source/runtime archives in `v1.9.0/` |
| 1.8.0     | Docked panels, quiet cards and bounded model testing                 | Preserved source/runtime archives in `v1.8.0/` |
| 1.7.1     | Design improvements with canvas cleanup                              | `v1.7.1/`                                      |
| 1.6.1     | Material workspace with canvas cleanup                               | `v1.6.1/`                                      |
| 1.5.2     | Composer and model discovery with canvas cleanup                     | `v1.5.2/`                                      |
| 1.4.2     | Rich notes and canvas tools with canvas cleanup                      | `v1.4.2/`                                      |
| 1.3.2     | Searchable history with canvas cleanup                               | `v1.3.2/`                                      |
| 1.2.2     | Connected-context prototype with canvas cleanup                      | `v1.2.2/`                                      |
| 1.1.2     | Minimal conversation/note prototype with canvas cleanup              | `v1.1.2/`                                      |

The seven cleanup editions were created on **2026-10-24** from verified source
archives. Only Inspector and persistent group-creation entry points were removed;
existing groups and inherited context remain compatible. They do not backport the
full docked workspace. Each `verification.json` records its original archive hash
and source commit. `index.json` records which maintained download each supersedes.

Earlier downloads/previews are withdrawn from the maintained list, not rewritten.
Original source directories, archived payloads, checksums and tags remain preserved
for private recovery. No original implementation has been fabricated for `v1.0`.

Current previews: [desktop](v1.10.1/previews/desktop.png),
[dark](v1.10.1/previews/dark.png), [mobile](v1.10.1/previews/mobile.png),
[Models](v1.10.1/previews/models.png), [Settings](v1.10.1/previews/settings.png),
[Help](v1.10.1/previews/help.png), [canvas actions](v1.10.1/previews/canvas-actions.png),
[expressive motion](v1.10.1/previews/motion.png),
[canvas export](v1.10.1/previews/export.png),
[windows](v1.10.1/previews/windows.png),
[connections](v1.10.1/previews/connections.png), [merge](v1.10.1/previews/merge.png)
and [top snap](v1.10.1/previews/top-snap.png).
Each cleanup edition also has four inspected production-browser previews.

## Local installation

Use Node.js 22.12+ and npm. Runtime downloads contain the built frontend and Node
server: run `npm ci --omit=dev`, then `npm start`. Source downloads use `npm ci`,
`npm run build`, then `npm start`. Open `http://127.0.0.1:3001`.

This remains a private single-user local service. No distribution license has been
selected, and nothing has been published to a registry, hosting service or remote.
Do not expose the server publicly. Back up workspace data before comparing editions;
use separate browser profiles/origins and do not edit the same storage concurrently.

## Provenance and verification

- Verified external checkpoints: `../branchboard-backups/20261022T133446Z-before-material-redesign/`
  and `../branchboard-backups/20261024T042350Z-before-sidebar-redesign/`, plus
  `../branchboard-backups/20261025T123541Z-before-motion-release/` and
  `../branchboard-backups/20261026T085316Z-before-windowed-workspace/` and
  the 1.10.0 verified archive/checkpoint retained beside `v1.10.0/`.
  Protected `data/`, real provider configuration and user work are not release payloads.
- Current app: full build, unit/HTTP and Chromium suites, complete screenshot flow,
  inspected screenshots and real PNG/PDF downloads.
- Cleanup editions: independent build/unit checks plus three dedicated production
  Chromium tests each. Four layouts, removed controls, note persistence, rectangle
  selection and legacy groups are covered; inherited full browser suites are not
  claimed as passing unchanged.
- Every new source/runtime archive is extracted and byte-compared with its manifest.
  Fresh source installs/builds/tests and production-only runtime installs with HTTP
  and Chromium checks are recorded against the exact artifact hashes.
- No paid AI requests were made. Browser generation tests use fixtures; HTTP adapter
  tests use real local upstream servers. Missing local Ollama is recorded separately
  from asset or browser failures. Public model listings do not guarantee account access.

Packaging uses explicit allowlists: no credentials, `.env`, provider configuration,
user databases, `node_modules`, browser traces, caches or QA downloads. `.env.example`
contains placeholders only. Build assets are inside archives, not source control.

## Release workflow

Freeze reviewed sources in Git first. Prepare only new editions with
`python3 scripts/package-current-release.py --version VERSION`, then run
`node scripts/verify-packages.mjs VERSION`. Finalize with
`python3 scripts/package-current-release.py --version VERSION --finalize` only after
matching fresh-install hashes pass. Commit evidence, then create the annotated tag.
Release tag after final verification: `v1.10.1`; cleanup tags: `editions/v1.1.2`,
`editions/v1.2.2`, `editions/v1.3.2`, `editions/v1.4.2`, `editions/v1.5.2`,
`editions/v1.6.1`, `editions/v1.7.1`. Tagged releases are immutable. The old batch
packager is not the updater for new releases.
