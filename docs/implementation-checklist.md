# Remaining product implementation: audit and acceptance checklist

Audit date: 2026-10-22. **Planning, not implemented functionality.** Unchecked
items below are not complete. This document covers all eight requested areas and
the remaining customization/keyboard requirements in `SPEC.md`.

## Authorization boundary

`AGENTS.md`, Scope and guardrails, says: “This is a single-user local-first
application, not a public authenticated service.” The requested hosted accounts,
shared workspaces and tenant isolation change that boundary. The request also
explicitly requires asking before changes conflicting with `AGENTS.md`.

**Approval needed:** allow an explicit opt-in hosted/collaborative mode and update
that guardrail, keeping local single-user mode the default. This is not permission
to deploy publicly, provision accounts, incur charges, or change existing data.
Local-only requirements do not themselves require this approval.

## Source audit

| Area                         | Actual implementation and evidence                                                                                                                                                                      | Remaining gap                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic recovery           | `src/store.ts`: `saveWorkspace`, `loadWorkspace`, snapshot validation/actions; `src/components/Backups.tsx`; `tests/e2e/recovery.spec.ts`                                                               | Debounced overwrite of one localStorage workspace and up to 30 manual snapshots. No automatic timeline, version preview, write journal, or migration recovery. Existing corrupt-byte protection and copy-on-restore must remain.                                                              |
| Files                        | `src/types.ts`: `Message.content` is a string; `server/app.ts` accepts text messages only; `src/conversationImport.ts` explicitly rejects non-text parts                                                | No attachment contract, blob persistence, previews, extraction, capability routing, attachment backup or garbage collection. PDF **export** is not PDF ingestion. No existing native attachment records were found in these contracts; future/unknown formats must not be silently stripped.  |
| Tokens and accounting        | `src/graph.ts`: `estimateTokens`, `workspaceTokenCounts`; `ContextInspector.tsx`; `src/store.ts`: generation budget check                                                                               | UTF-8-byte heuristic and client-side per-node input limit only. Board/selection counts are local-content totals, not inherited-context totals. No tokenizer registry, usage ledger, prices, cost analytics or spending enforcement.                                                           |
| Provider usage               | `server/providers.ts`: `streamChat` yields strings; `server/app.ts` emits token/done/error SSE                                                                                                          | Native usage metadata is discarded. Stopping at the first finish reason can skip a later usage-only chunk. Usage absence, interruption and cancellation need explicit statuses.                                                                                                               |
| Families                     | `src/store.ts`: `makeNode` uses purple for chats; `branch` copies the parent's color once; `Nodes.tsx` exposes note-only color controls; `styles.css` styles note colors                                | This is not ongoing family assignment. No deterministic multi-parent rule, reconnect/deletion propagation, chat overrides/reset, or non-color family label.                                                                                                                                   |
| Advanced AI                  | `src/search.ts` is explicitly literal local search; notes/manual context sources and parallel node generations exist                                                                                    | No prompt library, comparison coordinator, source-selected summary action, embedding/index/retrieval pipeline, citations or workflow runner/history. Literal search must not be relabeled semantic search.                                                                                    |
| Onboarding                   | `loadWorkspace` creates three authored starter nodes; `ProviderSetup.tsx` has real provider instructions; `Settings.tsx` has help; `WorkspaceLibrary.tsx` has user-created templates                    | No first-run flow, reopenable onboarding state, labeled reusable authored example collection or integrated no-key walkthrough. Existing help/template functionality should be reused.                                                                                                         |
| Collaboration                | `server/app.ts` registers config, discovery, Ollama test and chat routes; one provider registry and process-wide stream counter                                                                         | No account/session/workspace membership, database, shared boards, comments, invitations/share permissions, real-time channel, cursors, conflict handling or tenant isolation. All current endpoints assume trusted local access.                                                              |
| Security                     | Same-origin host comparison, 2 MB JSON limit, 500-message limit, five active streams, timeout/disconnect cancellation and credential redaction; `server/providers.ts` atomically saves mode-0600 config | No authentication, per-user authorization, encrypted credential database, request-rate limiter, upload isolation or hosted endpoint/SSRF policy. File permissions are not encryption; concurrency limits are not rate limiting. Origin checks are not authentication.                         |
| Durability/deployment        | Browser workspace/snapshot keys; atomic provider JSON; `.env.example`; npm lockfile/build/test scripts                                                                                                  | No database schema/migration history, server workspace backup/restore, restart reconciliation, deployment package or CI workflow. `data/` is explicitly not app storage.                                                                                                                      |
| Accessibility                | Shared focus-restoring `Modal`, labeled `IconButton`, keyboard palette/menu, CSS focus/reduced-motion rules; `appearance.spec.ts`, `sidebar.spec.ts`, theme-role contrast tests                         | No automated accessibility-engine suite, complete keyboard-only feature coverage or audit of all rendered contrast/stream announcements. Existing tests cover a subset, not WCAG conformance.                                                                                                 |
| Performance                  | Markdown memoization and drag autosave deferral exist; lazy rich editor/export imports                                                                                                                  | No reproducible 1,000+ node benchmark. `CanvasNode` subscribes to the entire store and scans board nodes; `App` remaps nodes/edges each render. Graph validation/layout repeatedly filter arrays; persistence serializes the whole workspace. These are candidates, not measured bottlenecks. |
| Remaining SPEC customization | Themes, model defaults, note colors, grid/minimap, ports and fixed keyboard mappings exist                                                                                                              | User-configurable shortcuts and complete keyboard node creation/navigation/model selection need an explicit acceptance pass; avoid treating pointer-only operations as keyboard support.                                                                                                      |

