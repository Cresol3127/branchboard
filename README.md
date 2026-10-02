# Branchboard

Branchboard is a Manifest V3 Chrome extension for exploring LLM conversations as a spatial graph. Every node is a prompt-response exchange that can become the parent of a new branch.

## Features

- Stream from Gemini, OpenAI, Anthropic, Ollama Cloud, local Ollama, or an OpenAI-compatible endpoint
- Discover currently available models and test a selected model before using it on a board
- Choose a provider and model in the composer for every new node
- Track recorded board-wide token usage and per-node model, duration, and throughput
- Box-select exact conversation nodes to compare recorded tokens, total request time, and weighted output speed live
- Author prompts with Obsidian-style Markdown and LaTeX live preview, then render the same formatting in user and model messages
- Attach images, videos, PDFs, text, code, and supported documents for multimodal models to inspect
- Let nodes grow in width and height with their content, or resize them with the mouse
- Keep roots, branches, drafts, and merges from overlapping during creation or dragging
- Ctrl+drag across conversations and annotations to select and move mixed board groups rigidly
- Route connections dynamically from the nearest side or corner as nodes move and resize
- Color-code one conversation node or its complete downstream family
- Add visual-only sticky notes and freehand pen annotations without changing model context
- Draw with mouse, stylus, or touch; erase whole strokes and undo or redo ink changes
- Retry an answer as a sibling with a one-off model choice, branch from any completed node, and fuse any number of empty branches into one shared-context merge
- Mute an exchange so it is omitted from future context
- Create, switch between, and safely delete multiple named whiteboards
- Delete accidental nodes together with every downstream DAG descendant
- Navigate and edit quickly with context-aware keyboard shortcuts and an in-app `?` reference
- Follow the system appearance by default, with persisted light and dark overrides plus adjustable reading fonts and text size
- Use an offline, CSP-safe Material 3 Expressive interface with locally bundled Roboto and Material Symbols assets
- Store graphs and provider settings in the local browser profile

## Build

```sh
npm install
npm run test
npm run build
```

## Install In Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the generated `dist` directory.
5. Pin Branchboard and click its toolbar button.

After rebuilding, click **Reload** on Branchboard in `chrome://extensions`.

## Keyboard Shortcuts

Press `?` outside an editor to open the categorized shortcut reference. Single-letter commands pause while focus is in the prompt composer, a sticky note, Settings, or another editable control, so normal typing and editor undo/redo remain unchanged. Escape closes only the topmost active layer.

| Scope | Shortcut | Action |
| --- | --- | --- |
| Global | `?` | Open keyboard shortcut help |
| Global | `/` | Focus the prompt composer |
| Global | `Shift+S` | Open settings |
| Global | `T` | Toggle light or dark appearance |
| Workspace | `Shift+N` | Create a whiteboard |
| Workspace | `[` / `]` | Switch to the previous or next whiteboard |
| Workspace | `Shift+R` | Start a new root |
| Canvas | `V` / `X` | Select and pan, or box-select nodes for token and performance comparison |
| Canvas | `Ctrl` + drag | Select touched notes and ink plus complete downstream families from touched conversations |
| Canvas | `N` / `P` / `E` | Note, Pen, or Eraser tool |
| Canvas | `F` | Fit conversations, notes, and ink |
| Canvas | `+` / `-` | Zoom in or out |
| Canvas | `Ctrl/Cmd+Z` | Undo an ink change |
| Canvas | `Ctrl/Cmd+Shift+Z` or `Ctrl+Y` | Redo an ink change |
| Selection | `B` | Create an empty branch from a completed conversation |
| Selection | `M` | Toggle mute context |
| Selection | `G` | Start, confirm, or cancel a draft merge basket |
| Selection | `S` | Stop a streaming response |
| Selection | `R` | Return a manually resized conversation to automatic sizing |
| Selection | `Delete` / `Backspace` | Safely delete the selected conversation or sticky note |
| Selection | Arrow keys | Nudge 8 px with collision protection |
| Selection | `Shift` + Arrow keys | Nudge 32 px with collision protection |
| Prompt editor | `Enter` / `Shift+Enter` | Send or insert a new line |
| Sticky editor | `Ctrl/Cmd+Enter` | Finish editing |

Keyboard deletion uses the same descendant confirmation as the card action. Keyboard movement persists immediately and follows the same conversation-only or sticky-only collision rules as pointer dragging. A Ctrl-selected mixed group moves and nudges rigidly: conversations stop before unselected conversations, notes stop before unselected notes, and ink moves unconstrained. Edge paths are excluded from the Tab sequence because they have no direct actions.

