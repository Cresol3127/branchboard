import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
  type Viewport,
} from '@xyflow/react';
import {
  absolutePosition,
  canConnect,
  contextFor,
  estimateTokens,
  layoutNodes,
  resolveNodeCollisions,
} from './graph';
import { sseData } from '../server/stream';
import type {
  AnnotationState,
  Board,
  BoardNode,
  NodeData,
  Snapshot,
  WorkspaceBackup,
  WorkspaceOrganization,
} from './types';
import {
  emptyOrganization,
  folderSubtree,
  organizationName,
  validateOrganization,
} from './organization';
import { validateAnnotations } from './annotations';
import { isProviderId, type AIConfig, type ProviderId, type PublicProvider } from './providers';

const uid = () => crypto.randomUUID();
const blankBoard = (name = 'Untitled canvas'): Board => ({
  id: uid(),
  name,
  nodes: [],
  edges: [],
  updatedAt: Date.now(),
});
const makeNode = (type: BoardNode['type'], position: XYPosition): BoardNode => ({
  id: uid(),
  type,
  position,
  dragHandle: '.node-heading',
  style: {
    width: type === 'group' ? 700 : 340,
    height: type === 'group' ? 450 : type === 'note' ? 260 : 380,
  },
  data: {
    title:
      type === 'chat' ? 'Untitled conversation' : type === 'note' ? 'Untitled note' : 'New group',
    color: type === 'note' ? 'amber' : 'purple',
    messages: [],
    note: '',
  },
});

export function validateBoard(input: unknown): Board {
  if (!input || typeof input !== 'object') throw new Error('Invalid board.');
  const b = input as Board;
  if (
    typeof b.id !== 'string' ||
    typeof b.name !== 'string' ||
    !b.name.trim() ||
    !Array.isArray(b.nodes) ||
    !Array.isArray(b.edges) ||
    b.nodes.length > 5000 ||
    b.edges.length > 20000
  )
    throw new Error('Invalid board structure or size.');
  const ids = new Set<string>();
  const finite = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e8;
  const nodes = b.nodes.map((n): BoardNode => {
    if (
      !n ||
      typeof n.id !== 'string' ||
      ids.has(n.id) ||
      !['chat', 'note', 'group'].includes(n.type || '') ||
      !n.position ||
      !finite(n.position.x) ||
      !finite(n.position.y) ||
      !n.data ||
      typeof n.data.title !== 'string' ||
      typeof n.data.note !== 'string' ||
      typeof n.data.color !== 'string' ||
      !Array.isArray(n.data.messages)
    )
      throw new Error('Invalid node.');
    ids.add(n.id);
    for (const key of ['contextInclude', 'contextExclude'] as const) {
      const value = n.data[key];
      if (
        value !== undefined &&
        (!Array.isArray(value) ||
          value.length > 5000 ||
          value.some((id) => typeof id !== 'string') ||
          new Set(value).size !== value.length)
      )
        throw new Error('Invalid context sources.');
    }
    if (
      n.data.contextTokenLimit !== undefined &&
      (!Number.isSafeInteger(n.data.contextTokenLimit) ||
        n.data.contextTokenLimit < 1 ||
        n.data.contextTokenLimit > 10_000_000)
    )
      throw new Error('Invalid context token limit.');
    if (
      (n.data.provider !== undefined && !isProviderId(n.data.provider)) ||
      (n.data.model !== undefined &&
        (typeof n.data.model !== 'string' ||
          !n.data.model.trim() ||
          n.data.model.length > 512 ||
          /[\r\n]/.test(n.data.model))) ||
      (n.data.provider === undefined) !== (n.data.model === undefined)
    )
      throw new Error('Invalid provider or model selection.');
    if (
      !n.data.messages.every(
        (m) =>
          m &&
          typeof m.id === 'string' &&
          ['user', 'assistant', 'system'].includes(m.role) &&
          typeof m.content === 'string',
      )
    )
      throw new Error('Invalid messages.');
    if (new Set(n.data.messages.map((m) => m.id)).size !== n.data.messages.length)
      throw new Error('Duplicate message IDs.');
    if (n.data.autoSize !== undefined && typeof n.data.autoSize !== 'boolean')
      throw new Error('Invalid automatic sizing preference.');
    const ports = n.data.portPositions;
    if (ports) {
      if (
        typeof ports !== 'object' ||
        Object.values(ports).some(
          (p) => !p || !finite(p.x) || !finite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1,
        )
      )
        throw new Error('Invalid port positions.');
    }
    if (n.parentId !== undefined && typeof n.parentId !== 'string')
      throw new Error('Invalid hierarchy.');
    const width = Number(n.style?.width),
      height = Number(n.style?.height);
    return {
      id: n.id,
      type: n.type,
      position: { ...n.position },
      parentId: n.parentId,
      dragHandle: '.node-heading',
      style: {
        width: finite(width) && width >= 200 ? width : 340,
        height: n.data.collapsed ? 50 : finite(height) && height >= 100 ? height : 300,
      },
      data: {
        title: n.data.title,
        color: n.data.color,
        note: n.data.note,
        ...(n.data.provider ? { provider: n.data.provider, model: n.data.model } : {}),
        messages: n.data.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
        collapsed: Boolean(n.data.collapsed),
        autoSize: Boolean(n.data.autoSize),
        expandedHeight:
          finite(n.data.expandedHeight) && n.data.expandedHeight >= 100
            ? n.data.expandedHeight
            : undefined,
        ...(ports ? { portPositions: structuredClone(ports) } : {}),
        ...(n.data.contextInclude ? { contextInclude: [...n.data.contextInclude] } : {}),
        ...(n.data.contextExclude ? { contextExclude: [...n.data.contextExclude] } : {}),
        ...(n.data.contextTokenLimit !== undefined
          ? { contextTokenLimit: n.data.contextTokenLimit }
          : {}),
      },
    };
  });
  for (const n of nodes) {
    const included = new Set(n.data.contextInclude);
    const sources = [...included, ...(n.data.contextExclude || [])];
    if (
      sources.some(
        (id) => id === n.id || !nodes.some((source) => source.id === id && source.type !== 'group'),
      ) ||
      n.data.contextExclude?.some((id) => included.has(id))
    )
      throw new Error('Invalid context source reference.');
  }
  const ordered: BoardNode[] = [];
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (n: BoardNode) => {
    if (visiting.has(n.id)) throw new Error('Circular group hierarchy.');
    if (visited.has(n.id)) return;
    visiting.add(n.id);
    if (n.parentId) {
      const parent = nodes.find((p) => p.id === n.parentId);
      if (!parent || parent.type !== 'group') throw new Error('Invalid group hierarchy.');
      visit(parent);
    }
    visiting.delete(n.id);
    visited.add(n.id);
    ordered.push(n);
  };
  nodes.forEach(visit);
  const edges: Board['edges'] = [];
  const edgeIds = new Set<string>();
  for (const e of b.edges) {
    if (
      !e ||
      typeof e.id !== 'string' ||
      edgeIds.has(e.id) ||
      !ids.has(e.source) ||
      !ids.has(e.target) ||
      !canConnect(e.source, e.target, edges)
    )
      throw new Error('Invalid, duplicate or cyclic connection.');
    const history = e.data?.historyMessageIds;
    if (
      history !== undefined &&
      (!Array.isArray(history) ||
        history.length > 100_000 ||
        history.some((id) => typeof id !== 'string') ||
        new Set(history).size !== history.length ||
        nodes.find((n) => n.id === e.source)?.type !== 'chat')
    )
      throw new Error('Invalid historical branch.');
    edges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(history !== undefined ? { data: { historyMessageIds: [...history] } } : {}),
    });
    edgeIds.add(e.id);
  }
  const viewport =
    b.viewport &&
    finite(b.viewport.x) &&
    finite(b.viewport.y) &&
    finite(b.viewport.zoom) &&
    b.viewport.zoom > 0
      ? { ...b.viewport }
      : undefined;
  return {
    id: b.id,
    name: b.name.trim(),
    nodes: ordered,
    edges,
    viewport,
    updatedAt: Number(b.updatedAt) || Date.now(),
    ...(b.annotations !== undefined ? { annotations: validateAnnotations(b.annotations) } : {}),
  };
}

