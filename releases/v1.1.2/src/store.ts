import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
  type Viewport,
} from '@xyflow/react';
import { absolutePosition, canConnect, contextFor, layoutNodes } from './graph';
import { sseData } from '../server/stream';
import type { Board, BoardNode, NodeData } from './types';
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
        expandedHeight:
          finite(n.data.expandedHeight) && n.data.expandedHeight >= 100
            ? n.data.expandedHeight
            : undefined,
        ...(ports ? { portPositions: structuredClone(ports) } : {}),
      },
    };
  });
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
    edges.push({ id: e.id, source: e.source, target: e.target });
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
  };
}

let protectSavedData = false;
function loadWorkspace(): { boards: Board[]; currentId: string; storageError: string } {
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
  note.data.title = 'Connect a thought';
  note.data.note =
    'Start a conversation, connect a thought, or make room for a different perspective.\n\nDrag the dots to share context between nodes.';
  board.nodes = [chat, note];
  return {
    boards: [board],
    currentId: board.id,
    storageError: protectSavedData
      ? 'Saved data could not be read. It has not been overwritten. Export your work before starting a new canvas.'
      : '',
  };
}

type State = {
  boards: Board[];
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
  checkpoint: () => void;
  newBoard: () => void;
  switchBoard: (id: string) => void;
  renameBoard: (name: string) => void;
  deleteBoard: () => void;
  nodesChange: (changes: NodeChange<BoardNode>[]) => void;
  edgesChange: (changes: EdgeChange[]) => void;
  addNode: (type: BoardNode['type'], position: XYPosition) => string;
  updateNode: (id: string, data: Partial<NodeData>, checkpoint?: boolean) => void;
  connect: (source: string, target: string) => void;
  duplicate: () => void;
  removeSelected: () => void;
  group: () => void;
  ungroup: (id: string) => void;
  branch: (id: string) => string;
  branchOnDrop: (source: string, dragged: string, original: XYPosition) => void;
  undo: () => void;
  redo: () => void;
  layout: () => void;
  importBoard: (input: unknown) => void;
  setViewport: (viewport: Viewport) => void;
  generate: (id: string, text?: string) => Promise<void>;
  stop: (id: string) => void;
};

export const currentBoard = (s: Pick<State, 'boards' | 'currentId'>) =>
  s.boards.find((b) => b.id === s.currentId)!;
const controllers = new Map<string, AbortController>();
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
  const mutate = (fn: (b: Board) => Board, boardId = get().currentId) =>
    set((s) => ({
      boards: s.boards.map((b) => (b.id === boardId ? { ...fn(b), updatedAt: Date.now() } : b)),
    }));
  const checkpoint = () => {
    if (Object.values(get().streaming).some(Boolean)) return;
    set((s) => ({ past: [...s.past.slice(-49), structuredClone(currentBoard(s))], future: [] }));
  };
  const branch = (id: string, position?: XYPosition, record = true) => {
    const b = currentBoard(get()),
      parent = b.nodes.find((n) => n.id === id);
    if (!parent) return '';
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
    child.selected = true;
    mutate((b) => ({
      ...b,
      nodes: [...b.nodes.map((n) => ({ ...n, selected: false })), child],
      edges: [...b.edges, { id: uid(), source: id, target: child.id }],
    }));
    return child.id;
  };
  return {
    ...loadWorkspace(),
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
    checkpoint,
    newBoard: () => {
      const b = blankBoard();
      protectSavedData = false;
      set((s) => ({
        boards: [...s.boards, b],
        currentId: b.id,
        past: [],
        future: [],
        storageError: '',
      }));
    },
    switchBoard: (id) => {
      if (get().boards.some((b) => b.id === id)) set({ currentId: id, past: [], future: [] });
    },
    renameBoard: (name) => mutate((b) => ({ ...b, name })),
    deleteBoard: () => {
      const id = get().currentId;
      currentBoard(get()).nodes.forEach((n) => controllers.get(n.id)?.abort());
      const boards = get().boards.filter((b) => b.id !== id);
      if (!boards.length) boards.push(blankBoard());
      set({ boards, currentId: boards[0].id, past: [], future: [] });
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
          data: { ...structuredClone(n.data), error: undefined },
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
        nodes: b.nodes.filter((n) => !ids.has(n.id)),
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
      const b = validateBoard(input),
        map = new Map(b.nodes.map((n) => [n.id, uid()]));
      const copy = {
        ...b,
        id: uid(),
        nodes: b.nodes.map((n) => ({
          ...n,
          id: map.get(n.id)!,
          parentId: n.parentId ? map.get(n.parentId) : undefined,
        })),
        edges: b.edges.map((e) => ({
          ...e,
          id: uid(),
          source: map.get(e.source)!,
          target: map.get(e.target)!,
        })),
      };
      protectSavedData = false;
      set((s) => ({
        boards: [...s.boards, copy],
        currentId: copy.id,
        past: [],
        future: [],
        toast: 'Board imported.',
        storageError: '',
      }));
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
      const requestMessages = contextFor(
        id,
        get().boards.find((b) => b.id === board.id)!.nodes,
        board.edges,
      ).map(({ role, content }) => ({ role, content }));
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
    const { boards, currentId } = useStore.getState();
    localStorage.setItem(
      'branchboard.workspace.v1',
      JSON.stringify({
        boards: boards.map((b) => ({ ...b, name: b.name.trim() || 'Untitled canvas' })),
        currentId,
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
  if (s.boards !== previous.boards || s.currentId !== previous.currentId) {
    clearTimeout(timer);
    timer = setTimeout(saveWorkspace, 350);
  }
});
if (typeof window !== 'undefined') window.addEventListener('pagehide', saveWorkspace);