## Connect A Provider

Open Settings, choose a provider, enter its API key, and click **Refresh models**. Choose a discovered model or enter an exact custom model ID, then click **Test selected model**. The test sends a small real prompt and can consume a small number of tokens.

The Appearance section also controls reading typography for prompts, responses, the composer, and sticky notes. Choose Branchboard's mixed default, modern or humanist sans, classic serif, or monospace, then enter a base size from 10 to 24 px or use the minus and plus buttons. Code and math retain their specialized typefaces.

The compact model picker immediately left of Send opens provider and model controls for the next node. The selection becomes the default for later prompts, and its refresh action loads the selected provider's current catalog. Existing nodes keep the provider and model that originally generated them, and changing the picker never alters an in-flight response.

Nodes automatically grow through bounded width tiers from 340 to 620 pixels as their prompt and response become longer. Responses also grow vertically up to a viewport-aware safety limit before becoming scrollable. Select a node and drag its bottom-right resize handle to give it a persistent custom width and height. Use the reset-size control in the node header to return both dimensions to automatic sizing.

New roots, direct children, empty branch drafts, and fused merge drafts choose a clear position using every node currently on the board, including manually moved or resized nodes from unrelated branches. Dragging is collision-safe as well: a node stops before the first occupied boundary, even during a fast pointer movement. Existing saved layouts are not globally rearranged, and moving one node never pushes other nodes around.

Connections float along node borders automatically. Side-by-side cards connect from their facing sides, vertically arranged cards connect from bottom to top, and diagonal layouts approach the nearest corners. Routes update continuously while nodes move or resize; this changes only the visual edge geometry, not the underlying parent relationships.

Select a conversation node to open the color-code panel in the upper-right of the canvas. **Family** is the default scope and shows how many nodes will be affected before a color is applied; it colors the selected card and every downstream descendant, including branches and nodes after a merge. **Node** limits the change to the selected card. The color appears on the card accent, incoming connections, and MiniMap, while selection uses a separate neutral ring.

New single-parent nodes inherit their parent's color. A new merge inherits color only when all of its parents share the same color; mixed-color merges remain uncolored. Applying a family color overwrites the current colors of its descendants, after which any node can be recolored individually. Clearing a color follows the same Node or Family scope. Color coding is visual metadata only and never changes model context or provider requests.

## Sticky Notes And Pen

Open or pin the compact tray on the left edge to access the canvas tools. On desktop it also opens while hovered or keyboard-focused; on touch, use its handle. The selected conversation's color controls use a matching tray on the right edge.

Use the tools tray to switch between **Select**, **Box Select**, **Note**, **Pen**, and **Eraser**:

- **Select** restores normal panning, node selection, and dragging. Hold **Ctrl** while dragging a rectangle to create a mixed group: every touched conversation expands to include all descendants, while touched sticky notes and pen strokes are included directly. The selection summary reports conversation tokens, total request time, and weighted output speed. Drag any selected conversation or note, or use the visible selection handle for mixed and ink-only groups. The group persists atomically and can also be nudged with the arrow keys.
- **Box Select** lets you drag a rectangle across exact conversation nodes for a live token comparison. Sticky notes and ink are ignored, and the active node used for model context does not change.
- **Note** is a one-shot tool. Choose a color, click the canvas, and type into the new note. After placement, Branchboard returns to Select automatically.
- **Pen** remains active while you draw with a mouse, stylus, or finger. Choose a semantic color and stroke width before drawing.
- **Eraser** removes an entire stroke when the pointer touches it. One eraser gesture is one undoable change.

Pen changes have canvas-local undo and redo controls. Outside text editors, `Ctrl/Cmd+Z` undoes ink and `Ctrl/Cmd+Shift+Z` or `Ctrl+Y` redoes it. Press Escape to leave Note, Pen, or Eraser mode and return to Select. Drawing temporarily disables node dragging and canvas panning; touch users can return to Select for pan and pinch navigation.

Sticky notes have a header drag area, plain-text editor, color palette, delete action, and a resize handle when selected. Stickies avoid other stickies during placement, dragging, and resizing, but may intentionally overlap conversation cards. Conversation cards continue colliding only with other conversation cards, and pen strokes never participate in collision.

The Fit button in the tools tray frames conversations, sticky notes, and ink together. Each board remembers its viewport after navigation. Existing boards without a saved viewport still open using automatic fit.