let protectSavedData = false;
function loadWorkspace(): {
  boards: Board[];
  currentId: string;
  organization: WorkspaceOrganization;
  storageError: string;
} {
  try {
    const raw = localStorage.getItem('branchboard.workspace.v1');
    if (raw) {
      const value = JSON.parse(raw);
      if (!Array.isArray(value.boards) || !value.boards.length)
        throw new Error('Invalid workspace');
      const boards: Board[] = value.boards.map(validateBoard);
      if (new Set(boards.map((b) => b.id)).size !== boards.length)
        throw new Error('Duplicate boards');
      return {
        boards,
        organization: validateOrganization(value.organization, boards, validateBoard),
        currentId: boards.some((b) => b.id === value.currentId) ? value.currentId : boards[0].id,
        storageError: '',
      };
    }
  } catch {
    protectSavedData = true;
  }
  const board = blankBoard('My first canvas');
  const chat = makeNode('chat', { x: 80, y: 120 });
  chat.data.title = 'Where ideas begin';
  const note = makeNode('note', { x: 520, y: 120 });
  note.data.title = 'A little space for big ideas';
  note.data.note =
    'Start a conversation, connect a thought, or make room for a different perspective.\n\nDrag the dots to share context between nodes.';
  const second = makeNode('note', { x: 520, y: 460 });
  second.data.title = 'Make it your own';
  second.data.color = 'sage';
  second.data.note =
    'Double-click the canvas to add a conversation. Select nodes to edit, resize, duplicate, or group them. Press Ctrl / ⌘ K for every command.';
  board.nodes = [chat, note, second];
  return {
    boards: [board],
    organization: emptyOrganization(),
    currentId: board.id,
    storageError: protectSavedData
      ? 'Saved data could not be read. It has not been overwritten. Export your work before starting a new canvas.'
      : '',
  };
}