### Existing data contracts to retain

- Workspace key `branchboard.workspace.v1`: `{ boards, currentId, organization? }`.
- Snapshot key `branchboard.snapshots.v1`: validated independent named boards.
- Board JSON `{ version: 1, board }`; workspace JSON
  `{ version: 1, kind: 'workspace', boards, currentId, snapshots, organization? }`.
- Existing import limits: 20 MB, 100 workspace boards, 30 snapshots; board validation
  permits 5,000 nodes and 20,000 edges. Limits are not scaling guarantees.
- Persist node hierarchy/relative positions, historical turn cutoffs, manual
  context references, annotations, projects/folders, favorites and templates.
- Provider config `{ version: 1, providers }` remains server-only; discovery state
  and session drafts stay outside workspace backups.
- Appearance preferences remain separate. Never reinterpret a missing provider
  key as a successful connection or silently change an exact selected model ID.

## Phases, dependencies and measurable acceptance criteria

All phases require the shared verification gate below. Tests for new behavior must
be added with the implementation, not replaced by this checklist.

### P0 — Preservation, schema and measured baseline

Dependencies: none. Hosted architecture requires the approval above.

- [x] Read the contributor guide, progress, specification, README, relevant source
      contracts, provider adapters, persistence/import code and existing tests.
- [x] Record actual gaps and the single-user/hosted authorization conflict.
- [x] Run baseline build, complete unit/integration tests, Chromium tests and
      dependency advisory audit; record results in `PROGRESS.md`.
- [ ] Add a compatibility fixture matrix for every supported saved/export format,
      with groups, historical branches, model IDs, annotations and organization.
      Assert no content loss and disjoint imported active IDs.
- [ ] Introduce versioned additive schemas, explicit unsupported-version errors and
      transactional upgrade records. Failed/interrupted upgrades retain original bytes
      and can retry; downgrade never silently overwrites newer-format data.
- [ ] Record baseline timings at 100, 500, 1,000 and 2,000 nodes for chain, fan-out,
      diamond/merged and grouped boards. Measure load, pan/drag, context, validation,
      layout, save/restore and peak memory under a documented environment.

### P1 — Automatic history and interruption recovery

