# Branchboard

A local-first thinking space: an infinite canvas of connected AI conversations and sticky notes.

## Run

Requires **Node.js 22.12+** and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:3000**. This command starts Vite and the local API together. Port 3000 must be available.

### Connect real AI

Open **Settings in the sidebar** or **Connect AI** in the header, choose a provider, and save its API key. OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Ollama, Ollama Cloud, and custom OpenAI-compatible endpoints are supported. Each conversation has its own provider/model dropdown; choosing a model marked “Setup required” opens that provider’s settings. Selection is retained in board backups, never credentials.

Settings are saved atomically to **`branchboard.providers.json` in the project root**, with owner-only file permissions. This unencrypted local secrets file is gitignored: do not share it or include it in backups of your boards. Alternatively, copy `.env.example` to `.env` and set the providers you need:

```dotenv
OPENAI_API_KEY=your-real-api-key
OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=your-real-api-key
GOOGLE_API_KEY=your-real-api-key
```

Restart `npm run dev` after changing `.env`. The saved JSON config overrides environment defaults, including explicitly removed keys. To return entirely to `.env` configuration, back up and remove the JSON config yourself while the server is stopped. An unreadable config prevents startup rather than overwriting secrets.

For **Ollama**, start Ollama, install a model (e.g. `ollama pull llama3.2`), choose Ollama in settings, and use **Test Connection** to ping `/api/tags`. No key is needed; the default base URL is `http://localhost:11434`. Save a changed URL before selecting its models. For **Custom endpoint**, provide the API root (including `/v1` if needed), API key, and exact model name.

Model lists are fetched server-side using each provider’s saved credentials, at startup, after saving settings, and automatically when the last check is 15 minutes old. Background/offline polling pauses; returning to the app or reconnecting refreshes stale lists. Google and Anthropic use their native paginated APIs; Ollama lists installed models through `/api/tags`.

Open a conversation’s **model dropdown** to search the current lists or type an exact ID, choose its provider, and click **Use custom model**. Manually chosen IDs stay in the dropdown while referenced by saved conversations. Settings also accepts a typed default model, suggests discovered IDs, and saves **Additional models** (one ID per line) independently of conversations. Each provider shows refresh status, last successful update time and errors; **Refresh** retries immediately. Failed checks keep the previous list or initial suggestions. Refreshing never changes a conversation’s selected provider/model. Listings are cached in memory, not guaranteed across server restarts. Listing or entering a model does not guarantee account access or chat support; the provider decides availability, with no silent fallback.

All providers stream real responses through the local server. Provider charges apply. Failures show an error and red dot on the originating node; there is **no automatic fallback**. There are **no simulated AI responses**. Cloud generation requires the selected provider’s key; local Ollama does not. Stop preserves partial output.

## What works

- Infinite canvas: drag empty space to pan, Space-drag over cards, scroll/pinch zoom, fit/reset view, optional dotted grid with grid snapping, and a toggleable interactive minimap. Saved viewports survive reload and canvas switches.
- Nodes: create conversations and notes; edit titles/content; drag any non-interactive surface after a 5px threshold; resize selected nodes at their corners; collapse; color-code note icons; duplicate; delete; group and ungroup. **T** enables text selection; touch scrolling remains available inside content.
- Connections: drag from a right-side dot to a left-side dot, or drop an output on open canvas to create a connected branch. Multiple parents merge context; cycles, self-links, and duplicate connections are rejected. Select an edge to inspect its context or disconnect it.
- Floating message bar: select a chat to continue it, or choose New conversation for an independent chat. Session drafts stay separate per canvas/conversation. Enter sends, Shift+Enter adds a line, and **/** focuses the input. The bar stays fixed while panning/zooming and grows for multiline drafts.
- Conversations: Markdown rendering, token streaming, stop, retry/regenerate, persistent message history, and branching into new conversations. Branches inherit live ancestor history instead of making disconnected copies. “Inspect AI context” shows the exact ordered context, with shared ancestors included once.
- AI routing: independent provider/model selection per conversation, native Anthropic/Gemini/Ollama streaming, OpenAI-compatible routing, persistent provider settings, and dynamic/extendable model lists.
- Workspace: multiple canvases, rename/delete, search, undo/redo (50 steps per current canvas), auto-arrange, JSON backup/import, and Markdown export.
- Local persistence: browser autosave, reload restoration, storage failure warnings, and import validation. Fonts are bundled locally.

Double-click or right-click empty canvas space for quick creation at that location. Use **Tips & shortcuts** for the keyboard reference, or **Ctrl/Command K** for commands, canvases, nodes and saved-content search. Import/export/backups are in **Utilities**. Press **G** for the grid and snapping; use **Toggle minimap** in the command palette or the map icon in the board tools. Delete or Backspace removes selected nodes/connections, with confirmation for groups or five selected nodes. Shift-click selects multiple nodes; Shift-drag on empty space selects a rectangle. **Ctrl/Command C/V** copies and pastes nodes within Branchboard, including across canvases; it does not use the operating-system clipboard. Alt-drag a connection dot to reposition it; a short Alt-drag resets it.

## Data and privacy

Boards and histories live in **this browser’s localStorage**, under `branchboard.workspace.v1`; they are not synced across browsers or devices. Clearing site data deletes them. Export a JSON backup for durable, portable storage; Markdown is a readable export, not an import format. Large histories can exceed browser storage limits; the UI warns and offers backup instead of silently discarding changes.

Only the selected conversation and its connected upstream context are sent to the configured AI provider when you send or regenerate a message. Unconnected nodes are not sent. Responses stopped midway are retained. Regenerating replaces the last assistant reply. Undo/redo is disabled while any response is streaming to avoid corrupting an active conversation. Deleting a group deletes its children; **Ungroup** retains them.

This is a **single-user local app**, not a hosted multi-user service: the API binds to `127.0.0.1` by default and rejects cross-origin browser API calls. Provider credentials stay on the server, in `.env` or the local JSON config, and are never returned by the settings API or written into browser storage. Provider requests and Ollama connection tests originate on that server. Do not expose the dev server or API to untrusted networks; add authentication and proper secret isolation before deploying publicly.

## Build and verify

```sh
npm run build       # strict TypeScript check + production Vite build
npm start           # local API + built app at http://127.0.0.1:3001
npm test            # graph, persistence, streaming, and HTTP/API tests
npx playwright install chromium
npm run test:e2e    # actual Chromium canvas and conversation interactions
npm run screenshot # with dev server running: 90 desktop/tablet/mobile captures and exports
```

On Linux, Playwright may require `npx playwright install --with-deps chromium` or equivalent distribution-specific libraries. The browser tests reuse a running dev server or start one automatically. Test AI fixtures are confined to tests; API tests exercise an actual local upstream HTTP/SSE provider. A paid live OpenAI request is not part of the automated suite.

The screenshot script uses isolated browser storage and actual UI interactions, without AI fixtures or credentials. See [the visual QA report](docs/visual-qa.md) for findings and verification notes.

`PORT` changes the local API port (default 3001); Vite’s proxy follows it. `HOST` changes the API bind address. `npm start` requires a successful build first. The larger product ideas in `SPEC.md` (agents, files, collaboration, and more) are outside this implementation.

See `AGENTS.md` for architecture, conventions, and maintenance notes. Existing `data/` and `releases/` are not used or modified.
