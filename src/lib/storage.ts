import {
  DEFAULT_SETTINGS,
  EMPTY_WORKSPACE,
  type Settings,
  type ConversationNode,
  type Whiteboard,
  type WhiteboardCollection,
  type Workspace,
} from "../types";
import {
  normalizeReadingFontSize,
  normalizeReadingFontStyle,
} from "./typography";
import { migrateConversationNode } from "./graph";
import { isConversationColor } from "./conversation-colors";
import {
  MAX_INK_STROKES,
  MAX_STICKY_NOTES,
  normalizeInkStroke,
  normalizeStickyNote,
  normalizeViewport,
} from "./annotations";

const WORKSPACE_KEY = "branchboard.workspace";
const WHITEBOARDS_KEY = "branchboard.whiteboards";
const SETTINGS_KEY = "branchboard.settings";

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

async function readValue<T>(key: string): Promise<T | undefined> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }

  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : undefined;
}

async function writeValue<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
}

function isWorkspace(value: Workspace | undefined): value is Workspace {
  return Boolean(value && Array.isArray(value.nodes));
}

function normalizeWorkspace(value: Workspace): Workspace {
  const viewport = normalizeViewport(value.viewport);
  return {
    nodes: value.nodes.map((value) => {
      let node = migrateConversationNode(value);
      if ("highlighted" in node) {
        const { highlighted: _highlighted, ...withoutPriority } = node as ConversationNode & {
          highlighted?: unknown;
        };
        node = withoutPriority;
      }
      if (node.color === undefined || isConversationColor(node.color)) return node;
      const { color: _color, ...withoutColor } = node;
      return withoutColor;
    }),
    notes: (Array.isArray(value.notes) ? value.notes : [])
      .slice(0, MAX_STICKY_NOTES)
      .map(normalizeStickyNote)
      .filter((note): note is NonNullable<typeof note> => Boolean(note)),
    strokes: (Array.isArray(value.strokes) ? value.strokes : [])
      .slice(0, MAX_INK_STROKES)
      .map(normalizeInkStroke)
      .filter((stroke): stroke is NonNullable<typeof stroke> => Boolean(stroke)),
    selectedNodeId:
      typeof value.selectedNodeId === "string" ? value.selectedNodeId : null,
    ...(viewport ? { viewport } : {}),
  };
}

export function createEmptyWhiteboard(name: string): Whiteboard {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    nodes: [],
    notes: [],
    strokes: [],
    selectedNodeId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function removeWhiteboard(
  collection: WhiteboardCollection,
  boardId: string,
): WhiteboardCollection {
  const index = collection.boards.findIndex((board) => board.id === boardId);
  if (index < 0) return collection;

  let boards = collection.boards.filter((board) => board.id !== boardId);
  if (!boards.length) boards = [createEmptyWhiteboard("Board 1")];
  const activeBoardId = boards.some((board) => board.id === collection.activeBoardId)
    ? collection.activeBoardId
    : boards[Math.min(index, boards.length - 1)].id;
  return { ...collection, boards, activeBoardId };
}

function createInitialBoard(workspace: Workspace = EMPTY_WORKSPACE): Whiteboard {
  const now = Date.now();
  const normalized = normalizeWorkspace(workspace);
  return {
    id: "default-board",
    name: "Board 1",
    ...normalized,
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadWhiteboards(): Promise<WhiteboardCollection> {
  const stored = await readValue<WhiteboardCollection>(WHITEBOARDS_KEY);
  if (stored && Array.isArray(stored.boards) && stored.boards.length > 0) {
    let migrated = stored.version !== 1;
    const boards = stored.boards.map((board) => {
      const workspace = normalizeWorkspace(board);
      const next = { ...board, ...workspace };
      if (
        workspace.nodes.some((node, index) => node !== board.nodes[index]) ||
        !Array.isArray(board.notes) ||
        !Array.isArray(board.strokes) ||
        JSON.stringify(board.notes) !== JSON.stringify(workspace.notes) ||
        JSON.stringify(board.strokes) !== JSON.stringify(workspace.strokes) ||
        JSON.stringify(board.viewport) !== JSON.stringify(workspace.viewport)
      ) {
        migrated = true;
      }
      return next;
    });
    const activeBoardExists = stored.boards.some(
      (board) => board.id === stored.activeBoardId,
    );
    const collection = {
      version: 1 as const,
      boards,
      activeBoardId: activeBoardExists
        ? stored.activeBoardId
        : stored.boards[0].id,
    };
    if (migrated) await writeValue(WHITEBOARDS_KEY, collection);
    return collection;
  }

  const legacyWorkspace = await readValue<Workspace>(WORKSPACE_KEY);
  const board = createInitialBoard(
    isWorkspace(legacyWorkspace) ? legacyWorkspace : EMPTY_WORKSPACE,
  );
  const collection = { version: 1 as const, boards: [board], activeBoardId: board.id };
  await writeValue(WHITEBOARDS_KEY, collection);
  return collection;
}

export function saveWhiteboards(collection: WhiteboardCollection): Promise<void> {
  return writeValue(WHITEBOARDS_KEY, collection);
}

export async function loadSettings(): Promise<Settings> {
  const stored = await readValue<unknown>(SETTINGS_KEY);
  if (!stored || typeof stored !== "object") return structuredClone(DEFAULT_SETTINGS);

  const value = stored as Record<string, unknown>;
  if (value.version !== 2 || !value.providers || typeof value.providers !== "object") {
    const legacyApiKey = typeof value.apiKey === "string" ? value.apiKey : "";
    const legacyModel = typeof value.model === "string" ? value.model : "";
    const migrated = structuredClone(DEFAULT_SETTINGS);
    migrated.providers.gemini = {
      apiKey: legacyApiKey,
      model: legacyModel || DEFAULT_SETTINGS.providers.gemini.model,
    };
    await writeValue(SETTINGS_KEY, migrated);
    return migrated;
  }

  const providers = value.providers as Partial<Settings["providers"]>;
  return {
    ...DEFAULT_SETTINGS,
    ...(value as Partial<Settings>),
    readingFontStyle: normalizeReadingFontStyle(value.readingFontStyle),
    readingFontSizePx: normalizeReadingFontSize(value.readingFontSizePx),
    providers: {
      gemini: { ...DEFAULT_SETTINGS.providers.gemini, ...providers.gemini },
      openai: { ...DEFAULT_SETTINGS.providers.openai, ...providers.openai },
      anthropic: {
        ...DEFAULT_SETTINGS.providers.anthropic,
        ...providers.anthropic,
      },
      "ollama-cloud": {
        ...DEFAULT_SETTINGS.providers["ollama-cloud"],
        ...providers["ollama-cloud"],
      },
      local: { ...DEFAULT_SETTINGS.providers.local, ...providers.local },
    },
  };
}

export function saveSettings(settings: Settings): Promise<void> {
  return writeValue(SETTINGS_KEY, settings);
}
