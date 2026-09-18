import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { absolutePosition } from '../src/graph';
import { providerDefinitions, providerIds } from '../src/providers';

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
  store.useStore.setState({ configured: true, streaming: {}, storageError: '', providers: providerIds.map((id) => ({
    id, name: providerDefinitions[id].name, configured: id === 'openai' || id === 'ollama', hasKey: id === 'openai',
    baseURL: providerDefinitions[id].baseURL, models: providerDefinitions[id].models,
    extraModels: [], defaultModel: providerDefinitions[id].models[0] || '',
  })) });
});
const selected = () =>
  store.currentBoard(store.useStore.getState()).nodes.filter((n) => n.selected);
const board = () => store.currentBoard(store.useStore.getState());
function select(...ids: string[]) {
  store.useStore
    .getState()
    .nodesChange(
      board().nodes.map((n) => ({ id: n.id, type: 'select', selected: ids.includes(n.id) })),
    );
}

describe('node operations and undo', () => {
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
  it('routes node-specific models, including keyless Ollama, without falling back on failure', async () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, { provider: 'ollama', model: 'local-model' }, true);
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"Ollama is offline"}', { status: 502 }));
    try {
      await s.generate(id, 'Hello');
      expect(mock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mock.mock.calls[0][1]!.body as string)).toMatchObject({ provider: 'ollama', model: 'local-model' });
      expect(board().nodes[0].data.error).toBe('Ollama is offline');
      expect(board().nodes[0].data.provider).toBe('ollama');
      s.updateNode(id, { provider: 'anthropic', model: 'claude-test' }, true);
      await s.generate(id, 'No key');
      expect(mock).toHaveBeenCalledTimes(1);
      expect(store.useStore.getState().settingsOpen).toBe(true);
      store.useStore.setState({ settingsOpen: false });
    } finally { mock.mockRestore(); }
  });
  it('preserves model choices through undo, import and persistence while validating imports', () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, { provider: 'google', model: 'gemini-2.5-pro' }, true);
    const snapshot = structuredClone(board());
    expect(store.validateBoard(snapshot).nodes[0].data).toMatchObject({ provider: 'google', model: 'gemini-2.5-pro' });
    store.saveWorkspace();
    const saved = JSON.parse(memory.get('branchboard.workspace.v1')!);
    expect(saved.boards.find((b: { id: string }) => b.id === board().id).nodes[0].data.model).toBe('gemini-2.5-pro');
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
    store.useStore.setState((s) => ({ configured: false, providers: s.providers.map((p) => ({ ...p, configured: false })) }));
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