Dependencies: P0 compatibility/schema tests. Use transactional browser storage for
local history rather than multiplying large synchronous localStorage snapshots.

- [ ] Persist automatic committed revisions independently of undo. Proposed policy:
      coalesce edits into at most one revision per board per minute; force revision at
      import/restore and generation completion/cancellation; retain up to 60 revisions
      per board for 30 days, bounded by 100 MiB total automatic history. Document which
      first limit wins. Do not prune manual snapshots or the active workspace.
- [ ] Enforce retention transactionally; never evict the last recoverable committed
      state to make an unsuccessful write fit. Exceeding limits/quota is visible, with
      manual deletion/download available and no false saved acknowledgement.
- [ ] Add timeline browsing, timestamp/size/source labels, read-only content preview,
      confirmed deletion and restore-as-new-board. Restoring twice preserves current
      work and creates independent graph IDs each time.
- [ ] Reconcile pending and committed writes on reload; inject failures before and
      after each commit boundary. Recover the last complete revision, preserve corrupt
      inputs and partial conversations, and explain what was not committed.
- [ ] Label these as browser-local recovery, not independent backups. Export/import
      version history with explicit scope/size handling and retain all legacy backups.

### P2 — Local attachments and portable storage

Dependencies: P0 schemas; P1 revision/reference retention policy.

- [ ] Add content-addressed local blobs plus validated metadata and explicit
      node/message references. Store blobs outside localStorage. Uploading/previewing
      locally must produce **zero external network requests**.
- [ ] Support image, PDF, audio, video, code and document upload/list/preview/remove.
      Define an allowlist and initial limits (proposed 25 MiB/file, 250 MiB/workspace),
      validate signatures/encoding/actual size as applicable, and explain unsupported
      formats/codecs. Never execute uploaded code, HTML, SVG scripts or macros.
- [ ] Extract real text from UTF-8 code/text/Markdown, text PDFs and supported office
      documents using maintained parsers. Show extraction state, truncation and errors;
      scanned/encrypted PDFs must explain OCR/decryption limitations rather than return
      invented text. Bound pages, decompressed size, CPU time and extracted characters.
- [ ] Safely render image/media previews and bounded PDF pages with resource cleanup.
      Unsupported audio/video transcription is explicitly unsupported unless a real
      configured transcription integration is available; preview is not transcription.
- [ ] Add explicit attachment inclusion in ordered context inspection, showing what
      will leave the device. Send/regenerate/confirmed indexing are separate affirmative
      actions; changing providers revalidates capabilities before transmission.
- [ ] Add provider/model capability routing for native supported media and explicit
      text-extraction fallback selected by the user. Unsupported media fails before the
      upstream request. Native request shapes and failures use local HTTP test servers.
- [ ] Bundle actual blob bytes, hashes and references in a versioned portable backup;
      import atomically after validating the complete archive and expanded size limits.
      Test transfer to a fresh browser, not merely same-origin ID reuse.
- [ ] Garbage-collect only unreachable blobs after accounting for active boards,
      undo/redo, revisions, snapshots, templates and in-flight operations. Test deletion,
      restore, duplicate/import, crash recovery and failed-write cases.

### P3 — Tokenization, usage ledger, pricing and budgets

Dependencies: P0 storage; P2 attachment accounting; hosted enforcement also P8.

- [ ] Register locally bundled model tokenizers where licensed/available. Show
      tokenizer identity/version and separate exact text-token counts from unknown
      framing/media costs. Unknown models retain clearly labeled heuristic estimates.
- [ ] Provide local-content and deduplicated inherited-context totals for nodes,
      branches, selections/group descendants and boards. UI preview and sent payload
      use the same ordered context, historical cutoffs and attachment selection.
- [ ] Normalize provider usage events without dropping final usage-only stream
      chunks. Keep missing input/output/cache/reasoning fields unknown, not zero.
      Record provider/model/board/node/request IDs, timestamps, outcome and partial
      output for success, provider error, transport failure and cancellation.
