# BranchBoard 1.10.1 — Center-spine connections and shared parents

Connections are now automatic-only. Every non-group card has one hidden source origin
at its exact center, so all outgoing family-colored paths emerge from the same point
under the card. A hidden target remains at the facing edge solely to keep the arrowhead
visible. The old visible port dots, suggestion rings, ghost connection line, Alt-drag
port editing and freehand drag-to-connect gestures are gone. Branch actions, imports,
automatic drag-drop branching and merging are the only ways to create an edge. Legacy
`portPositions` data stays readable for old backups but is ignored visually. Manual
edge disconnection remains available.

Select exactly two non-group cards and choose **Merge selected parents** from the command
palette, a node menu or the conditional board toolbar. BranchBoard creates one new blank
chat child to the right, vertically centered and clear of other cards, then connects both
parents to it. The child inherits both histories as model context; shared ancestors are
included once and no messages are copied. The first chat parent in stable canvas order
supplies the model, while the new edges determine a stable conversation-family color.
Creation, both parent edges and the child selection undo together. The action is hidden
for invalid selections and disabled while a generation is running. Two notes, or a note
and a chat, are also valid parents.

Automatic drop branches now use each source card's right-edge center as their gesture
target and settle clear of existing cards, so a newly created branch is not hidden beneath
another node. Existing keyboard, focus, reduced-motion, family-color, selected-edge weight
and glow behavior is preserved.

This is a source-and-runtime local release. Workspace, group/context, history,
annotation, import and backup data remain compatible. There are no new dependencies,
paid provider requests or credential changes. Node.js 22.12+: source downloads use
`npm ci`, `npm run build`, `npm start`; runtime downloads use `npm ci --omit=dev`,
`npm start`. Open `http://127.0.0.1:3001`. Export your workspace before changing origin.
Keys remain server-side; generation and explicit model tests may incur provider charges.

See the adjacent `verification.json`, manifest and checksums for exact unit, browser,
screenshot, runtime and archive evidence. Original releases remain immutable. This is a
private single-user local application; no public hosting, authentication or license
grant is added.
