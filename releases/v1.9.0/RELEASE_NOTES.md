# BranchBoard 1.9.0 — Fluid workspace

BranchBoard now follows Material 3 Expressive motion. Panels, context menus, model
dropdowns, creation tools, the sidebar and node feedback use the published spatial
curves at 350/500/650 ms for geometry and the published effects curves at 150/200/300 ms
for opacity and color. Spatial overshoot is preserved; effects never overshoot. Dragging,
resizing, ports and streaming text remain immediate, and reduced motion disables both
animations and delayed visual removal.

Closing controls immediately become inert. Focus, dirty-navigation confirmation,
drafts and viewport remain protected; reopening cannot revive a discarded form.
Explicit model tests abort at logical close, before their visual exit completes.

This release also includes 12 complete UI palettes, named custom palette tuning,
latest-known model recommendations with persistent exact-ID additions, local provider
logos, window-centered search and icon-based canvas context menus. Existing canvas,
group/context, history and backup data remain compatible. Personal palette/model
libraries are browser preferences, not workspace backups or credential storage.

Node.js 22.12+: source downloads use `npm ci`, `npm run build`, `npm start`; runtime
downloads use `npm ci --omit=dev`, `npm start`. Open `http://127.0.0.1:3001`. Export
your workspace before changing origin. Keys remain on the server; explicit generation
and model tests may incur provider charges. No paid requests were used for QA.

See adjacent `verification.json` and the release catalog for exact browser, visual,
source/runtime install evidence and archive hashes. Original releases remain immutable.
This is a private local application; no public hosting, authentication or license grant
is added.
