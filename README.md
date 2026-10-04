# BranchBoard 1.8.0 — Docked workspace

A local-first thinking space: an infinite canvas of connected AI conversations and sticky notes.

The Material workspace brings neutral surfaces, sage accents, locally bundled Roboto,
prominent search, simpler navigation and a fixed, Gemini-inspired composer—without
Google branding or changing where your data lives. New installations follow the
system theme; existing theme and canvas preferences are retained. On a fresh mobile
canvas, the first conversation opens at a readable zoom. **Focus conversation**
returns to a readable card view; **Fit canvas** shows the entire graph.

Workspace tools open in one panel extending from the sidebar. The canvas stays usable
beside it on wide screens; narrow screens offer **Back to canvas** without losing your
draft or viewport. Conversation cards prioritize questions and answers, with quiet
bottom actions and retained right-click menus. The right-edge creation toolbar expands
from **New conversation** when you need the other tools.

## Run

Requires **Node.js 22.12+** and npm.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. This command starts Vite and the local API together. Port 3000 must be available.

### Connect real AI

Open **Models in the sidebar**, choose a provider, and save its API key. OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Ollama, Ollama Cloud, and custom OpenAI-compatible endpoints are supported. Model pickers show only keyed, configured providers and successfully connected local Ollama. Use **Manage providers** to connect another provider. Existing conversation selections remain in board backups even if a provider is later disconnected; credentials never do.

**Test model** sends a small, output-bounded real request for the selected model through
the saved server settings. It sends no canvas content and creates no conversation.
Testing is explicit, cancellable and may incur provider charges. A public model listing
does not prove account access; an empty, interrupted or failed test is not reported as
successful. Save changed keys or endpoints before testing them.

Settings are saved atomically to **`branchboard.providers.json` in the project root**, with owner-only file permissions. This unencrypted local secrets file is gitignored: do not share it or include it in backups of your boards. Alternatively, copy `.env.example` to `.env` and set the providers you need:

```dotenv
OPENAI_API_KEY=your-real-api-key
OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=your-real-api-key
GOOGLE_API_KEY=your-real-api-key
```

Restart `npm run dev` after changing `.env`. The saved JSON config overrides environment defaults, including explicitly removed keys. To return entirely to `.env` configuration, back up and remove the JSON config yourself while the server is stopped. An unreadable config prevents startup rather than overwriting secrets.

For **Ollama**, start Ollama, install a model (e.g. `ollama pull llama3.2`), choose Ollama in settings, and use **Test Connection** to ping `/api/tags`. No key is needed; the default base URL is `http://localhost:11434`. Save a changed URL before selecting its models. For **Custom endpoint**, provide the API root (including `/v1` if needed), API key, and exact model name.

