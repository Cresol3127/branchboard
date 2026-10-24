# BranchBoard 1.10.0 — Windowed workspace

Models and Settings are now independent windows inside the website. The first panel
docks beside the canvas, additional panels float, and only one window may be snapped.
Any visible window can be maximized, raised or focused. Windows move, resize from every
edge and corner, pop out, dock, maximize, restore and keep stable keyboard focus.
Opening the other tool no longer replaces the current panel; docking swaps the previous
dock to floating.

Snapping fills any half of the workspace: left, right, top or bottom. The canvas always
moves to the opposite half, fixing the reported docked-canvas and missing-vertical-snap
defects. Dragging to an edge shows a target preview above the moving window and commits
the same snap on release. Arrow keys move, Shift+Arrow resizes, Alt+Arrow snaps and
Enter maximizes or restores. Restore-under-pointer keeps a snapped or maximized window
attached to the cursor.

Only each panel's layout mode and last floating bounds are persisted at
`branchboard.windows.v1`. Open panels, maximized state, drafts and keys are never saved.
**Settings → Reset window layout** clears the presentation preference. Below 820px of
usable workspace width, panels become full-stage sheets with an inert but mounted canvas.

Connections now follow the supplied branching reference. Edges and ports inherit the
conversation family's color from a six-color light/dark palette, note inputs match the
conversation they feed, and 3px rounded paths with 12px ports make branches readable.
Selected and related edges retain their family color with added weight and glow;
arrowheads are smaller and match the path. A hover-scale port defect that shifted
measured connection endpoints at non-1 zoom was removed.

This is a source-and-runtime local release. Existing workspace, group/context, history,
annotation and backup data remain compatible. There are no new dependencies, paid
provider requests or credential changes. Node.js 22.12+: source downloads use
`npm ci`, `npm run build`, `npm start`; runtime downloads use `npm ci --omit=dev`,
`npm start`. Open `http://127.0.0.1:3001`. Export your workspace before changing origin.
Keys remain server-side; generation and explicit model tests may incur provider charges.

See the adjacent `verification.json`, manifest and checksums for exact unit, browser,
screenshot, runtime and archive evidence. Original releases remain immutable. This is a
private single-user local application; no public hosting, authentication or license
grant is added.
