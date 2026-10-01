# BranchBoard 1.7.0 — Design improvements

2026-10-23 · Private local release · Tag `v1.7.0`

## A quieter, more predictable workspace

- The model picker shows only configured/keyed providers and successfully connected
  local Ollama. Five recent choices appear first, survive reloads and supply the
  default for new conversations. Existing chats keep their own model.
- Choose a model directly from the message bar on desktop or mobile, without sending
  a request, losing a draft or creating an empty conversation.
- Public cloud catalogs update without keys. Cached choices remain usable offline;
  authenticated listing is an explicit advanced Settings action, never automatic.
- Settings prioritizes essential fields and Save. Setup and advanced controls are
  collapsed. Help has a short guide and searchable, grouped keyboard shortcuts.
- View controls move down when the minimap is off and leave 24px above it when shown.
  Composer height, sidebar width and keyboard space coordinate overlays without
  resetting your graph position or zoom. Short viewports visibly pause the minimap.
- Smaller collapsed-sidebar glyphs retain 44px targets. Both canvas top corners are
  visibly rounded against the surrounding surface in light and dark themes.
- API-key saves work through the development proxy while foreign origins remain blocked.
- Drafts resize when the window narrows, without clipped lines or lost text.

## Compatibility and verification

Workspace and backup formats remain version 1. Model history is a separate browser
preference; it contains only provider/model IDs, never keys. Existing conversations,
custom IDs, manual snapshots and saved viewports are retained. Public catalog IDs
are not proof of account access or adapter compatibility. No paid AI verification,
storage migration, unfinished attachments/recovery features or hosted service is included.

Original editions, previous tags and their artifacts remain unchanged. See adjacent
`manifest.json`, `SHA256SUMS` and `verification.json` for exact source provenance,
archive inventories and independently verified build/test/install evidence.

## Run locally

Requires Node.js 22.12+ and npm. Source: `npm ci`, `npm run build`, `npm start`.
Runtime: `npm ci --omit=dev`, `npm start`; both frontend and built Node server are included.
Open http://127.0.0.1:3001. Configure real providers in Settings; keys remain server-side.
Local Ollama needs its own running service and installed models.

Back up browser work before changing scheme, host or port: storage belongs to the
origin, not the release version. Do not expose this single-user local service publicly.
No distribution license has been selected; nothing is published to a registry or remote.