- [ ] Persist/export generation records; distinguish estimates, provider-reported
      usage, provider-reported money and calculated cost. Never label calculated cost
      an invoice or infer that an omitted price is free.
- [ ] Add user-configured currency and dated input/output/cache pricing per exact
      provider/model ID; snapshot applicable rates on each generation. Analytics filter
      by date/provider/model/board and reconcile totals to the ledger in tests.
- [ ] Define budgets by explicit workspace/provider/board scope and time window.
      Reserve bounded input plus configured maximum output costs atomically before
      dispatch; concurrent requests cannot oversubscribe a reservation. Unknown rates
      or unbounded usage block strict monetary enforcement with an explanation.
- [ ] Settle/release reservations correctly on completion, cancellation, crash and
      provider failure, retaining uncertainty when billing is unavailable. Document that
      app admission control cannot cap charges made outside Branchboard or guarantee
      provider billing. Hosted checks run server-side, not only in browser state.

### P4 — Conversation-family appearance

Dependencies: P0 compatibility; does not require hosted approval.

- [ ] Specify stable root-family identity and deterministic merge priority (proposed:
      stable persisted root ID ordering, independent of edge-array order). Notes/groups
      do not create chat families. Show merged-family source labels in the inspector.
- [ ] Recompute inherited family on branch, edge add/remove, root/parent deletion,
      duplicate/import and undo/redo. Root reassignment must be reproducible after reload.
- [ ] Add explicit chat-only color overrides and Reset to inherited. Preserve legacy
      `color` values under a documented tested migration rather than overwriting them.
- [ ] Keep dark/light text contrast at least 4.5:1 and functional graphical indicators
      at least 3:1 where applicable; provide family names/relationship text, not color alone.

### P5 — Prompt/context libraries, comparisons and summaries

Dependencies: P1 persistence; P3 accounting/admission; P2 for attachment sources.

- [ ] Persist editable named prompts and reusable context with search, delete,
      import/export and explicit insertion preview. Missing template variables block
      execution; opening/inserting a prompt never sends a request automatically.
- [ ] Run a comparison against two or more explicitly selected real models from a
      frozen source payload. Track independent streaming, errors, usage and cancellation;
      one failure/stop must not stop siblings. Preserve originating-board routing and
      show that multiple requests may incur multiple charges.
- [ ] Summarize explicitly selected messages/nodes/attachments with a selected model.
      Preview exact sources, preserve source references and save only real returned text;
      test no-key, budget rejection, cancellation and changed/deleted sources.

### P6 — Real embeddings, semantic search and RAG

Dependencies: P2 extraction, P3 cost/records and P5 source contracts.

- [ ] Implement chunking with immutable source IDs/ranges/content hashes and a real
      configured embeddings adapter (including a local endpoint option). Index only
      after the user confirms source selection and external-data disclosure if relevant.
- [ ] Persist model/dimension/version with vectors; reject dimension mismatch and
      partial writes. Reindex changed sources, remove deleted sources, invalidate stale
      embeddings and expose index state, failures, cancellation and retry.
- [ ] Compute actual vector similarity and bounded top-k retrieval with source
      excerpts/references and score labels. Empty/unindexed data yields no semantic
      results; literal search remains separately available without credentials.
- [ ] Preview retrieved chunks before RAG generation; retain citations to exact source
      versions and visibly flag stale/unavailable citations. Enforce context limits and
      hosted workspace permissions at index, query, retrieval and generation boundaries.
- [ ] Test embeddings/retrieval protocol with local deterministic test servers and
      known vectors; test one real local model if available. Do not describe fixtures as
      a verified external embedding deployment.

### P7 — Workflow execution and guided onboarding

Dependencies: P5/P6 tooling, P3 reservations and P1 durable run records.

- [ ] Provide persistent editable workflow steps (prompt, source selection, model,
      retrieval and output destination) with bounded step/run/concurrency limits and
      validation before execution. No arbitrary shell execution or hidden network tools.
