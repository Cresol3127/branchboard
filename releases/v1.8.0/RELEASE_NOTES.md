# BranchBoard 1.8.0 — Docked workspace

Created 2026-10-24. Workspace tools now open in one docked nonmodal panel beside
the sidebar; narrow screens return with Back to canvas. Drafts, zoom/position,
unsaved provider edits and keyboard focus are preserved.

- Titleless conversation/note cards, derived labels, quiet contextual actions,
  a right-mounted expandable creation toolbar and less persistent canvas clutter.
- Explicit, bounded and cancellable real model testing through server-held keys.
  Tests send no canvas content and may incur provider charges; no automatic tests.
- Original-order canvas numbers, hover/focus deletion and target-pinned integrated
  confirmations. Deleting an inactive canvas preserves the active workspace.
- Rectangle-only Ctrl/Command-drag selection and Shift-click toggles. Inspector and
  persistent group creation are removed; existing groups/context remain compatible.
- Fixed annotation completion races and clipped Markdown table exports. Retained
  ports, resizing, right-click actions, native text selection and touch scrolling.

Private local source/runtime. Requires Node.js 22.12+ and npm. Source: `npm ci`,
`npm run build`, `npm start`. Runtime: `npm ci --omit=dev`, `npm start`. Open
http://127.0.0.1:3001. Back up browser data before changing origin or edition.

No workspace migration, paid-provider verification, public hosting or license
selection. Browser generation tests use fixtures; HTTP tests use local upstreams.
Exact QA scope and independently checked archive hashes are adjacent to the download.
Original releases and the separately derived cleanup editions retain their provenance.