Notes and ink are visual annotations only. They are never included in prompts, merged DAG context, token counts, or provider requests. Settings provides separate **Clear conversations** and **Clear annotations** actions so either layer can be removed without affecting the other.

The token comparison summary counts each box-selected conversation once and reports how many selected nodes have recorded telemetry. Its total is the original request usage for those nodes, including input context and model output. A `~` marks any estimated contribution; older nodes without telemetry are labelled untracked and are never guessed. The summary also totals the selected requests' elapsed time and reports a weighted output throughput: the combined known output tokens divided by the combined positive recorded durations. Requests that ended before producing text count toward time but not toward rate. A new marquee replaces the previous selection, while Clear or Escape removes it. The board-wide token counter in the top bar remains unchanged.

## Markdown And LaTeX

Write Markdown directly in the composer. Inline emphasis, strikethrough, code, links, and LaTeX render as a live preview whenever the cursor is outside that construct. Move the cursor or a selection into formatted content to reveal and edit its original syntax. Headings, lists, task markers, blockquotes, tables, and code fences keep their structural markers visible while gaining source-aware styling, which avoids fragile block editing.

Links remain non-navigable while editing. Markdown images become inert placeholders rather than making remote requests. The composer keeps normal selection, paste, undo/redo, spellcheck, and mobile text input behavior; press Enter to send or Shift+Enter for a new line.

Sent user prompts and streamed model responses render headings, emphasis, lists, task lists, blockquotes, links, tables, strikethrough, and inline or fenced code. Inline math uses `$...$` or `\(...\)`; display math uses `$$...$$` or `\[...\]`.

```md
## Derivation

The quadratic formula is:

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$
```

Formatting only affects presentation. Branchboard stores and sends the original text unchanged. Raw HTML is not rendered, unsafe link protocols are blocked, and remote Markdown images appear as placeholders instead of loading automatically.

## Attachments And Vision

Use the attachment button at the far left of the composer to choose Images, Videos, or Files. You can also paste or drop files directly into the prompt editor. Selected files appear in a removable tray above the editor, and a prompt may contain attachments without any text.

Branchboard sends supported inputs through each provider's native multimodal format:

- Text and code files are decoded locally and sent as bounded, labelled text to every provider.
- Images can be sent to Gemini, OpenAI, Anthropic, Ollama Cloud, local Ollama, and local OpenAI-compatible endpoints. The selected model must support vision.
- PDFs can be sent to Gemini, OpenAI, and Anthropic.
- Videos can be sent to Gemini. Larger Gemini media uses Google's Files API and waits for processing before the model request.
- Common office and spreadsheet documents can be sent through OpenAI. Other unsupported binary/provider combinations are blocked before a graph node is created.

Each prompt supports up to 10 attachments, 250 MB per file, and 500 MB total. Inline text/code files are limited to 5 MB. Provider limits can be lower and still produce a provider error.

Attachments follow the same DAG context rules as text. Files from complete, unmuted ancestors are resent to descendant requests, including both sides of a merge. Muting a node excludes its prompt, response, and attachments. Switching the next node to a provider that cannot accept an inherited file produces a clear error instead of silently dropping it.

Files are stored as Blobs in a separate local IndexedDB database, while whiteboards store only small attachment references. Images and videos render from temporary local Blob URLs; remote Markdown images remain inert. Deleting nodes or clearing a board removes unreferenced local files after the graph is safely saved, and startup cleanup removes crash leftovers. Branchboard does not generate images or videos.

## Branching And Merging

Sending from a completed node remains the fastest way to create a normal child response. Use **Branch** when you want to create an empty draft first. The selected empty draft uses the existing bottom composer and is replaced in place when you send it.

Use **Retry** on a completed or failed conversation to generate a sibling answer from the same prompt and exact parent context. Branchboard asks which provider and model to use for each retry without changing the normal composer route. The retry reuses stored attachment references, keeps the source color, and appears beside the source; it does not include the source answer or unrelated siblings in model context, and it leaves the current composer draft untouched.

To combine any number of branches:

1. Create an empty draft from each completed source node.
2. Click **Add to merge** on the first draft.
3. Click **Add to merge** on each other eligible draft you want in the basket. A draft must be empty and must contribute at least one parent that is not already in the basket. Already-merged drafts that add a new parent are eligible too.
4. When you have at least two drafts, the composer shows the basket size and parent count. Click **Confirm merge** (or press `G`) to fuse them, or **Cancel** to start over.