Cloud model selections update **without an API key** from the community-maintained [Models.dev](https://models.dev) public registry and [OpenRouter’s public catalog](https://openrouter.ai/models). The local server checks these fixed public sources when a list is stale at startup, every 15 minutes while visible/online, and when you return or reconnect. No credentials, conversations or custom model IDs are sent to the public catalogs. Text-input/text-output models are listed; known deprecated and embedding-only entries are excluded when the source supplies that metadata. This is a public listing, not a list of models authorized for your account or guaranteed to support BranchBoard’s adapters.

Open a conversation’s or the message bar’s **model dropdown** to search connected providers. Five recent choices appear first and persist across reloads; the last choice becomes the default for new conversations without changing existing chats. If no result matches, enter an exact ID for a connected provider and click **Use custom model**. **Check for updates** works without a key, including from the picker’s refresh icon; source/update details live under Settings → **Models & advanced options**. A separate disposable browser cache (`branchboard.model-catalog.v1`) keeps the last public list available offline; failures retain cached lists or built-in suggestions. Model history (`branchboard.model-preferences.v1`) is separate from canvases and backups. Public updates never change saved/default/custom IDs or existing conversation selections.

Local **Ollama** discovers only installed models through `/api/tags`, without confusing public cloud entries with installed models. **Fetch from saved API key** in Settings → **Models & advanced options** explicitly requests a configured provider’s authenticated listing; this never runs automatically for cloud providers. Custom endpoints retain manual discovery and exact-ID entry. Keys are needed to generate with cloud models, not to update the public catalog. The provider checks access when sending; there is no silent fallback.

All providers stream real responses through the local server. Provider charges apply. Failures show an error and red dot on the originating node; there is **no automatic fallback**. There are **no simulated AI responses**. Cloud generation requires the selected provider’s key; local Ollama does not. Stop preserves partial output.

## What works

- Infinite canvas: drag empty space to pan, Space-drag over cards, scroll/pinch zoom, fit/reset view, optional dotted grid with grid snapping, and a toggleable interactive minimap. Saved viewports survive reload and canvas switches.
- Nodes: create conversations and notes; edit content; drag non-interactive surfaces after a 5px threshold; resize selected nodes at their corners; collapse; color-code notes; duplicate and delete. Titles in older backups remain compatible metadata rather than required header controls. **T** enables text selection; touch scrolling remains available inside content.
- Connections: drag from a right-side dot to a left-side dot, or drop an output on open canvas to create a connected branch. Multiple parents merge context; cycles, self-links, and duplicate connections are rejected. Select an edge to disconnect it.
- Floating message bar: select a chat to continue it, or choose New conversation for an independent chat. Change models directly on desktop or mobile; recent choices persist and new conversations use the last choice unless a per-canvas session choice overrides it. Existing chats keep their own model. Changing models never sends a message or discards a draft, and is disabled for a generating chat. Session drafts stay separate per canvas/conversation. Enter sends, Shift+Enter adds a line, and **/** focuses the input. The bar stays fixed while panning/zooming and grows for multiline drafts.
- Conversations: Markdown rendering, token streaming, stop, retry/regenerate, persistent message history, and branching into new conversations. Branches inherit live ancestor history with shared ancestors included once; historical branches preserve their turn cutoff. Older saved context settings remain respected. If an old input limit blocks sending, **Remove old input limit** is undoable and keeps the draft.
- AI routing: independent provider/model selection per conversation, native Anthropic/Gemini/Ollama streaming, OpenAI-compatible routing, persistent provider settings, and dynamic/extendable model lists.
- Workspace: canvases numbered in creation/insertion order, rename, red hover/focus delete controls, search, undo/redo (50 steps per current canvas), auto-arrange, JSON backup/import, and Markdown export. Deleting an inactive canvas leaves the active canvas and its history unchanged.
- Local persistence: browser autosave, reload restoration, storage failure warnings, and import validation. Fonts are bundled locally.

Double-click or right-click empty canvas space for quick creation at that location. **Tips & shortcuts** opens Help with a short Getting started guide and searchable, grouped Keyboard shortcuts. **Ctrl/Command K** searches commands, canvases, nodes and saved content. Import/export/backups are in **Workspace tools**. Press **G** for grid/snapping; toggle the minimap from the command palette or expanded creation tools. View controls leave 24px above a visible minimap and move down when it is off, avoiding the composer and keyboard without changing your zoom or position. Drawing controls stay below the creation toolbar. Very short viewports temporarily pause the minimap with a visible notice. Delete or Backspace removes selected nodes/connections, with integrated confirmation for legacy groups or five selected nodes. **Ctrl/Command-drag** on empty space draws a selection rectangle; **Shift-click** adds/removes individual selections. Rectangle selection never creates a container. Existing legacy groups remain readable and can be ungrouped. **Ctrl/Command C/V** copies and pastes nodes within BranchBoard, not the operating-system clipboard. Alt-drag a connection dot repositions it; a short Alt-drag resets it.

## Data and privacy

Boards and histories live in **this browser’s localStorage**, under `branchboard.workspace.v1`; they are not synced across browsers or devices. Clearing site data deletes them. Export a JSON backup for durable, portable storage; Markdown is a readable export, not an import format. Large histories can exceed browser storage limits; the UI warns and offers backup instead of silently discarding changes.

Browser storage is tied to the exact origin (scheme, hostname and port). `localhost:3000`,
`127.0.0.1:3000` and production port 3001 do not share storage. Export/import a workspace
backup when switching origins. Use separate profiles/origins to compare old editions;
do not let different versions or tabs edit the same stored workspace concurrently.

Only the selected conversation and its connected upstream context are sent to the configured AI provider when you send or regenerate a message. Unconnected nodes are not sent. Responses stopped midway are retained. Regenerating replaces the last assistant reply. Undo/redo is disabled while any response is streaming to avoid corrupting an active conversation. Deleting a group deletes its children; **Ungroup** retains them.

This is a **single-user local app**, not a hosted multi-user service: the API binds to `127.0.0.1` by default and rejects cross-origin browser API calls. Provider credentials stay on the server, in `.env` or the local JSON config, and are never returned by the settings API or written into browser storage. Provider requests and Ollama connection tests originate on that server. Do not expose the dev server or API to untrusted networks; add authentication and proper secret isolation before deploying publicly.

## Build and verify

```sh
npm run build       # strict TypeScript + Vite frontend + bundled Node server
npm start           # local API + built app at http://127.0.0.1:3001
npm test            # graph, persistence, streaming, and HTTP/API tests
npx playwright install chromium
npm run test:e2e    # actual Chromium canvas and conversation interactions
npm run screenshot # with dev server running: desktop/tablet/mobile captures and exports
```

On Linux, Playwright may require `npx playwright install --with-deps chromium` or equivalent distribution-specific libraries. The browser tests reuse a running dev server or start one automatically. Test AI fixtures are confined to tests; API tests exercise an actual local upstream HTTP/SSE provider. A paid live OpenAI request is not part of the automated suite.

The screenshot script uses isolated browser storage and actual UI interactions, without AI fixtures or credentials. See [the visual QA report](docs/visual-qa.md) for findings and verification notes.

`PORT` changes the local API port (default 3001); Vite’s proxy follows it. `HOST` changes the API bind address. `npm start` requires a successful build first. The larger product ideas in `SPEC.md` (agents, files, collaboration, and more) are outside this implementation.

## Release history and limits

See [releases/README.md](releases/README.md) for preserved originals, explicitly labeled
prototype refreshes, checksums and verification. No original release or protected `data/`
payload was overwritten. Maintained cleanup editions supersede older UI-bearing
downloads and previews without rewriting their tags or provenance. Early prototypes
retain two cards and a smaller feature surface; later editions retain their progressively
richer tools. Each download has its own verification scope.

Automatic recovery timelines, attachments, token billing, RAG and workflows remain
unfinished groundwork—not enabled product features. This release does not migrate
workspace storage. No project distribution license has yet been selected; private
release packages are not a grant to redistribute the application.

The unused native SQLite dependency is optional groundwork. Its absence does not
affect the current app, which stores boards in the browser; developing future SQLite
features may require the platform's native compiler/build tools.

See `AGENTS.md` for architecture, conventions, and maintenance notes.
