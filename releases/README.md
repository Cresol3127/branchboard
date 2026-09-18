# Release catalog

## Current and refreshed editions

| Version   | Purpose                                                      | Preserved source        |
| --------- | ------------------------------------------------------------ | ----------------------- |
| **1.6.0** | Current Material workspace                                   | Maintained project root |
| 1.1.1     | Minimal two-card conversation/note prototype                 | v1.1                    |
| 1.2.1     | Prototype with inherited-context controls                    | v1.2                    |
| 1.3.1     | Prototype with searchable, editable history                  | v1.3                    |
| 1.4.1     | Rich notes, annotations, exports, organization and snapshots | v1.4                    |
| 1.5.1     | Fixed composer, text selection and model discovery           | v1.5                    |

These are **new editions created 2026-10-22**, not historical originals with silently
changed contents or invented dates. Every edition has matching package/lock versions,
release notes, a manifest, checksums and a verification record. Source and runtime
archives are separate: the runtime includes both the built frontend and Node server,
but no node_modules. Use Node 22.12+, `npm ci --omit=dev`, then `npm start`.
Source archives use `npm ci`, `npm run build`, then `npm start`.
Each edition also has checked desktop, dark and mobile images in `previews/`.
Current app previews: [desktop](v1.6.0/previews/desktop.png),
[dark](v1.6.0/previews/dark.png), [mobile](v1.6.0/previews/mobile.png).

**Private local releases:** no project distribution license has been selected.
Nothing has been published to a public registry, hosting service or Git remote.

## Original provenance and recovery

The original `v1.0`–`v1.5` directories are preserved in place, byte-for-byte.
All populated originals embed package version **1.0.0**, despite their directory
labels. `index.json` keeps those facts separate rather than rewriting history.
`v1.0` contains empty directories and no recoverable implementation; no replacement
has been fabricated. Original QA traces may contain data, so do not distribute raw
snapshots without a separate privacy review.

A verified pre-change archive and full file inventory are stored outside this project:
`../branchboard-backups/20261022T133446Z-before-material-redesign/`.
It preserves historical builds, screenshots, traces and empty directories; protected
`data/` and dependency caches were excluded and never touched. Source checkpoints:
`918e636` and `03b4db3`. Original path mappings are unchanged; `inventories/` records
file hashes and empty-directory entries. Original guides/docs remain historical.

## Verification and packaging

- Current app: full build, unit/HTTP and Chromium suites plus inspected screenshots.
- Refreshes: per-edition build/unit tests and a separate real production Chromium
  smoke check. Their inherited original layout tests are retained as historical
  references, **not claimed as passing unchanged**.
- Every new source/runtime archive is extracted and byte-compared during packaging.
  Additional clean-install/runtime results are recorded in each verification file.
- No paid AI requests were made. Cloud responses in full browser tests use fixtures;
  HTTP tests use actual local upstream servers. Screenshot/smoke runs use real UI
  without mock AI or saved credentials.

New packages use an explicit source/runtime allowlist: no secrets, .env files,
provider settings, user databases, node_modules, browser traces, caches or QA downloads.
`.env.example` contains configuration placeholders only. Generated assets belong in
archives, not Git. `scripts/package-releases.py` creates manifests/checksums and refuses
changed originals; `scripts/verify-editions.mjs` exercises the refreshed apps.
`scripts/verify-packages.mjs` checks extracted inventories, fresh source installs/builds/tests,
and production-only installs with real HTTP and Chromium checks. A missing local Ollama
service is recorded separately from application asset or browser failures.
The current release uses tag `v1.6.0`; refreshed source paths use namespaced tags
`editions/v1.1.1` through `editions/v1.5.1`, so they cannot be mistaken for older
standalone root checkouts. Tagged archives are immutable.

For future releases: back up first, update package/lock/changelog versions together,
build and test, prepare packages, run the edition/package verification scripts,
commit maintained sources, and run `python3 scripts/package-releases.py --finalize`.
Then commit the catalog/evidence and tag. `--replace-unpublished` is only for local
preparation; it refuses changes to archives once their version is tagged.

Back up your workspace before comparing versions. Use separate browser profiles or
origins: browser storage is keyed by scheme/host/port, not application version.
Do not run multiple editions/tabs against the same stored workspace concurrently.