- [ ] Require a run preview/confirmation showing models, sources, external transfers
      and estimated/unknown cost. Persist step inputs/outputs/status/errors and expose
      cancellation. Failed dependencies halt dependent steps; never report a failed run
      as successful. Restart leaves interrupted steps visible and does not auto-charge
      by retrying non-idempotent requests.
- [ ] Add first-run setup with provider/local-model guidance, explicit Skip/explore,
      progress and reopen/reset controls. Opening/reopening never replaces a workspace
      or changes saved provider/model routing.
- [ ] Add reusable authored example boards/templates labeled “Authored example — not
      AI generated,” with no synthetic assistant answers. Use normal ID-remapped import
      and real canvas tools for a useful no-key walkthrough; generation requires setup.
- [ ] Add contextual keyboard-accessible tips; test first run, corrupt preferences,
      skip/reopen, offline/no-key use and preservation of pre-existing boards.

### P8 — Opt-in hosted identity, durable shared storage and collaboration

Dependencies: **explicit guardrail approval**, P0 migrations, P1–P3 data contracts.
Implement and test locally first; no public binding/deployment approval is implied.

- [ ] Define separate local and hosted configurations. Hosted mode refuses startup
      without required session/encryption/database configuration; local mode retains its
      no-login loopback workflow and existing data until explicit import/share.
- [ ] Use established password hashing or a maintained OIDC integration and opaque
      revocable server-side sessions. Test expiry, rotation, logout/revocation, fixation,
      CSRF and secure HttpOnly/SameSite cookies; never put credentials in URLs/logs.
- [ ] Implement database migrations for users, workspaces, owner/editor/viewer
      membership, boards, comments, attachments, versions, credentials, usage and runs.
      Test foreign-key/transaction behavior and restart recovery at each schema upgrade.
- [ ] Authorize **every** read/write, discovery/config, AI, file, embedding, backup and
      real-time endpoint. Isolate provider registries/discovery caches and ledgers by
      user/workspace; independent authenticated sessions cannot access guessed IDs.
- [ ] Encrypt stored provider secrets using an established authenticated cipher,
      versioned envelopes and an external key. Test tampering, missing/wrong key and
      rotation/restart; no silent plaintext rewrite. Document that server operators
      with key access and live provider processing can read plaintext (not E2EE).
- [ ] Restrict hosted endpoint destinations/redirects/DNS resolution against SSRF;
      local Ollama/custom private-network access is an explicit local-mode exception,
      not an arbitrary hosted tenant capability. Add per-account/IP route rate limits,
      streaming/upload quotas, safe error handling and hardened response headers.
- [ ] Protect upload/download authorization, path handling, file signatures, archive
      bombs, byte limits and safe disposition. Uploaded content must not become
      executable same-origin active content; unauthorized shares expose no file bytes.
- [ ] Add shared workspace UI, membership/role management, authenticated share links
      or expiring/revocable explicit guest grants, and comments with authorized editing.
      Revocation takes effect on subsequent operations and active real-time sessions.
- [ ] Use a maintained real-time transport with authenticated room membership and
      durable revision/conflict semantics. Concurrent edits cannot silently replace
      unrelated work; stale/invalid DAG edits fail visibly. Cursors are ephemeral and
      contain no conversation/credential payloads. Test reconnect/backpressure.
- [ ] Test owner/editor/viewer and unrelated user in independent browser contexts:
      edit propagation, simultaneous changes, denied writes/reads, share revocation,
      attachment restrictions, comment persistence, generation cancellation and server
      restart. Passing local single-user browser tests does not satisfy this item.
- [ ] Add consistent database-plus-blob backup/restore, manifest verification and
      restore drills to an isolated directory/database. No operation touches `data/`
      or `releases/`; no user content is replaced without explicit approval.

### P9 — Accessibility, measured optimization, customization and delivery

Dependencies: baseline P0; incremental accessibility/performance checks throughout
P1–P8; final measurements after the integrated UI and data paths exist.

