# BranchBoard

A local-first canvas for connected AI conversations, notes and ideas.

## Features

- Branching conversations with shared context and per-chat model selection.
- Rich Markdown notes, drawings, shapes and annotation layers.
- Projects, templates, favorites, search, undo/redo and manual snapshots.
- JSON backups, conversation imports, and Markdown, PNG and PDF exports.
- Responsive docked panels, keyboard shortcuts and customizable light/dark palettes.
- Latest-generation model dropdowns, provider icons and saved exact-ID additions.
- Window-centered search that adapts to sidebar changes and compact layouts.

## Quick start

Requires **Node.js 22.12+** and npm.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:3000**. In **Models → Manage providers**, configure OpenAI,
Anthropic, Gemini, OpenRouter, Groq, Ollama, Ollama Cloud or a custom OpenAI-compatible
endpoint. Local Ollama requires an installed model but no API key.

Keys stay server-side in the gitignored, unencrypted `branchboard.providers.json`
or [`.env`](.env.example). Saved settings override environment defaults.
Generation and explicit **Test model** requests may incur provider charges. Model
tests send no canvas content; public model listings do not guarantee account access.

Right-click a canvas button to favorite it, move it to a project or delete it.
Keyboard: **Shift+F10**; touch: **long-press**. Deletion requires confirmation.

### Appearance and models

In **Settings → Workspace**, choose a UI palette independently of Light/Dark/System.
Customize either variant, then save a named palette; edit, duplicate or delete your
copies without changing built-ins or saved card colors. Unsaved edits are previews.
UI transitions automatically respect your system's reduced-motion preference.

Model dropdowns suggest the latest known generation per supported family. Existing
and recent selections stay available separately; local Ollama lists installed models.
Use **Add model by ID…** for a specific model. Added IDs are saved separately from
the five recent choices and do not trigger an AI request. Palettes and added IDs are
browser preferences, separate from workspace backups. [Palette sources](docs/palette-sources.md).

### Production

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3001**. Export/import your workspace when switching ports or
hostnames: browser storage is tied to the exact origin.

## Development

```sh
npm test                         # Unit and HTTP tests
npx playwright install chromium
npm run test:e2e                 # Chromium interactions
npm run screenshot              # Visual QA; dev server must be running
```

## Data and security

Workspaces live in browser storage, not a synced account. Clearing site data removes
local work; download JSON backups for recovery. Credentials are excluded from workspace
backups. Only the selected conversation and its upstream context are sent on generation.

This is a **single-user local application** without authentication. Do not expose it
publicly. Attachments, automatic recovery timelines and billing analytics are not enabled.

## Documentation

[Changelog](CHANGELOG.md) · [Releases and previews](releases/README.md) ·
[Contributor guide](AGENTS.md) · [Visual QA](docs/visual-qa.md)

**License:** not yet selected; no redistribution permission is granted.