The placeholders fuse into one empty draft with one incoming edge per parent. Its request receives the complete transitive context from every parent equally. Shared ancestors are included once and unrelated siblings are excluded. A draft's own parent color is kept only when every parent agrees; mixed-color merges stay uncolored. Press Escape to cancel the basket without discarding the drafts.

A selected card shows **Remove** to pull it back out of the basket, while any eligible card shows **Add to merge**. The finished merge sits near the drafts' centroid and is still moved aside if a clear position is needed.

The board menu deletes the active whiteboard after confirming its conversation, sticky note, and ink counts. In-flight requests on that board are stopped, the adjacent board becomes active, and deleting the last board creates a fresh empty **Board 1**. Attachments left unreferenced by the removed board are cleaned up by the next save.

Deleting a node removes every downstream descendant that depends on it, including merges and nodes after those merges. This avoids leaving completed responses attached to incomplete or falsified ancestry.

The settings panel includes provider-specific setup links and instructions for:

- Gemini through Google AI Studio
- OpenAI through the OpenAI dashboard
- Anthropic through the Anthropic Console
- Ollama Cloud using its live model catalog

OpenAI lists all models visible to the account because its model catalog does not reliably identify chat capability. Use the model test to verify a chosen model.

## Local Models

Choose **Local endpoint**, then select an API format:

- **Ollama native API**: use a root endpoint such as `http://localhost:11434`. Model discovery reads `/api/tags` and chat uses `/api/chat`.
- **OpenAI-compatible API**: use a base path such as `http://localhost:1234/v1`. This works with services such as LM Studio, vLLM, LocalAI, and Ollama's OpenAI-compatible endpoint.

Local API keys are optional. Branchboard requests Chrome access only to the configured endpoint origin. In a normal Vite web preview, the endpoint must allow browser CORS.

If local Ollama rejects requests from the extension, configure `OLLAMA_ORIGINS` to allow the Branchboard extension origin. `OLLAMA_ORIGINS=chrome-extension://*` is convenient for local testing, but a specific extension origin is safer.

## Data And Security

Provider credentials, provider choices, conversations, sticky notes, pen strokes, and per-board viewports are saved with `chrome.storage.local`. Attached file bytes are stored separately in local IndexedDB. Annotation geometry is bounded and compacted before persistence, and a completed pen gesture is saved as one stroke rather than one write per pointer sample. Credentials and files are local to the browser profile but are not encrypted by Branchboard. Requests and inherited attachments go directly from the extension to the selected provider or configured endpoint; there is no Branchboard backend.

Existing single-board data, boards without annotation fields, single- and multi-parent conversation nodes, and the original `{ apiKey, model }` Gemini settings format migrate automatically. Existing conversation nodes remain valid, while new nodes record the provider and model that generated them. N-parent merges need no schema migration.

## Interface System

Branchboard follows the current official Material 3 Expressive guidance using native React components and official semantic color, typography, spacing, shape, breakpoint, and motion roles. It uses the static baseline-purple light and dark schemes. Branch/retry and multi-parent merge are the two intentionally expressive hero moments; routine graph editing remains predictable and restrained.

The web implementation does not imitate Material features that are not officially available on the web, including expressive type APIs and shape morphing. It does not depend on Material Web or MUI. Roboto, Roboto Mono, and Material Symbols Rounded are bundled under `public/assets` so the extension makes no remote font or icon request and remains compatible with Manifest V3 CSP. Their license texts are retained in `public/assets/licenses`.

The responsive layout follows Material's compact, medium, expanded, large, and extra-large window classes. Controls preserve keyboard operation, visible focus, accessible names, reduced-motion behavior, and 48 px interaction targets. Reading-font choices continue to affect only prompts, responses, composer content, and sticky notes; code and math retain specialized typefaces.

## Usage Metrics

The workspace status surface below the app bar totals recorded input and output tokens for requests made on the current board after usage tracking was added. Existing nodes are not retroactively counted. Deleting a node removes its recorded usage from the displayed board total.

Each new node records the model, elapsed request duration, and output throughput in tokens per second. Gemini, OpenAI, Anthropic, and native Ollama usage metadata is used when available. Endpoints that omit usage, including some local OpenAI-compatible servers, use a text-based estimate marked with `~`; estimates do not pretend to measure binary attachment tokenization. Requests rejected before producing text record duration but do not add estimated tokens.