type State = {
  boards: Board[];
  organization: WorkspaceOrganization;
  createFolder: (name: string, parentId?: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  moveBoard: (id: string, folderId?: string) => void;
  toggleFavorite: (id: string) => void;
  saveTemplate: (name: string, includeMessages?: boolean) => string;
  renameTemplate: (id: string, name: string) => void;
  deleteTemplate: (id: string) => void;
  useTemplate: (id: string, folderId?: string) => void;
  currentId: string;
  past: Board[];
  future: Board[];
  configured: boolean;
  model: string;
  providers: PublicProvider[];
  applyConfig: (config: AIConfig) => void;
  refreshModels: (id?: ProviderId, signal?: AbortSignal) => Promise<void>;
  settingsOpen: boolean;
  settingsProvider: ProviderId;
  streaming: Record<string, boolean>;
  storageError: string;
  toast: string;
  historyTarget: { boardId: string; nodeId: string; messageId?: string; focus?: boolean } | null;
  checkpoint: () => void;
  newBoard: () => void;
  switchBoard: (id: string) => void;
  renameBoard: (name: string) => void;
  deleteBoard: () => void;
  nodesChange: (changes: NodeChange<BoardNode>[]) => void;
  settleNodes: (ids: string[]) => void;
  sizeToContent: (id: string, height: number) => void;
  edgesChange: (changes: EdgeChange[]) => void;
  addNode: (type: BoardNode['type'], position: XYPosition) => string;
  updateNode: (id: string, data: Partial<NodeData>, checkpoint?: boolean) => void;
  editMessage: (id: string, messageId: string, content: string) => boolean;
  deleteMessage: (id: string, messageId: string) => boolean;
  setContextSource: (id: string, source: string, mode: 'auto' | 'include' | 'exclude') => void;
  connect: (source: string, target: string) => void;
  duplicate: () => void;
  removeSelected: () => void;
  group: () => void;
  ungroup: (id: string) => void;
  branch: (id: string) => string;
  branchFromMessage: (id: string, messageId: string) => string;
  branchOnDrop: (source: string, dragged: string, original: XYPosition) => void;
  undo: () => void;
  redo: () => void;
  layout: () => void;
  importBoard: (input: unknown) => void;
  importWorkspace: (input: unknown) => void;
  snapshots: Snapshot[];
  snapshotError: string;
  createSnapshot: (name: string) => void;
  restoreSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;
  setViewport: (viewport: Viewport) => void;
  setAnnotations: (annotations: AnnotationState) => boolean;
  generate: (id: string, text?: string) => Promise<void>;
  stop: (id: string) => void;
};

export const currentBoard = (s: Pick<State, 'boards' | 'currentId'>) =>
  s.boards.find((b) => b.id === s.currentId)!;
const controllers = new Map<string, AbortController>();
const remapContext = (data: NodeData, remap: Map<string, string>): NodeData => ({
  ...data,
  ...(data.contextInclude
    ? { contextInclude: data.contextInclude.map((id) => remap.get(id) || id) }
    : {}),
  ...(data.contextExclude
    ? { contextExclude: data.contextExclude.map((id) => remap.get(id) || id) }
    : {}),
});
function copyBoard(board: Board): Board {
  const b = structuredClone(board);
  const map = new Map(b.nodes.map((n) => [n.id, uid()]));
  const layers = new Map(b.annotations?.layers.map((l) => [l.id, uid()]));
  return {
    ...b,
    id: uid(),
    updatedAt: Date.now(),
    ...(b.annotations
      ? {
          annotations: {
            layers: b.annotations.layers.map((l) => ({ ...l, id: layers.get(l.id)! })),
            items: b.annotations.items.map((a) => ({
              ...a,
              id: uid(),
              layerId: layers.get(a.layerId)!,
            })),
          },
        }
      : {}),
    nodes: b.nodes.map((n) => ({
      ...n,
      id: map.get(n.id)!,
      parentId: n.parentId ? map.get(n.parentId) : undefined,
      data: remapContext(n.data, map),
    })),
    edges: b.edges.map((e) => ({
      ...e,
      id: uid(),
      source: map.get(e.source)!,
      target: map.get(e.target)!,
    })),
  };
}

const SNAPSHOT_KEY = 'branchboard.snapshots.v1';
let protectSnapshots = false;
function validateSnapshots(input: unknown): Snapshot[] {
  if (!Array.isArray(input) || input.length > 30)
    throw new Error(
      'At most 30 snapshots can be stored. Export a workspace backup, then delete older snapshots to make room.',
    );
  const ids = new Set<string>();
  return input.map((s) => {
    if (
      !s ||
      typeof s.id !== 'string' ||
      ids.has(s.id) ||
      typeof s.name !== 'string' ||
      !s.name.trim() ||
      s.name.length > 120 ||
      !Number.isFinite(s.createdAt) ||
      s.createdAt <= 0
    )
      throw new Error('Invalid snapshot.');
    ids.add(s.id);
    return { id: s.id, name: s.name.trim(), createdAt: s.createdAt, board: validateBoard(s.board) };
  });
}
function loadSnapshots(): { snapshots: Snapshot[]; snapshotError: string } {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return { snapshots: raw ? validateSnapshots(JSON.parse(raw)) : [], snapshotError: '' };
  } catch {
    protectSnapshots = true;
    return {
      snapshots: [],
      snapshotError:
        'Saved snapshots could not be read. They have not been overwritten. Snapshot changes are blocked; export a workspace backup to protect your current canvases.',
    };
  }
}
function writeSnapshots(snapshots: Snapshot[]) {
  if (protectSnapshots)
    throw new Error('Unreadable saved snapshots are protected from overwriting.');
  validateSnapshots(snapshots);
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots));
  } catch {
    throw new Error(
      'Snapshots could not be saved: browser storage is full or unavailable. Export a workspace backup.',
    );
  }
}
export function validateWorkspaceBackup(input: unknown): WorkspaceBackup {
  const value = input as WorkspaceBackup | null;
  if (
    !value ||
    value.version !== 1 ||
    value.kind !== 'workspace' ||
    !Array.isArray(value.boards) ||
    !value.boards.length ||
    value.boards.length > 100
  )
    throw new Error('Invalid workspace backup (maximum 100 canvases).');
  const boards = value.boards.map(validateBoard);
  if (
    new Set(boards.map((b) => b.id)).size !== boards.length ||
    !boards.some((b) => b.id === value.currentId)
  )
    throw new Error('Invalid workspace board IDs or active canvas.');
  return {
    version: 1,
    kind: 'workspace',
    boards,
    currentId: value.currentId,
    snapshots: validateSnapshots(value.snapshots),
    organization: validateOrganization(value.organization, boards, validateBoard),
  };
}
export function workspaceBackup(): WorkspaceBackup {
  const { boards, currentId, snapshots, organization } = useStore.getState();
  return validateWorkspaceBackup({
    version: 1,
    kind: 'workspace',
    boards: boards.map((b) => ({ ...b, name: b.name.trim() || 'Untitled canvas' })),
    currentId,
    snapshots,
    organization,
  });
}
const descendants = (nodes: BoardNode[], ids: Set<string>) => {
  let size = -1;
  while (size !== ids.size) {
    size = ids.size;
    nodes.forEach((n) => {
      if (n.parentId && ids.has(n.parentId)) ids.add(n.id);
    });
  }
  return ids;
};