- [ ] Add automated accessibility scans for dark/light desktop/mobile, dialogs,
      errors, attachments and hosted flows. Gate on zero unwaived serious/critical
      findings; document any waivers. Scans alone do not establish conformance.
- [ ] Add real keyboard-only tests for node creation/navigation/connection, model
      selection, library/history/file workflows, comparisons, budgets and roles. Verify
      focus return/containment, labels, streaming announcements and reduced motion.
- [ ] Implement validated configurable shortcut preferences with collision/reserved
      key detection, reset and persistence separate from credentials/workspace content.
      Maintain input/dialog exclusions and the existing default shortcuts.
- [ ] Profile P0 benchmark shapes; optimize measured hot paths (candidate adjacency
      indexes, iterative traversal, narrow Zustand selectors, render virtualization and
      transactional incremental persistence). Verify ordering/DAG/history invariants
      after each change; do not assume every candidate optimization helps.
- [ ] Publish raw benchmark results, hardware/runtime/build/sample counts, median
      and p95, memory and limitations. Proposed interactive target: p95 drag frame under
      32 ms on the documented 1,000-node reference case; report failure rather than
      weakening the benchmark. Test import/context/save on 2,000-node boards as well.
- [ ] Add lockfile-based CI for build, unit/HTTP/migration/security, Chromium,
      accessibility and benchmark smoke checks. Keep secrets/artifacts out of source.
      Dependency additions need a documented purpose, license and maintenance review.
- [ ] Document reproducible local/hosted environment, database/files/key backup,
      upgrade/rollback, TLS reverse proxy, session policy, rate/upload limits, encryption
      boundaries, restore procedure and non-verified external requirements. No deploy
      commands may silently expose the service or provision a paid account.
- [ ] Run the complete verification gate, inspect final desktop/mobile screenshots,
      and reconcile every unchecked item with `PROGRESS.md` and README limitations.

## Dependency choices to justify during implementation

These are proposals, not installed dependencies or completed integrations:

- An IndexedDB wrapper for atomic browser revisions/blobs; a maintained database
  driver/migration layer for opt-in hosted persistence. Avoid dual-write data loss.
- Maintained PDF and office document parsers for actual extraction, isolated and
  resource-limited; browser-native media elements where possible for previews.
- A licensed model tokenizer package rather than claiming the byte heuristic is
  exact; a configured real embeddings endpoint rather than fabricated vectors.
- Established authentication/session/password, authenticated encryption and
  real-time transport primitives; do not invent cryptography or expose a generic
  untrusted provider proxy.
- An accessibility engine for automated checks, complementing Playwright keyboard
  tests and manual review; reproducible benchmark scripts instead of scale claims.

## Shared per-phase completion gate

1. Unit, real-local-HTTP integration and Chromium tests cover success, validation,
   failure, cancellation, reload, rollback/recovery and relevant authorization.
2. `npm run build`, `npm test` and applicable browser tests pass; persistence,
   streaming, graph or interaction changes require both complete test suites.
3. Run `scripts/screenshot.mjs` with isolated browser storage and a separate artifact
   directory; inspect output, fix issues, rerun, and record captures/errors. Extend
   the script for each new real UI, not just the existing screens.
4. Re-run compatibility fixtures; preserve conversations, files, organization,
   snapshots/templates and exact models. Neither silent lossy migration nor a
   screenshot of a decorative control passes acceptance.
5. Update `PROGRESS.md` with exact behavior, commands/results, limitations and any
   external verification blocker. Only check off items whose criteria actually pass.

## External checks and approval limits

No live paid generation/embedding/transcription, external identity provisioning,
cloud database provisioning or public deployment has been authorized/performed by
this audit. Absence of external infrastructure does not block implementing and
testing adapters locally, but account-specific availability/billing and production
infrastructure remain unverified until explicitly approved and exercised. No-key
exploration must remain useful without fabricating any of these results.
