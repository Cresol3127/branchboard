import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { composerTarget, draftKey } from '../src/composer';
import { absolutePosition, contextFor, estimateTokens } from '../src/graph';
import { providerDefinitions, providerIds } from '../src/providers';
import type { Board } from '../src/types';

let store: typeof import('../src/store');
const memory = new Map<string, string>();
beforeAll(async () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) || null,
    setItem: (key: string, value: string) => memory.set(key, value),
  });
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  store = await import('../src/store');
});
beforeEach(() => {
  store.useStore.getState().newBoard();
  store.useStore.setState({
    configured: true,
    streaming: {},
    composerDrafts: {},
    settingsOpen: false,
    snapshots: [],
    snapshotError: '',
    storageError: '',
    providers: providerIds.map((id) => ({
      id,
      name: providerDefinitions[id].name,
      configured: id === 'openai' || id === 'ollama',
      hasKey: id === 'openai',
      baseURL: providerDefinitions[id].baseURL,
      models: providerDefinitions[id].models,
      extraModels: [],
      defaultModel: providerDefinitions[id].models[0] || '',
    })),
  });
});
const selected = () =>
  store.currentBoard(store.useStore.getState()).nodes.filter((n) => n.selected);
const board = () => store.currentBoard(store.useStore.getState());
describe('canvas clipboard and drag persistence', () => {
  it('copies an induced graph across canvases, remaps references, and pastes in one undo step', () => {
    const s = store.useStore.getState();
    const a = s.addNode('note', { x: 0, y: 0 });
    const b = s.addNode('chat', { x: 500, y: 0 });
    s.connect(a, b);
    s.updateNode(b, {
      contextInclude: [a],
      messages: [{ id: 'turn', role: 'user', content: 'Preserved turn' }],
    });
    s.nodesChange([{ type: 'select', id: a, selected: true }]);
    const past = store.useStore.getState().past.length;
    s.copySelection();
    expect(store.useStore.getState().past).toHaveLength(past);
    s.newBoard();
    s.pasteSelection({ x: 100, y: 120 });
    expect(board().nodes).toHaveLength(2);
    expect(board().nodes.every((n) => n.selected && n.id !== a && n.id !== b)).toBe(true);
    const note = board().nodes.find((n) => n.type === 'note')!;
    const chat = board().nodes.find((n) => n.type === 'chat')!;
    expect(note.position).toEqual({ x: 100, y: 120 });
    expect(chat.data.contextInclude).toEqual([note.id]);
    expect(chat.data.messages[0].content).toBe('Preserved turn');
    expect(board().edges[0]).toMatchObject({ source: note.id, target: chat.id });
    expect(store.useStore.getState().past).toHaveLength(1);
    s.undo();
    expect(board().nodes).toHaveLength(0);
    s.redo();
    expect(board().nodes).toHaveLength(2);
    expect(JSON.stringify(store.workspaceBackup())).not.toContain('nodeClipboard');
  });
  it('copies group descendants and detaches a copied child from an external parent', () => {
    const s = store.useStore.getState();
    const id = s.addNode('note', { x: 150, y: 200 });
    s.group();
    const group = board().nodes.find((n) => n.type === 'group')!;
    s.copySelection();
    s.newBoard();
    s.pasteSelection();
    const copiedGroup = board().nodes.find((n) => n.type === 'group')!;
    const child = board().nodes.find((n) => n.type === 'note')!;
    expect(copiedGroup.id).not.toBe(group.id);
    expect(child.parentId).toBe(copiedGroup.id);
    const world = absolutePosition(child, board().nodes);
    s.nodesChange(
      board().nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === child.id })),
    );
    s.copySelection();
    expect(store.useStore.getState().nodeClipboard?.nodes[0]).toMatchObject({
      parentId: undefined,
      position: world,
    });
    expect(child.id).not.toBe(id);
  });
  it('defers debounced autosave until a drag finishes and strips legacy header-only drag handles', async () => {
    vi.useFakeTimers();
    try {
      const s = store.useStore.getState();
      const id = s.addNode('note', { x: 0, y: 0 });
      store.saveWorkspace();
      const saved = memory.get('branchboard.workspace.v1');
      s.nodesChange([{ type: 'position', id, position: { x: 120, y: 140 }, dragging: true }]);
      await vi.advanceTimersByTimeAsync(600);
      expect(memory.get('branchboard.workspace.v1')).toBe(saved);
      s.nodesChange([{ type: 'position', id, position: { x: 120, y: 140 }, dragging: false }]);
      await vi.advanceTimersByTimeAsync(351);
      expect(memory.get('branchboard.workspace.v1')).not.toBe(saved);
      const migrated = store.validateBoard({
        ...board(),
        nodes: board().nodes.map((n) => ({ ...n, dragHandle: '.node-heading' })),
      });
      expect(migrated.nodes[0].dragHandle).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
describe('annotation persistence and history', () => {
  const ink = () => ({
    layers: [{ id: 'ink', name: 'Ink', visible: true, locked: false }],
    items: [
      {
        id: 'stroke',
        layerId: 'ink',
        kind: 'pen' as const,
        color: '#8064c3',
        width: 3,
        points: [
          { x: 10, y: 20 },
          { x: 90, y: 80 },
        ],
      },
    ],
  });
  it('commits each gesture/layer change once, undoes, redoes and preserves annotations through validation', () => {
    const s = store.useStore.getState();
    expect(s.setAnnotations(ink())).toBe(true);
    expect(store.useStore.getState().past).toHaveLength(1);
    expect(s.setAnnotations(ink())).toBe(true);
    expect(store.useStore.getState().past).toHaveLength(1);
    expect(store.validateBoard(board()).annotations).toEqual(ink());
    s.undo();
    expect(board().annotations).toBeUndefined();
    s.redo();
    expect(board().annotations).toEqual(ink());
    s.setAnnotations({ ...ink(), layers: [{ ...ink().layers[0], locked: true, visible: false }] });
    s.undo();
    expect(board().annotations?.layers[0].visible).toBe(true);
    expect(() => s.setAnnotations({ ...ink(), layers: [] })).toThrow();
    expect(board().annotations).toEqual(ink());
    store.useStore.setState({ streaming: { active: true } });
    expect(s.setAnnotations({ layers: [], items: [] })).toBe(false);
    expect(board().annotations).toEqual(ink());
  });
  it('remaps marks and layers through board/workspace imports and snapshot restoration', () => {
    const s = store.useStore.getState();
    s.setAnnotations(ink());
    const original = structuredClone(board());
    s.importBoard(original);
    expect(board().annotations?.layers[0].id).not.toBe('ink');
    expect(board().annotations?.items[0].id).not.toBe('stroke');
    expect(board().annotations?.items[0].layerId).toBe(board().annotations?.layers[0].id);
    s.createSnapshot('Drawing');
    const snapshot = store.useStore.getState().snapshots[0];
    const backup = store.workspaceBackup();
    s.setAnnotations({ layers: [], items: [] });
    s.restoreSnapshot(snapshot.id);
    expect(board().annotations?.items).toHaveLength(1);
    s.importWorkspace(backup);
    expect(board().annotations?.items).toHaveLength(1);
    expect(board().annotations?.items[0].layerId).toBe(board().annotations?.layers[0].id);
    expect(board().annotations?.items[0].id).not.toBe(original.annotations?.items[0].id);
  });
});
function select(...ids: string[]) {
  store.useStore
    .getState()
    .nodesChange(
      board().nodes.map((n) => ({ id: n.id, type: 'select', selected: ids.includes(n.id) })),
    );
}

describe('unified message bar routing and drafts', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('data: {"token":"Test reply"}\n\ndata: {"done":true}\n\n'),
    );
  });
  afterEach(() => vi.restoreAllMocks());
  const settled = () =>
    vi.waitFor(() => {
      expect(Object.values(store.useStore.getState().streaming).some(Boolean)).toBe(false);
    });
  it('routes only an unambiguous chat and keeps board/node drafts out of history and backups', () => {
    const s = store.useStore.getState();
    const boardId = board().id;
    const chat = s.addNode('chat', { x: 0, y: 0 });
    const note = s.addNode('note', { x: 400, y: 0 });
    expect(composerTarget(board()).kind).toBe('new');
    select(chat, note);
    expect(composerTarget(board()).kind).toBe('choose');
    select(chat);
    expect(composerTarget(board())).toMatchObject({ kind: 'chat', node: { id: chat } });
    const history = store.useStore.getState().past.length;
    s.setComposerDraft(boardId, chat, 'Chat draft');
    s.setComposerDraft(boardId, null, 'New draft');
    select(note);
    s.newBoard();
    s.setComposerDraft(board().id, null, 'Another canvas');
    s.switchBoard(boardId);
    expect(store.useStore.getState().composerDrafts[draftKey(boardId, chat)]).toBe('Chat draft');
    expect(store.useStore.getState().composerDrafts[draftKey(boardId, null)]).toBe('New draft');
    // Drafts neither mutate the saved graph nor become template/backup history.
    expect(history).toBe(2);
    expect(JSON.stringify(store.workspaceBackup())).not.toContain('Chat draft');
    store.saveWorkspace();
    expect(memory.get('branchboard.workspace.v1')).not.toContain('New draft');
  });
  it('creates a fresh chat and sends in one undo step, consuming only its new-chat draft', async () => {
    const s = store.useStore.getState();
    const boardId = board().id;
    s.setComposerDraft(boardId, null, 'First question');
    s.setComposerDraft(boardId, 'other', 'Keep me');
    const id = s.sendComposerMessage(boardId, null, 'First question', { x: 40, y: 80 });
    expect(id).toBeTruthy();
    expect(board().nodes).toHaveLength(1);
    expect(board().nodes[0]).toMatchObject({ id, position: { x: 40, y: 80 }, selected: true });
    expect(board().edges).toHaveLength(0);
    expect(store.useStore.getState().past).toHaveLength(1);
    expect(store.useStore.getState().composerDrafts[draftKey(boardId, null)]).toBeUndefined();
    expect(store.useStore.getState().composerDrafts[draftKey(boardId, 'other')]).toBe('Keep me');
    await settled();
    expect(board().nodes[0].data.messages.map((m) => m.content)).toEqual([
      'First question',
      'Test reply',
    ]);
    s.undo();
    expect(board().nodes).toHaveLength(0);
    s.redo();
    expect(board().nodes[0].data.messages).toHaveLength(2);
  });
  it('continues the selected branch using inherited context and its own provider/model', async () => {
    const s = store.useStore.getState();
    const parent = s.addNode('note', { x: 0, y: 0 });
    s.updateNode(parent, { note: 'Use these constraints' });
    const child = s.branch(parent);
    s.updateNode(child, { provider: 'ollama', model: 'local-model' });
    const history = store.useStore.getState().past.length;
    expect(s.sendComposerMessage(board().id, child, 'Continue', { x: 0, y: 0 })).toBe(child);
    await settled();
    expect(store.useStore.getState().past).toHaveLength(history + 1);
    const payload = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(payload).toMatchObject({ provider: 'ollama', model: 'local-model' });
    expect(payload.messages.map((m: { content: string }) => m.content)).toEqual([
      'Context note — Untitled note:\nUse these constraints',
      'Continue',
    ]);
    await s.generate(child);
    expect(
      board()
        .nodes.find((n) => n.id === child)!
        .data.messages.filter((m) => m.role === 'user'),
    ).toHaveLength(1);
  });
  it('rejects ambiguous, stale, missing, blank and oversized destinations without creating nodes or requests', () => {
    const s = store.useStore.getState();
    const chat = s.addNode('chat', { x: 0, y: 0 });
    const note = s.addNode('note', { x: 400, y: 0 });
    const submit = (boardId = board().id, nodeId: string | null = chat, text = 'Keep draft') =>
      s.sendComposerMessage(boardId, nodeId, text, { x: 0, y: 0 });
    select(chat, note);
    expect(submit()).toBeNull();
    expect(submit(board().id, null)).toBeNull();
    select(note);
    expect(submit()).toBeNull();
    select(chat);
    expect(submit('previous-board')).toBeNull();
    expect(submit(board().id, 'deleted-node')).toBeNull();
    expect(submit(board().id, chat, '  ')).toBeNull();
    expect(submit(board().id, chat, 'x'.repeat(100_001))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(board().nodes).toHaveLength(2);
    expect(board().nodes[0].data.messages).toHaveLength(0);
  });
  it('keeps drafts when setup or budget blocks sending and never creates an unconfigured new chat', () => {
    const s = store.useStore.getState();
    const boardId = board().id;
    s.setComposerDraft(boardId, null, 'Keep new draft');
    store.useStore.setState({ providers: [] });
    expect(s.sendComposerMessage(boardId, null, 'Keep new draft', { x: 0, y: 0 })).toBeNull();
    expect(board().nodes).toHaveLength(0);
    expect(store.useStore.getState()).toMatchObject({
      settingsOpen: true,
      settingsProvider: 'openai',
    });
    expect(store.useStore.getState().composerDrafts[draftKey(boardId, null)]).toBe(
      'Keep new draft',
    );
    store.useStore.setState({
      providers: [{ id: 'openai', configured: true } as (typeof s.providers)[number]],
    });
    const chat = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(chat, { contextTokenLimit: 1 });
    s.setComposerDraft(boardId, chat, 'Keep chat draft');
    expect(s.sendComposerMessage(boardId, chat, 'Keep chat draft', { x: 0, y: 0 })).toBeNull();
    expect(board().nodes[0].data.error).toContain('Nothing was sent');
    expect(store.useStore.getState().composerDrafts[draftKey(boardId, chat)]).toBe(
      'Keep chat draft',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not double-send to a streaming target and binds concurrent sends to their originating canvases', async () => {
    const s = store.useStore.getState();
    const first = s.addNode('chat', { x: 0, y: 0 });
    const firstBoard = board().id;
    expect(s.sendComposerMessage(firstBoard, first, 'First', { x: 0, y: 0 })).toBe(first);
    s.setComposerDraft(firstBoard, first, 'Next');
    expect(s.sendComposerMessage(firstBoard, first, 'Next', { x: 0, y: 0 })).toBeNull();
    s.newBoard();
    const second = s.sendComposerMessage(board().id, null, 'Second', { x: 0, y: 0 });
    await settled();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(board().nodes[0].id).toBe(second);
    expect(board().nodes[0].data.messages[0].content).toBe('Second');
    s.switchBoard(firstBoard);
    expect(board().nodes[0].data.messages.map((m) => m.content)).toEqual(['First', 'Test reply']);
    expect(store.useStore.getState().composerDrafts[draftKey(firstBoard, first)]).toBe('Next');
  });
});

describe('node operations and undo', () => {
  it('sizes only opted-in expanded content, clamps it, settles collisions and keeps one undo step', () => {
    const s = store.useStore.getState();
    const id = s.addNode('note', { x: 0, y: 0 });
    const neighbor = s.addNode('note', { x: 0, y: 300 });
    s.sizeToContent(id, 600);
    expect(board().nodes[0].style?.height).toBe(260);
    s.updateNode(id, { autoSize: true }, true);
    s.sizeToContent(id, 600);
    expect(board().nodes[0].style?.height).toBe(600);
    expect(board().nodes[0].position).not.toEqual({ x: 0, y: 0 });
    expect(board().nodes.find((n) => n.id === neighbor)?.position).toEqual({ x: 0, y: 300 });
    s.sizeToContent(id, Infinity);
    expect(board().nodes[0].style?.height).toBe(600);
    s.sizeToContent(id, 2000);
    expect(board().nodes[0].style?.height).toBe(900);
    const copy = store.validateBoard(JSON.parse(JSON.stringify(board())));
    expect(copy.nodes[0].data.autoSize).toBe(true);
    s.undo();
    expect(board().nodes[0].data.autoSize).toBeUndefined();
    expect(board().nodes[0].style?.height).toBe(260);
    expect(board().nodes[0].position).toEqual({ x: 0, y: 0 });
    s.redo();
    s.updateNode(id, { collapsed: true }, true);
    s.sizeToContent(id, 400);
    expect(board().nodes[0].style?.height).toBe(50);
    expect(() =>
      store.validateBoard({
        ...copy,
        nodes: [{ ...copy.nodes[0], data: { ...copy.nodes[0].data, autoSize: 'yes' } }],
      }),
    ).toThrow('sizing');
  });
  it('settles a completed gesture without adding a second history entry', () => {
    const s = store.useStore.getState();
    const a = s.addNode('note', { x: 0, y: 0 });
    const b = s.addNode('note', { x: 500, y: 0 });
    s.checkpoint();
    s.nodesChange([{ id: b, type: 'position', position: { x: 320, y: 0 } }]);
    s.settleNodes([b]);
    expect(board().nodes[1].position.x).toBe(364);
    s.undo();
    expect(board().nodes[1].position.x).toBe(500);
    expect(board().nodes[0].id).toBe(a);
    s.redo();
    expect(board().nodes[1].position.x).toBe(364);
  });
  it('collapses to its heading and restores the custom node size', () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.nodesChange([
      { id, type: 'dimensions', dimensions: { width: 450, height: 520 }, setAttributes: true },
    ]);
    s.updateNode(id, { collapsed: true }, true);
    expect(board().nodes[0].style?.height).toBe(50);
    const restored = store.validateBoard(JSON.parse(JSON.stringify(board())));
    expect(restored.nodes[0].data.expandedHeight).toBe(520);
    s.updateNode(id, { collapsed: false }, true);
    expect(board().nodes[0].style?.height).toBe(520);
    s.undo();
    expect(board().nodes[0].data.collapsed).toBe(true);
    expect(board().nodes[0].style?.height).toBe(50);
  });
  it('creates a fresh drop branch and restores the dragged node in one undo step', () => {
    const s = store.useStore.getState();
    const source = s.addNode('chat', { x: 0, y: 0 });
    const dragged = s.addNode('note', { x: 700, y: 0 });
    s.checkpoint();
    s.nodesChange([{ id: dragged, type: 'position', position: { x: 400, y: 100 } }]);
    s.branchOnDrop(source, dragged, { x: 700, y: 0 });
    expect(board().nodes.find((n) => n.id === dragged)?.position).toEqual({ x: 700, y: 0 });
    const child = board().nodes.at(-1)!;
    expect(child.position).toEqual({ x: 400, y: 100 });
    expect(child.data.messages).toEqual([]);
    expect(board().edges).toEqual([expect.objectContaining({ source, target: child.id })]);
    s.undo();
    expect(board().nodes).toHaveLength(2);
    expect(board().edges).toHaveLength(0);
    s.redo();
    expect(board().nodes).toHaveLength(3);
  });
  it('creates, connects, rejects cycles, and restores undo/redo', () => {
    const s = store.useStore.getState();
    const a = s.addNode('chat', { x: 0, y: 0 }),
      b = s.addNode('chat', { x: 500, y: 0 });
    s.connect(a, b);
    s.connect(b, a);
    expect(board().edges).toHaveLength(1);
    s.undo();
    expect(board().edges).toHaveLength(0);
    s.redo();
    expect(board().edges).toHaveLength(1);
  });
  it('duplicates a group with its internal edges and remapped child IDs', () => {
    const s = store.useStore.getState();
    const a = s.addNode('chat', { x: 0, y: 0 }),
      b = s.addNode('note', { x: 500, y: 0 });
    s.connect(a, b);
    select(a, b);
    s.group();
    const original = board().nodes.find((n) => n.type === 'group')!;
    expect(board().nodes.find((n) => n.id === a)?.parentId).toBe(original.id);
    s.duplicate();
    const copy = selected().find((n) => n.type === 'group')!;
    const children = selected().filter((n) => n.parentId === copy.id);
    expect(children).toHaveLength(2);
    expect(board().edges).toHaveLength(2);
    expect(board().edges[1].source).not.toBe(a);
    expect(board().edges[1].target).not.toBe(b);
    s.removeSelected();
    expect(board().nodes).toHaveLength(3);
    expect(board().edges).toHaveLength(1);
    s.undo();
    expect(board().nodes).toHaveLength(6);
  });
  it('ungroups without moving children on the canvas', () => {
    const s = store.useStore.getState();
    const id = s.addNode('note', { x: 120, y: 260 });
    select(id);
    s.group();
    const group = board().nodes.find((n) => n.type === 'group')!;
    expect(
      absolutePosition(
        board().nodes.find((n) => n.id === id)!,
        board().nodes,
      ),
    ).toEqual({ x: 120, y: 260 });
    s.ungroup(group.id);
    expect(board().nodes[0].position).toEqual({ x: 120, y: 260 });
    expect(board().nodes[0].parentId).toBeUndefined();
  });
  it('branches with inherited history and undoes the branch in one step', () => {
    const s = store.useStore.getState();
    const parent = s.addNode('chat', { x: 0, y: 0 });
    const child = s.branch(parent);
    expect(board().edges[0]).toMatchObject({ source: parent, target: child });
    s.undo();
    expect(board().nodes).toHaveLength(1);
    expect(board().edges).toHaveLength(0);
  });
});
describe('persistence and imports', () => {
  it('takes durable independent snapshots, restores copies after deletion, and never drops existing work', () => {
    const s = store.useStore.getState();
    const id = s.addNode('note', { x: 0, y: 0 });
    s.updateNode(id, { note: 'Keep this version' });
    s.createSnapshot('Before changes');
    const snapshot = store.useStore.getState().snapshots[0];
    expect(JSON.parse(memory.get('branchboard.snapshots.v1')!)[0].name).toBe('Before changes');
    s.updateNode(id, { note: 'Changed' });
    expect(snapshot.board.nodes[0].data.note).toBe('Keep this version');
    const originalId = board().id;
    s.deleteBoard();
    s.restoreSnapshot(snapshot.id);
    expect(board().id).not.toBe(originalId);
    expect(board().nodes[0].id).not.toBe(id);
    expect(board().nodes[0].data.note).toBe('Keep this version');
    s.deleteSnapshot(snapshot.id);
    expect(store.useStore.getState().snapshots).toEqual([]);
    expect(JSON.parse(memory.get('branchboard.snapshots.v1')!)).toEqual([]);
  });
  it('reports quota failures atomically and blocks inconsistent or oversized snapshot sets', () => {
    const s = store.useStore.getState();
    store.useStore.setState({ streaming: { other: true } });
    expect(() => s.createSnapshot('Busy')).toThrow('Stop active');
    store.useStore.setState({ streaming: {} });
    expect(() => s.createSnapshot(' ')).toThrow('name');
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => s.createSnapshot('Failure')).toThrow('storage is full');
    expect(store.useStore.getState().snapshots).toEqual([]);
    spy.mockRestore();
    for (let i = 0; i < 30; i++) s.createSnapshot(`Version ${i}`);
    expect(() => s.createSnapshot('Overflow')).toThrow('30 snapshots');
    expect(store.useStore.getState().snapshots).toHaveLength(30);
  });
  it('round trips all canvases, active selection, historical edges, groups and snapshots with fresh IDs', () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, { messages: [{ id: 'turn', role: 'user', content: 'Question' }] });
    s.branchFromMessage(id, 'turn');
    s.group();
    s.createSnapshot('Original');
    s.newBoard();
    const backup = store.workspaceBackup();
    const count = store.useStore.getState().boards.length;
    s.importWorkspace(backup);
    const after = store.useStore.getState();
    expect(after.boards).toHaveLength(count * 2);
    expect(board().id).not.toBe(backup.currentId);
    expect(board().name).toBe(backup.boards.find((b) => b.id === backup.currentId)!.name);
    const imported =
      after.boards[count + backup.boards.findIndex((b) => b.nodes.some((n) => n.id === id))];
    expect(imported.nodes.some((n) => n.id === id)).toBe(false);
    expect(imported.edges[0].data?.historyMessageIds).toEqual(['turn']);
    expect(after.snapshots).toHaveLength(2);
    expect(after.snapshots[1].id).not.toBe(backup.snapshots[0].id);
    expect(after.snapshots[1].board.nodes[0].id).not.toBe(backup.snapshots[0].board.nodes[0].id);
    const original = after.boards;
    for (const invalid of [
      { ...backup, version: 2 },
      { ...backup, boards: [] },
      { ...backup, currentId: 'missing' },
      { ...backup, boards: [backup.boards[0], backup.boards[0]] },
      { ...backup, snapshots: [{ ...backup.snapshots[0], board: {} }] },
    ]) {
      expect(() => s.importWorkspace(invalid)).toThrow();
      expect(store.useStore.getState().boards).toBe(original);
    }
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => s.importWorkspace(backup)).toThrow('storage is full');
    expect(store.useStore.getState().boards).toBe(original);
    spy.mockRestore();
  });
  it('sanitizes backup data and remaps historical branches through board import and duplication', () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, { messages: [{ id: 'turn', role: 'user', content: 'Saved turn' }] });
    const child = s.branchFromMessage(id, 'turn');
    s.updateNode(child, { contextInclude: [id] });
    s.nodesChange(board().nodes.map((n) => ({ type: 'select', id: n.id, selected: true })));
    s.duplicate();
    const duplicated = board().nodes.find((n) => n.selected && n.data.contextInclude?.length)!;
    expect(duplicated.data.contextInclude).not.toEqual([id]);
    expect(contextFor(duplicated.id, board().nodes, board().edges).map((m) => m.content)).toEqual([
      'Saved turn',
    ]);
    const input = JSON.parse(JSON.stringify(store.workspaceBackup()));
    const exported = input.boards.find((b: Board) => b.id === input.currentId);
    input.credentials = { apiKey: 'must-not-export' };
    exported.apiKey = 'must-not-export';
    exported.nodes[0].data.apiKey = 'must-not-export';
    const clean = store.validateWorkspaceBackup(input);
    expect(JSON.stringify(clean)).not.toContain('must-not-export');
    s.importBoard(clean.boards.find((b) => b.id === clean.currentId)!);
    const importedChild = board().nodes.find((n) => n.data.contextInclude?.length)!;
    expect(importedChild.data.contextInclude).not.toEqual([id]);
    expect(
      contextFor(importedChild.id, board().nodes, board().edges).map((m) => m.content),
    ).toEqual(['Saved turn']);
  });
  it('persists context policies and budgets, remaps references for import/duplication, and cleans deletion', () => {
    const s = store.useStore.getState();
    const a = s.addNode('note', { x: 0, y: 0 });
    const b = s.addNode('chat', { x: 500, y: 0 });
    s.setContextSource(b, a, 'include');
    s.updateNode(b, { contextTokenLimit: 1000 }, true);
    s.undo();
    expect(board().nodes[1].data.contextTokenLimit).toBeUndefined();
    s.redo();
    s.setContextSource(b, a, 'exclude');
    expect(board().nodes[1].data.contextInclude).toEqual([]);
    s.undo();
    expect(board().nodes[1].data.contextInclude).toEqual([a]);
    const snapshot = store.validateBoard(board());
    store.saveWorkspace();
    expect(memory.get('branchboard.workspace.v1')).toContain('contextTokenLimit');
    select(a, b);
    s.duplicate();
    const copiedNote = selected().find((n) => n.type === 'note')!;
    const copiedChat = selected().find((n) => n.type === 'chat')!;
    expect(copiedChat.data.contextInclude).toEqual([copiedNote.id]);
    select(copiedNote.id);
    s.removeSelected();
    expect(board().nodes.find((n) => n.id === copiedChat.id)!.data.contextInclude).toEqual([]);
    expect(() => store.validateBoard(board())).not.toThrow();
    s.importBoard(snapshot);
    expect(board().nodes[1].data.contextInclude).toEqual([board().nodes[0].id]);
    expect(board().nodes[1].data.contextTokenLimit).toBe(1000);
    s.setContextSource(board().nodes[1].id, board().nodes[0].id, 'auto');
    expect(board().nodes[1].data.contextInclude).toEqual([]);
  });
  it('rejects malformed policies, dangling/self/group/overlapping references, and invalid budgets atomically', () => {
    const s = store.useStore.getState();
    const a = s.addNode('note', { x: 0, y: 0 });
    const b = s.addNode('chat', { x: 500, y: 0 });
    for (const data of [
      { contextInclude: 'bad' },
      { contextInclude: [null] },
      { contextInclude: [a, a] },
      { contextInclude: ['missing'] },
      { contextInclude: [b] },
      { contextInclude: [a], contextExclude: [a] },
      ...[0, -1, 1.5, NaN, Infinity, 10_000_001, '123'].map((contextTokenLimit) => ({
        contextTokenLimit,
      })),
    ]) {
      const invalid = structuredClone(board());
      Object.assign(invalid.nodes[1].data, data);
      expect(() => s.importBoard(invalid)).toThrow('context');
      expect(board().nodes).toHaveLength(2);
    }
    const invalid = structuredClone(board());
    invalid.nodes[0].type = 'group';
    invalid.nodes[1].data.contextExclude = [a];
    expect(() => store.validateBoard(invalid)).toThrow('context');
  });
  it('retains independent custom ports through validation, import, and undo', () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    const portPositions = { source: { x: 0.8, y: 1 }, target: { x: 0, y: 0.2 } };
    s.updateNode(id, { portPositions }, true);
    expect(store.validateBoard(board()).nodes[0].data.portPositions).toEqual(portPositions);
    s.undo();
    expect(board().nodes[0].data.portPositions).toBeUndefined();
    s.redo();
    s.importBoard(board());
    expect(board().nodes[0].data.portPositions).toEqual(portPositions);
    for (const value of [NaN, Infinity, -0.1, 1.1]) {
      const invalid = structuredClone(board());
      invalid.nodes[0].data.portPositions!.source!.x = value;
      expect(() => store.validateBoard(invalid)).toThrow('port positions');
    }
  });
  it('exports valid groups and imports with collision-free IDs', () => {
    const s = store.useStore.getState();
    const a = s.addNode('chat', { x: 0, y: 0 }),
      b = s.addNode('note', { x: 500, y: 0 });
    s.connect(a, b);
    select(a, b);
    s.group();
    const original = structuredClone(board());
    s.importBoard(original);
    expect(board().id).not.toBe(original.id);
    expect(board().nodes).toHaveLength(3);
    expect(board().nodes.every((n) => !original.nodes.some((o) => o.id === n.id))).toBe(true);
    expect(
      board()
        .nodes.filter((n) => n.parentId)
        .every((n) => board().nodes.some((p) => p.id === n.parentId)),
    ).toBe(true);
    store.saveWorkspace();
    expect(memory.get('branchboard.workspace.v1')).toContain(board().id);
  });
  it('rejects malformed boards, cyclic edges, and circular groups', () => {
    expect(() => store.validateBoard({ name: 'bad', nodes: [{}], edges: [] })).toThrow();
    const s = store.useStore.getState();
    const a = s.addNode('chat', { x: 0, y: 0 }),
      b = s.addNode('chat', { x: 500, y: 0 });
    const bad = structuredClone(board());
    bad.edges = [
      { id: '1', source: a, target: b },
      { id: '2', source: b, target: a },
    ];
    expect(() => store.validateBoard(bad)).toThrow('cyclic');
    bad.edges = [];
    bad.nodes.forEach((n, i) => {
      n.type = 'group';
      n.parentId = bad.nodes[1 - i].id;
    });
    expect(() => store.validateBoard(bad)).toThrow('hierarchy');
  });
  it('does not save invalid blank names or silently lose quota errors', () => {
    store.useStore.setState((s) => ({
      boards: s.boards.map((b) => (b.id === s.currentId ? { ...b, name: '' } : b)),
    }));
    store.saveWorkspace();
    expect(JSON.parse(memory.get('branchboard.workspace.v1')!).boards.at(-1).name).toBe(
      'Untitled canvas',
    );
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    store.saveWorkspace();
    expect(store.useStore.getState().storageError).toContain('storage is full');
    spy.mockRestore();
  });
});
describe('conversation state', () => {
  it('branches through any chosen turn, retaining live edits but never later/deleted/replacement turns', async () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, {
      messages: [
        { id: 'system', role: 'system', content: 'Instructions' },
        { id: 'user', role: 'user', content: 'Early question' },
        { id: 'reply', role: 'assistant', content: 'Early answer' },
        { id: 'later', role: 'user', content: 'Later question' },
      ],
    });
    const child = s.branchFromMessage(id, 'reply');
    expect(board().nodes.at(-1)!.data.messages).toEqual([]);
    s.undo();
    expect(board().nodes).toHaveLength(1);
    s.redo();
    s.editMessage(id, 'user', 'Edited question');
    s.deleteMessage(id, 'reply');
    s.updateNode(id, {
      messages: [
        ...board().nodes[0].data.messages,
        { id: 'new', role: 'assistant', content: 'New reply' },
      ],
    });
    expect(contextFor(child, board().nodes, board().edges).map((m) => m.content)).toEqual([
      'Instructions',
      'Edited question',
    ]);
    const saved = store.validateBoard(JSON.parse(JSON.stringify(board())));
    expect(saved.edges[0].data?.historyMessageIds).toEqual(['system', 'user', 'reply']);
    const mock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('data: {"done":true}\n\n'));
    try {
      await s.generate(child, 'Continue here');
      expect(JSON.parse(mock.mock.calls[0][1]!.body as string).messages).toEqual([
        { role: 'system', content: 'Instructions' },
        { role: 'user', content: 'Edited question' },
        { role: 'user', content: 'Continue here' },
      ]);
    } finally {
      mock.mockRestore();
    }
    expect(s.branchFromMessage(id, 'missing')).toBe('');
    store.useStore.setState({ streaming: { other: true } });
    expect(s.branchFromMessage(id, 'user')).toBe('');
    store.useStore.setState({ streaming: {} });
    for (const history of ['bad', [1], ['same', 'same']]) {
      const invalid = structuredClone(saved);
      invalid.edges[0].data = { historyMessageIds: history };
      expect(() => s.importBoard(invalid)).toThrow('historical branch');
    }
  });
  it('rejects imported duplicate message IDs so history actions cannot target multiple turns', () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, {
      messages: [
        { id: 'same', role: 'user', content: 'First' },
        { id: 'same', role: 'assistant', content: 'Second' },
      ],
    });
    expect(() => store.validateBoard(board())).toThrow('Duplicate message IDs');
  });
  it('edits and deletes individual messages with single-step undo, persistence and live branch context', async () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, {
      messages: [
        { id: 'u', role: 'user', content: 'Original question' },
        { id: 'a', role: 'assistant', content: 'Original reply' },
        { id: 's', role: 'system', content: 'Instructions' },
      ],
      error: 'Old provider failure',
    });
    const child = s.branch(id);
    const history = store.useStore.getState().past.length;
    expect(s.editMessage(id, 'u', 'Edited question')).toBe(true);
    expect(store.useStore.getState().past).toHaveLength(history + 1);
    expect(board().nodes[0].data.messages.map((m) => m.content)).toEqual([
      'Edited question',
      'Original reply',
      'Instructions',
    ]);
    expect(board().nodes[0].data.error).toBeUndefined();
    expect(contextFor(child, board().nodes, board().edges)[0].content).toBe('Edited question');
    s.undo();
    expect(board().nodes[0].data.messages[0].content).toBe('Original question');
    s.redo();
    expect(s.editMessage(id, 'a', '**Corrected reply**')).toBe(true);
    expect(s.editMessage(id, 's', 'Corrected instructions')).toBe(true);
    expect(s.deleteMessage(id, 'a')).toBe(true);
    expect(board().nodes[0].data.messages.map((m) => m.id)).toEqual(['u', 's']);
    expect(contextFor(child, board().nodes, board().edges).map((m) => m.content)).toEqual([
      'Edited question',
      'Corrected instructions',
    ]);
    s.undo();
    expect(board().nodes[0].data.messages[1].content).toBe('**Corrected reply**');
    s.redo();
    store.saveWorkspace();
    const saved = JSON.parse(memory.get('branchboard.workspace.v1')!);
    expect(
      store.validateBoard(saved.boards.find((b: { id: string }) => b.id === board().id)).nodes[0]
        .data.messages,
    ).toHaveLength(2);
    const mock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('data: {"done":true}\n\n'));
    try {
      await s.generate(child, 'Continue');
      expect(JSON.parse(mock.mock.calls[0][1]!.body as string).messages).toEqual([
        { role: 'user', content: 'Edited question' },
        { role: 'system', content: 'Corrected instructions' },
        { role: 'user', content: 'Continue' },
      ]);
    } finally {
      mock.mockRestore();
    }
  });
  it('rejects empty/oversized/missing edits and blocks all history changes during generation', () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, { messages: [{ id: 'u', role: 'user', content: 'Keep me' }] });
    const before = structuredClone(board());
    const history = store.useStore.getState().past.length;
    expect(s.editMessage(id, 'u', 'Keep me')).toBe(true);
    for (const value of ['', '  ', 'x'.repeat(100_001)])
      expect(s.editMessage(id, 'u', value)).toBe(false);
    expect(s.editMessage(id, 'missing', 'Changed')).toBe(false);
    expect(s.deleteMessage('missing', 'u')).toBe(false);
    store.useStore.setState({ streaming: { other: true } });
    expect(s.editMessage(id, 'u', 'Changed')).toBe(false);
    expect(s.deleteMessage(id, 'u')).toBe(false);
    expect(board()).toEqual(before);
    expect(store.useStore.getState().past).toHaveLength(history);
    store.useStore.setState({ streaming: {} });
    expect(s.deleteMessage(id, 'u')).toBe(true);
    expect(board().nodes[0].data.messages).toEqual([]);
    s.undo();
    expect(board().nodes[0].data.messages[0].content).toBe('Keep me');
  });
  it('uses the same overridden context for preview and the real request, without changing graph edges', async () => {
    const s = store.useStore.getState();
    const a = s.addNode('note', { x: 0, y: 0 });
    const b = s.addNode('note', { x: 0, y: 400 });
    const chat = s.branch(a);
    s.updateNode(a, { note: 'Excluded secret' });
    s.updateNode(b, { note: 'Included instructions' });
    s.setContextSource(chat, a, 'exclude');
    s.setContextSource(chat, b, 'include');
    const mock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('data: {"done":true}\n\n'));
    try {
      await s.generate(chat, 'Hello');
      const sent = JSON.parse(mock.mock.calls[0][1]!.body as string).messages;
      expect(sent).toEqual(
        contextFor(chat, board().nodes, board().edges).map(({ role, content }) => ({
          role,
          content,
        })),
      );
      expect(JSON.stringify(sent)).toContain('Included instructions');
      expect(JSON.stringify(sent)).not.toContain('Excluded secret');
      expect(board().edges).toHaveLength(1);
    } finally {
      mock.mockRestore();
    }
  });
  it('blocks oversized sends and regeneration before fetch or history mutation, then allows an exact-budget retry', async () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, { contextTokenLimit: 1 });
    const mock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('data: {"token":"Reply"}\n\ndata: {"done":true}\n\n'));
    try {
      await s.generate(id, 'Hello');
      expect(mock).not.toHaveBeenCalled();
      expect(board().nodes[0].data.messages).toEqual([]);
      expect(board().nodes[0].data.error).toContain('Nothing was sent');
      s.updateNode(id, { contextTokenLimit: estimateTokens([{ content: 'Hello' }]) });
      await s.generate(id, 'Hello');
      expect(mock).toHaveBeenCalledTimes(1);
      expect(board().nodes[0].data.error).toBeUndefined();
      const history = structuredClone(board().nodes[0].data.messages);
      s.updateNode(id, { contextTokenLimit: 1 });
      await s.generate(id);
      expect(mock).toHaveBeenCalledTimes(1);
      expect(board().nodes[0].data.messages).toEqual(history);
      s.updateNode(id, { contextTokenLimit: undefined });
      mock.mockResolvedValue(new Response('data: {"done":true}\n\n'));
      await s.generate(id);
      expect(mock).toHaveBeenCalledTimes(2);
      expect(board().nodes[0].data.messages.filter((m) => m.role === 'user')).toHaveLength(1);
    } finally {
      mock.mockRestore();
    }
  });
  it('routes node-specific models, including keyless Ollama, without falling back on failure', async () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, { provider: 'ollama', model: 'local-model' }, true);
    const mock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"error":"Ollama is offline"}', { status: 502 }));
    try {
      await s.generate(id, 'Hello');
      expect(mock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mock.mock.calls[0][1]!.body as string)).toMatchObject({
        provider: 'ollama',
        model: 'local-model',
      });
      expect(board().nodes[0].data.error).toBe('Ollama is offline');
      expect(board().nodes[0].data.provider).toBe('ollama');
      s.updateNode(id, { provider: 'anthropic', model: 'claude-test' }, true);
      await s.generate(id, 'No key');
      expect(mock).toHaveBeenCalledTimes(1);
      expect(store.useStore.getState().settingsOpen).toBe(true);
      store.useStore.setState({ settingsOpen: false });
    } finally {
      mock.mockRestore();
    }
  });
  it('preserves model choices through undo, import and persistence while validating imports', () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, { provider: 'google', model: 'gemini-2.5-pro' }, true);
    const snapshot = structuredClone(board());
    expect(store.validateBoard(snapshot).nodes[0].data).toMatchObject({
      provider: 'google',
      model: 'gemini-2.5-pro',
    });
    store.saveWorkspace();
    const saved = JSON.parse(memory.get('branchboard.workspace.v1')!);
    expect(saved.boards.find((b: { id: string }) => b.id === board().id).nodes[0].data.model).toBe(
      'gemini-2.5-pro',
    );
    s.undo();
    expect(board().nodes[0].data.provider).toBeUndefined();
    s.redo();
    expect(board().nodes[0].data.provider).toBe('google');
    s.importBoard(snapshot);
    expect(board().nodes[0].id).not.toBe(id);
    expect(board().nodes[0].data.model).toBe('gemini-2.5-pro');
    snapshot.nodes[0].data.model = '';
    expect(() => store.validateBoard(snapshot)).toThrow('Invalid provider or model');
  });
  it('streams tokens, sends parent context and saves history on the originating board', async () => {
    const s = store.useStore.getState();
    const a = s.addNode('note', { x: 0, y: 0 });
    s.updateNode(a, { note: 'Be concise' });
    const child = s.branch(a);
    const originalId = board().id;
    let captured: { messages: { role: string; content: string }[] } | undefined;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      captured = JSON.parse(options!.body as string);
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                'data: {"token":"Hello"}\n\ndata: {"token":" there"}\n\ndata: {"done":true}\n\n',
              ),
            );
            c.close();
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    });
    const promise = s.generate(child, 'Hi');
    s.newBoard();
    await promise;
    const n = store.useStore
      .getState()
      .boards.find((b) => b.id === originalId)!
      .nodes.find((n) => n.id === child)!;
    expect(n.data.messages.map((m) => m.content)).toEqual(['Hi', 'Hello there']);
    expect(captured!.messages[0].content).toContain('Be concise');
    expect(board().nodes).toHaveLength(0);
    expect(store.useStore.getState().streaming[child]).toBe(false);
    fetchMock.mockRestore();
  });
  it('retains errors and retries without duplicating the user prompt', async () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    const mock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Quota exceeded' }), { status: 429 }),
      )
      .mockResolvedValueOnce(
        new Response('data: {"token":"Recovered"}\n\ndata: {"done":true}\n\n'),
      );
    await s.generate(id, 'Hi');
    expect(board().nodes[0].data.error).toBe('Quota exceeded');
    await s.generate(id);
    expect(board().nodes[0].data.messages.map((m) => m.content)).toEqual(['Hi', 'Recovered']);
    expect(board().nodes[0].data.error).toBeUndefined();
    mock.mockRestore();
  });
  it('requires a real key rather than generating placeholder answers', async () => {
    store.useStore.setState((s) => ({
      configured: false,
      providers: s.providers.map((p) => ({ ...p, configured: false })),
    }));
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    await s.generate(id, 'Hi');
    expect(board().nodes[0].data.messages).toHaveLength(0);
    expect(store.useStore.getState().settingsOpen).toBe(true);
    store.useStore.setState({ settingsOpen: false });
  });
  it('stops a stream without discarding partial content and blocks undo while active', async () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"token":"Partial reply"}\n\n'));
            init?.signal?.addEventListener('abort', () =>
              controller.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        }),
      );
    });
    try {
      const generation = s.generate(id, 'Hello');
      await vi.waitFor(() =>
        expect(board().nodes[0].data.messages.at(-1)?.content).toBe('Partial reply'),
      );
      s.undo();
      expect(board().nodes[0].data.messages).toHaveLength(2);
      s.stop(id);
      await generation;
      expect(board().nodes[0].data.messages.at(-1)?.content).toBe('Partial reply');
      expect(board().nodes[0].data.error).toBeUndefined();
      expect(store.useStore.getState().streaming[id]).toBe(false);
    } finally {
      mock.mockRestore();
    }
  });
});