export const useStore = create<State>((set, get) => {
  const organize = (fn: (o: WorkspaceOrganization) => WorkspaceOrganization) => {
    const organization = fn(get().organization);
    validateOrganization(organization, get().boards, validateBoard);
    set({ organization });
  };
  const checkFolder = (id?: string) => {
    if (id !== undefined && !get().organization.folders.some((f) => f.id === id))
      throw new Error('Folder no longer exists.');
  };
  const mutate = (fn: (b: Board) => Board, boardId = get().currentId) =>
    set((s) => ({
      boards: s.boards.map((b) => (b.id === boardId ? { ...fn(b), updatedAt: Date.now() } : b)),
    }));
  const checkpoint = () => {
    if (Object.values(get().streaming).some(Boolean)) return;
    set((s) => ({ past: [...s.past.slice(-49), structuredClone(currentBoard(s))], future: [] }));
  };
  const changeMessage = (id: string, messageId: string, content?: string) => {
    if (Object.values(get().streaming).some(Boolean)) return false;
    const node = currentBoard(get()).nodes.find((n) => n.id === id && n.type === 'chat');
    const message = node?.data.messages.find((m) => m.id === messageId);
    if (!node || !message) return false;
    if (content !== undefined) {
      if (!content.trim() || content.length > 100_000) return false;
      if (content === message.content) return true;
    }
    checkpoint();
    mutate((b) => ({
      ...b,
      nodes: b.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                error: undefined,
                messages:
                  content === undefined
                    ? n.data.messages.filter((m) => m.id !== messageId)
                    : n.data.messages.map((m) => (m.id === messageId ? { ...m, content } : m)),
              },
            }
          : n,
      ),
    }));
    return true;
  };
  const branch = (id: string, position?: XYPosition, record = true, messageId?: string) => {
    const b = currentBoard(get()),
      parent = b.nodes.find((n) => n.id === id);
    if (!parent) return '';
    const index = parent.data.messages.findIndex((m) => m.id === messageId);
    if (
      messageId !== undefined &&
      (parent.type !== 'chat' || index < 0 || Object.values(get().streaming).some(Boolean))
    )
      return '';
    if (record) checkpoint();
    const origin = absolutePosition(parent, b.nodes);
    const child = makeNode(
      'chat',
      position || {
        x: origin.x + (Number(parent.style?.width) || 340) + 100,
        y: origin.y + b.edges.filter((e) => e.source === id).length * 180,
      },
    );
    child.data.color = parent.data.color;
    if (messageId !== undefined) child.data.title = `Branch · ${parent.data.title}`;
    child.selected = true;
    mutate((b) => ({
      ...b,
      nodes: [...b.nodes.map((n) => ({ ...n, selected: false })), child],
      edges: [
        ...b.edges,
        {
          id: uid(),
          source: id,
          target: child.id,
          ...(messageId !== undefined
            ? {
                data: {
                  historyMessageIds: parent.data.messages.slice(0, index + 1).map((m) => m.id),
                },
              }
            : {}),
        },
      ],
    }));
    return child.id;
  };
  return {
    ...loadWorkspace(),
    ...loadSnapshots(),
    createFolder: (name, parentId) => {
      checkFolder(parentId);
      const id = uid();
      organize((o) => ({
        ...o,
        folders: [
          ...o.folders,
          { id, name: organizationName(name), ...(parentId ? { parentId } : {}) },
        ],
      }));
      return id;
    },
    renameFolder: (id, name) => {
      checkFolder(id);
      const title = organizationName(name);
      organize((o) => ({
        ...o,
        folders: o.folders.map((f) => (f.id === id ? { ...f, name: title } : f)),
      }));
    },
    deleteFolder: (id) => {
      checkFolder(id);
      const o = get().organization;
      const parentId = o.folders.find((f) => f.id === id)!.parentId;
      const ids = folderSubtree(id, o.folders);
      organize((o) => ({
        ...o,
        folders: o.folders.filter((f) => !ids.has(f.id)),
        boardFolders: Object.fromEntries(
          Object.entries(o.boardFolders).flatMap(([boardId, folder]) =>
            !ids.has(folder) ? [[boardId, folder]] : parentId ? [[boardId, parentId]] : [],
          ),
        ),
      }));
    },
    moveBoard: (id, folderId) => {
      checkFolder(folderId);
      if (!get().boards.some((b) => b.id === id)) throw new Error('Canvas no longer exists.');
      organize((o) => ({
        ...o,
        boardFolders: Object.fromEntries([
          ...Object.entries(o.boardFolders).filter(([boardId]) => boardId !== id),
          ...(folderId ? [[id, folderId]] : []),
        ]),
      }));
    },
    toggleFavorite: (id) => {
      if (!get().boards.some((b) => b.id === id)) return;
      organize((o) => ({
        ...o,
        favoriteBoardIds: o.favoriteBoardIds.includes(id)
          ? o.favoriteBoardIds.filter((favorite) => favorite !== id)
          : [...o.favoriteBoardIds, id],
      }));
    },
    saveTemplate: (name, includeMessages = false) => {
      if (Object.values(get().streaming).some(Boolean))
        throw new Error('Stop active generations before saving a template.');
      const title = organizationName(name);
      const board = validateBoard(currentBoard(get()));
      board.name = title;
      if (!includeMessages) {
        board.nodes = board.nodes.map((n) => ({ ...n, data: { ...n.data, messages: [] } }));
        board.edges = board.edges.map(({ data: _data, ...edge }) => edge);
      }
      const id = uid();
      organize((o) => ({
        ...o,
        templates: [...o.templates, { id, name: title, createdAt: Date.now(), board }],
      }));
      return id;
    },
    renameTemplate: (id, name) => {
      const title = organizationName(name);
      organize((o) => ({
        ...o,
        templates: o.templates.map((t) => (t.id === id ? { ...t, name: title } : t)),
      }));
    },
    deleteTemplate: (id) =>
      organize((o) => ({ ...o, templates: o.templates.filter((t) => t.id !== id) })),
    useTemplate: (id, folderId) => {
      checkFolder(folderId);
      if (Object.values(get().streaming).some(Boolean))
        throw new Error('Stop active generations before creating a canvas from a template.');
      const template = get().organization.templates.find((t) => t.id === id);
      if (!template) throw new Error('Template no longer exists.');
      get().importBoard({ ...template.board, name: template.name });
      if (folderId) get().moveBoard(get().currentId, folderId);
      set({ toast: 'New independent canvas created from template.' });
    },
    past: [],
    future: [],
    configured: false,
    model: 'gpt-4o-mini',
    providers: [],
    applyConfig: (config) =>
      set({ configured: config.configured, model: config.model, providers: config.providers }),
    refreshModels: async (id, signal) => {
      const providers = get().providers.filter((p) => p.configured && (!id || p.id === id));
      const results = await Promise.allSettled(
        providers.map(async (provider) => {
          const response = await fetch(`/api/providers/${provider.id}/models`, { signal });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Unable to load models.');
          if (!signal?.aborted)
            set((s) => ({
              providers: s.providers.map((p) =>
                p.id === provider.id && p === provider
                  ? {
                      ...p,
                      models: [
                        ...new Set([
                          ...(result.models as string[]),
                          ...p.extraModels,
                          ...(p.defaultModel ? [p.defaultModel] : []),
                        ]),
                      ],
                    }
                  : p,
              ),
            }));
        }),
      );
      if (id && results[0]?.status === 'rejected') throw results[0].reason;
    },
    settingsOpen: false,
    settingsProvider: 'openai',
    streaming: {},
    toast: '',
    historyTarget: null,
    editMessage: (id, messageId, content) => changeMessage(id, messageId, content),
    deleteMessage: (id, messageId) => changeMessage(id, messageId),
    checkpoint,
    setAnnotations: (input) => {
      if (Object.values(get().streaming).some(Boolean)) return false;
      const annotations = validateAnnotations(input);
      if (JSON.stringify(currentBoard(get()).annotations) === JSON.stringify(annotations))
        return true;
      checkpoint();
      mutate((b) => ({ ...b, annotations }));
      return true;
    },
    newBoard: () => {
      const b = blankBoard();
      protectSavedData = false;
      set((s) => ({
        boards: [...s.boards, b],
        currentId: b.id,
        past: [],
        future: [],
        storageError: '',
        historyTarget: null,
      }));
    },
    switchBoard: (id) => {
      if (get().boards.some((b) => b.id === id))
        set({ currentId: id, past: [], future: [], historyTarget: null });
    },
    renameBoard: (name) => mutate((b) => ({ ...b, name })),
    deleteBoard: () => {
      const id = get().currentId;
      currentBoard(get()).nodes.forEach((n) => controllers.get(n.id)?.abort());
      const boards = get().boards.filter((b) => b.id !== id);
      if (!boards.length) boards.push(blankBoard());
      const o = get().organization;
      set({
        boards,
        currentId: boards[0].id,
        past: [],
        future: [],
        historyTarget: null,
        organization: {
          ...o,
          favoriteBoardIds: o.favoriteBoardIds.filter((favorite) => favorite !== id),
          boardFolders: Object.fromEntries(
            Object.entries(o.boardFolders).filter(([boardId]) => boardId !== id),
          ),
        },
      });
    },
    nodesChange: (changes) =>
      mutate((b) => ({
        ...b,
        nodes: applyNodeChanges(changes, b.nodes).map((node) => {
          const resized = changes.find(
            (c) => c.type === 'dimensions' && c.id === node.id && c.setAttributes,
          );
          if (!resized || resized.type !== 'dimensions' || !resized.dimensions) return node;
          return {
            ...node,
            style: {
              ...node.style,
              ...(resized.setAttributes === true || resized.setAttributes === 'width'
                ? { width: resized.dimensions.width }
                : {}),
              ...(resized.setAttributes === true || resized.setAttributes === 'height'
                ? { height: resized.dimensions.height }
                : {}),
            },
          };
        }),
      })),
    settleNodes: (ids) => mutate((b) => ({ ...b, nodes: resolveNodeCollisions(b.nodes, ids) })),
    sizeToContent: (id, height) => {
      const node = currentBoard(get()).nodes.find((n) => n.id === id);
      if (
        !node ||
        !node.data.autoSize ||
        node.data.collapsed ||
        node.type === 'group' ||
        !Number.isFinite(height)
      )
        return;
      const next = Math.ceil(Math.max(node.type === 'chat' ? 320 : 180, Math.min(900, height)));
      if (Number(node.style?.height) === next) return;
      mutate((b) => ({
        ...b,
        nodes: resolveNodeCollisions(
          b.nodes.map((n) =>
            n.id === id
              ? {
                  ...n,
                  height: next,
                  style: { ...n.style, height: next },
                }
              : n,
          ),
          [id],
        ),
      }));
    },
    edgesChange: (changes) => mutate((b) => ({ ...b, edges: applyEdgeChanges(changes, b.edges) })),
    setViewport: (viewport) => mutate((b) => ({ ...b, viewport })),
    addNode: (type, position) => {
      checkpoint();
      const node = { ...makeNode(type, position), selected: true };
      mutate((b) => ({ ...b, nodes: [...b.nodes.map((n) => ({ ...n, selected: false })), node] }));
      return node.id;
    },
    updateNode: (id, data, record = false) => {
      if (record) checkpoint();
      mutate((b) => ({
        ...b,
        nodes: b.nodes.map((n) => {
          if (n.id !== id) return n;
          const toggled =
            data.collapsed !== undefined &&
            data.collapsed !== Boolean(n.data.collapsed) &&
            n.type !== 'group';
          return {
            ...n,
            ...(toggled
              ? {
                  height: data.collapsed
                    ? 50
                    : n.data.expandedHeight || (n.type === 'chat' ? 380 : 260),
                  style: {
                    ...n.style,
                    height: data.collapsed
                      ? 50
                      : n.data.expandedHeight || (n.type === 'chat' ? 380 : 260),
                  },
                }
              : {}),
            data: {
              ...n.data,
              ...data,
              ...(toggled && data.collapsed
                ? { expandedHeight: Number(n.style?.height) || 300 }
                : {}),
            },
          };
        }),
      }));
    },
    setContextSource: (id, source, mode) => {
      const b = currentBoard(get());
      const node = b.nodes.find((n) => n.id === id && n.type === 'chat');
      if (
        !node ||
        source === id ||
        !b.nodes.some((n) => n.id === source && n.type !== 'group') ||
        get().streaming[id]
      )
        return;
      get().updateNode(
        id,
        {
          contextInclude: [
            ...(node.data.contextInclude || []).filter((key) => key !== source),
            ...(mode === 'include' ? [source] : []),
          ],
          contextExclude: [
            ...(node.data.contextExclude || []).filter((key) => key !== source),
            ...(mode === 'exclude' ? [source] : []),
          ],
        },
        true,
      );
    },
    connect: (source, target) => {
      const b = currentBoard(get());
      if (
        !b.nodes.some((n) => n.id === source) ||
        !b.nodes.some((n) => n.id === target) ||
        !canConnect(source, target, b.edges)
      )
        return;
      checkpoint();
      mutate((b) => ({ ...b, edges: [...b.edges, { id: uid(), source, target }] }));
    },
    duplicate: () => {
      const b = currentBoard(get()),
        ids = descendants(b.nodes, new Set(b.nodes.filter((n) => n.selected).map((n) => n.id)));
      if (!ids.size) return;
      checkpoint();
      const remap = new Map([...ids].map((id) => [id, uid()]));
      const copies = b.nodes
        .filter((n) => ids.has(n.id))
        .map((n) => ({
          ...structuredClone(n),
          id: remap.get(n.id)!,
          selected: true,
          parentId: n.parentId && remap.has(n.parentId) ? remap.get(n.parentId) : n.parentId,
          position:
            n.parentId && remap.has(n.parentId)
              ? n.position
              : { x: n.position.x + 60, y: n.position.y + 60 },
          data: { ...remapContext(structuredClone(n.data), remap), error: undefined },
        }));
      mutate((b) => ({
        ...b,
        nodes: [...b.nodes.map((n) => ({ ...n, selected: false })), ...copies],
        edges: [
          ...b.edges,
          ...b.edges
            .filter((e) => ids.has(e.source) && ids.has(e.target))
            .map((e) => ({
              ...e,
              id: uid(),
              source: remap.get(e.source)!,
              target: remap.get(e.target)!,
            })),
        ],
      }));
    },
    removeSelected: () => {
      const b = currentBoard(get()),
        ids = descendants(b.nodes, new Set(b.nodes.filter((n) => n.selected).map((n) => n.id)));
      if (!ids.size && !b.edges.some((e) => e.selected)) return;
      checkpoint();
      ids.forEach((id) => controllers.get(id)?.abort());
      mutate((b) => ({
        ...b,
        nodes: b.nodes
          .filter((n) => !ids.has(n.id))
          .map((n) => ({
            ...n,
            data: {
              ...n.data,
              ...(n.data.contextInclude
                ? { contextInclude: n.data.contextInclude.filter((id) => !ids.has(id)) }
                : {}),
              ...(n.data.contextExclude
                ? { contextExclude: n.data.contextExclude.filter((id) => !ids.has(id)) }
                : {}),
            },
          })),
        edges: b.edges.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)),
      }));
    },
    group: () => {
      const b = currentBoard(get());
      const selectedIds = new Set(b.nodes.filter((n) => n.selected).map((n) => n.id));
      const chosen = b.nodes.filter((n) => n.selected && !selectedIds.has(n.parentId || ''));
      if (!chosen.length) return;
      checkpoint();
      const positions = chosen.map((n) => absolutePosition(n, b.nodes));
      const x = Math.min(...positions.map((p) => p.x)) - 30,
        y = Math.min(...positions.map((p) => p.y)) - 60;
      const group = makeNode('group', { x, y });
      group.selected = true;
      group.style = {
        width:
          Math.max(...chosen.map((n, i) => positions[i].x + (Number(n.style?.width) || 340))) -
          x +
          30,
        height:
          Math.max(...chosen.map((n, i) => positions[i].y + (Number(n.style?.height) || 300))) -
          y +
          30,
      };
      const ids = new Set(chosen.map((n) => n.id));
      mutate((b) => ({
        ...b,
        nodes: [
          group,
          ...b.nodes.map((n) => ({
            ...n,
            selected: false,
            ...(ids.has(n.id)
              ? {
                  parentId: group.id,
                  position: {
                    x: absolutePosition(n, b.nodes).x - x,
                    y: absolutePosition(n, b.nodes).y - y,
                  },
                }
              : {}),
          })),
        ],
      }));
    },
    ungroup: (id) => {
      const b = currentBoard(get());
      if (!b.nodes.some((n) => n.id === id && n.type === 'group')) return;
      checkpoint();
      mutate((b) => ({
        ...b,
        nodes: b.nodes
          .filter((n) => n.id !== id)
          .map((n) =>
            n.parentId === id
              ? { ...n, parentId: undefined, position: absolutePosition(n, b.nodes) }
              : n,
          ),
        edges: b.edges.filter((e) => e.source !== id && e.target !== id),
      }));
    },
    branch: (id) => branch(id),
    branchFromMessage: (id, messageId) => branch(id, undefined, true, messageId),
    branchOnDrop: (source, dragged, original) => {
      const node = currentBoard(get()).nodes.find((n) => n.id === dragged);
      if (!node) return;
      const position = absolutePosition(node, currentBoard(get()).nodes);
      mutate((b) => ({
        ...b,
        nodes: b.nodes.map((n) => (n.id === dragged ? { ...n, position: original } : n)),
      }));
      branch(source, position, false);
    },
    undo: () => {
      const s = get();
      if (!s.past.length || Object.values(s.streaming).some(Boolean)) return;
      const previous = s.past.at(-1)!;
      set({
        boards: s.boards.map((b) => (b.id === s.currentId ? previous : b)),
        past: s.past.slice(0, -1),
        future: [structuredClone(currentBoard(s)), ...s.future],
      });
    },
    redo: () => {
      const s = get();
      if (!s.future.length || Object.values(s.streaming).some(Boolean)) return;
      set({
        boards: s.boards.map((b) => (b.id === s.currentId ? s.future[0] : b)),
        past: [...s.past, structuredClone(currentBoard(s))],
        future: s.future.slice(1),
      });
    },
    layout: () => {
      checkpoint();
      mutate((b) => ({ ...b, nodes: layoutNodes(b.nodes, b.edges) }));
    },
    importBoard: (input) => {
      const copy = copyBoard(validateBoard(input));
      protectSavedData = false;
      set((s) => ({
        boards: [...s.boards, copy],
        currentId: copy.id,
        past: [],
        future: [],
        toast: 'Board imported.',
        storageError: '',
        historyTarget: null,
      }));
    },
    importWorkspace: (input) => {
      const backup = validateWorkspaceBackup(input);
      const boards = backup.boards.map(copyBoard);
      const source = backup.organization;
      const folderIds = new Map(source.folders.map((f) => [f.id, uid()]));
      const boardIds = new Map(backup.boards.map((b, i) => [b.id, boards[i].id]));
      const existing = get().organization;
      const organization: WorkspaceOrganization = {
        folders: [
          ...existing.folders,
          ...source.folders.map((f) => ({
            ...f,
            id: folderIds.get(f.id)!,
            parentId: f.parentId ? folderIds.get(f.parentId) : undefined,
          })),
        ],
        boardFolders: {
          ...existing.boardFolders,
          ...Object.fromEntries(
            Object.entries(source.boardFolders).map(([id, folder]) => [
              boardIds.get(id)!,
              folderIds.get(folder)!,
            ]),
          ),
        },
        favoriteBoardIds: [
          ...existing.favoriteBoardIds,
          ...source.favoriteBoardIds.map((id) => boardIds.get(id)!),
        ],
        templates: [
          ...existing.templates,
          ...source.templates.map((t) => ({ ...t, id: uid(), board: copyBoard(t.board) })),
        ],
      };
      validateOrganization(organization, [...get().boards, ...boards], validateBoard);
      const snapshots = backup.snapshots.map((snapshot) => ({
        ...snapshot,
        id: uid(),
        board: copyBoard(snapshot.board),
      }));
      if (snapshots.length) writeSnapshots([...get().snapshots, ...snapshots]);
      protectSavedData = false;
      set((s) => ({
        boards: [...s.boards, ...boards],
        currentId: boards[backup.boards.findIndex((b) => b.id === backup.currentId)].id,
        snapshots: [...s.snapshots, ...snapshots],
        organization,
        past: [],
        future: [],
        historyTarget: null,
        storageError: '',
        toast: `${boards.length} canvases imported. Existing work was kept.`,
      }));
    },
    createSnapshot: (name) => {
      if (Object.values(get().streaming).some(Boolean))
        throw new Error('Stop active generations before taking a snapshot.');
      if (!name.trim() || name.length > 120)
        throw new Error('Enter a snapshot name (1–120 characters).');
      const snapshot: Snapshot = {
        id: uid(),
        name: name.trim(),
        createdAt: Date.now(),
        board: validateBoard(currentBoard(get())),
      };
      const snapshots = [...get().snapshots, snapshot];
      writeSnapshots(snapshots);
      set({ snapshots, snapshotError: '', toast: 'Snapshot saved on this device.' });
    },
    restoreSnapshot: (id) => {
      const snapshot = get().snapshots.find((s) => s.id === id);
      if (!snapshot) throw new Error('Snapshot no longer exists.');
      get().importBoard({ ...snapshot.board, name: `${snapshot.board.name} (restored)` });
      set({ toast: 'Snapshot restored as a new canvas. Existing work was kept.' });
    },
    deleteSnapshot: (id) => {
      const snapshots = get().snapshots.filter((s) => s.id !== id);
      writeSnapshots(snapshots);
      set({ snapshots, snapshotError: '' });
    },
    stop: (id) => controllers.get(id)?.abort(),
    generate: async (id, text) => {
      if (get().streaming[id]) return;
      const board = currentBoard(get()),
        node = board.nodes.find((n) => n.id === id);
      if (!node || node.type !== 'chat') return;
      const provider = node.data.provider || 'openai';
      const model = node.data.model || get().model;
      if (!get().providers.find((p) => p.id === provider)?.configured) {
        set({ settingsOpen: true, settingsProvider: provider });
        return;
      }
      let messages = [...node.data.messages];
      if (text !== undefined) {
        if (!text.trim()) return;
        messages.push({ id: uid(), role: 'user', content: text.trim() });
      } else {
        if (messages.at(-1)?.role === 'assistant') messages.pop();
        if (!messages.length) return;
      }
      const requestMessages = contextFor(
        id,
        board.nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                data: { ...n.data, messages },
              }
            : n,
        ),
        board.edges,
      ).map(({ role, content }) => ({ role, content }));
      const estimatedTokens = estimateTokens(requestMessages);
      if (node.data.contextTokenLimit && estimatedTokens > node.data.contextTokenLimit) {
        mutate((b) => ({
          ...b,
          nodes: b.nodes.map((n) =>
            n.id === id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    error: `Estimated input (${estimatedTokens.toLocaleString()} tokens) exceeds the context budget (${node.data.contextTokenLimit!.toLocaleString()}). Adjust context or raise the budget. Nothing was sent.`,
                  },
                }
              : n,
          ),
        }));
        return;
      }
      checkpoint();
      const assistantId = uid(),
        controller = new AbortController();
      controllers.set(id, controller);
      const update = (fn: (data: NodeData) => NodeData) =>
        mutate(
          (b) => ({
            ...b,
            nodes: b.nodes.map((n) => (n.id === id ? { ...n, data: fn(n.data) } : n)),
          }),
          board.id,
        );
      update((data) => ({ ...data, error: undefined, messages }));
      update((data) => ({
        ...data,
        messages: [...messages, { id: assistantId, role: 'assistant', content: '' }],
      }));
      set((s) => ({ streaming: { ...s.streaming, [id]: true } }));
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, model, messages: requestMessages }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${response.status}).`);
        }
        if (!response.body) throw new Error('No response stream received.');
        let done = false;
        for await (const raw of sseData(response.body)) {
          const event = JSON.parse(raw);
          if (event.error) throw new Error(event.error);
          if (typeof event.token === 'string')
            update((data) => ({
              ...data,
              messages: data.messages.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + event.token } : m,
              ),
            }));
          if (event.done) {
            done = true;
            break;
          }
        }
        if (!done && !controller.signal.aborted)
          throw new Error('Response interrupted. Retry to generate again.');
      } catch (error) {
        if (!controller.signal.aborted)
          update((data) => ({
            ...data,
            error: error instanceof Error ? error.message : 'Unable to contact AI provider.',
          }));
      } finally {
        controllers.delete(id);
        set((s) => ({ streaming: { ...s.streaming, [id]: false } }));
      }
    },
  };
});

export function saveWorkspace() {
  if (protectSavedData) return;
  try {
    const { boards, currentId, organization } = useStore.getState();
    localStorage.setItem(
      'branchboard.workspace.v1',
      JSON.stringify({
        boards: boards.map((b) => ({ ...b, name: b.name.trim() || 'Untitled canvas' })),
        currentId,
        organization,
      }),
    );
    if (useStore.getState().storageError) useStore.setState({ storageError: '' });
  } catch {
    useStore.setState({
      storageError:
        'Browser storage is full or unavailable. Export a JSON backup to keep your work safe.',
    });
  }
}
let timer: ReturnType<typeof setTimeout>;
useStore.subscribe((s, previous) => {
  if (
    s.boards !== previous.boards ||
    s.currentId !== previous.currentId ||
    s.organization !== previous.organization
  ) {
    clearTimeout(timer);
    timer = setTimeout(saveWorkspace, 350);
  }
});
if (typeof window !== 'undefined') window.addEventListener('pagehide', saveWorkspace);
