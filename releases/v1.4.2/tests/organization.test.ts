import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyOrganization, folderPath, validateOrganization } from '../src/organization';
import { contextFor } from '../src/graph';
import type { Board } from '../src/types';

let store: typeof import('../src/store');
const memory = new Map<string, string>();
beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  memory.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
  });
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  store = await import('../src/store');
  store.useStore.getState().newBoard();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const state = () => store.useStore.getState();
const board = () => store.currentBoard(state());

function savedConversation() {
  const s = state();
  const source = s.addNode('chat', { x: 0, y: 0 });
  s.updateNode(source, {
    messages: [
      { id: 'first', role: 'user', content: 'Plan the research' },
      { id: 'reply', role: 'assistant', content: 'Test-only saved reply' },
    ],
  });
  const child = s.branchFromMessage(source, 'first');
  s.updateNode(child, { contextInclude: [source], contextTokenLimit: 2000 });
  s.addNode('note', { x: 500, y: 0 });
  s.setAnnotations({
    layers: [{ id: 'layer', name: 'Plan', visible: true, locked: false }],
    items: [
      {
        id: 'mark',
        layerId: 'layer',
        kind: 'arrow',
        color: '#abcdef',
        width: 3,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
      },
    ],
  });
  return { source, child };
}

describe('local workspace organization', () => {
  it('creates nested projects/folders, moves and renames without affecting canvas undo', () => {
    const s = state();
    const project = s.createFolder('Research');
    const folder = s.createFolder('Questions', project);
    s.moveBoard(board().id, folder);
    s.toggleFavorite(board().id);
    expect(folderPath(folder, state().organization.folders)).toBe('Research / Questions');
    s.renameFolder(project, 'Planning');
    expect(folderPath(folder, state().organization.folders)).toBe('Planning / Questions');
    expect(state().past).toHaveLength(0);
    s.addNode('note', { x: 0, y: 0 });
    s.undo();
    expect(state().organization.boardFolders[board().id]).toBe(folder);
    expect(state().organization.favoriteBoardIds).toContain(board().id);
  });

  it('removes a folder subtree but keeps all canvases, favorites and their contents', () => {
    const s = state();
    const project = s.createFolder('Research');
    const folder = s.createFolder('Questions', project);
    const nested = s.createFolder('Open', folder);
    const id = board().id;
    s.addNode('note', { x: 0, y: 0 });
    s.moveBoard(id, nested);
    s.toggleFavorite(id);
    s.deleteFolder(folder);
    expect(state().organization.folders.map((f) => f.id)).toEqual([project]);
    expect(state().organization.boardFolders[id]).toBe(project);
    expect(board().nodes).toHaveLength(1);
    s.deleteFolder(project);
    expect(state().organization.boardFolders[id]).toBeUndefined();
    expect(state().organization.favoriteBoardIds).toContain(id);
    s.deleteBoard();
    expect(state().organization.favoriteBoardIds).not.toContain(id);
  });

  it('persists organization through debounced autosave and reload; old workspaces still load', async () => {
    const s = state();
    const id = board().id;
    const folder = s.createFolder('Research');
    s.moveBoard(id, folder);
    s.toggleFavorite(id);
    s.saveTemplate('Reusable plan');
    vi.advanceTimersByTime(350);
    const organization = structuredClone(state().organization);
    vi.resetModules();
    store = await import('../src/store');
    expect(state().organization).toEqual(organization);
    const saved = JSON.parse(memory.get('branchboard.workspace.v1')!);
    delete saved.organization;
    memory.set('branchboard.workspace.v1', JSON.stringify(saved));
    vi.resetModules();
    store = await import('../src/store');
    expect(state().organization).toEqual(emptyOrganization());
    expect(board().id).toBe(id);
  });

  it('validates names, limits and hierarchy/references before making changes', () => {
    const s = state();
    expect(() => s.createFolder(' ')).toThrow('name');
    expect(() => s.createFolder('Child', 'absent')).toThrow('Folder');
    expect(() => s.moveBoard('absent')).toThrow('Canvas');
    const initial = state().organization;
    const validate = (value: unknown) =>
      validateOrganization(value, state().boards, store.validateBoard);
    expect(() =>
      validate({
        ...initial,
        folders: [
          { id: 'a', name: 'A', parentId: 'b' },
          { id: 'b', name: 'B', parentId: 'a' },
        ],
      }),
    ).toThrow('circular');
    expect(() => validate({ ...initial, favoriteBoardIds: ['absent'] })).toThrow('favorite');
    expect(() => validate({ ...initial, boardFolders: { [board().id]: 'absent' } })).toThrow(
      'reference',
    );
    for (let i = 0; i < 100; i++) s.createFolder(`Project ${i}`);
    expect(() => s.createFolder('One too many')).toThrow('100 folders');
    expect(state().organization.folders).toHaveLength(100);
  });

  it('excludes messages by default, preserves layout and notes, and creates independent templates', () => {
    const s = state();
    const { source } = savedConversation();
    const template = s.saveTemplate('Research workflow');
    const original = structuredClone(state().organization.templates[0]);
    expect(original.board.nodes.every((n) => n.data.messages.length === 0)).toBe(true);
    expect(original.board.edges[0].data).toBeUndefined();
    s.updateNode(source, { title: 'Changed source' });
    s.useTemplate(template);
    const copy = structuredClone(board());
    expect(copy.name).toBe('Research workflow');
    expect(copy.nodes[0].id).not.toBe(source);
    expect(copy.nodes[0].data.title).toBe(original.board.nodes[0].data.title);
    expect(copy.nodes[1].data.contextInclude).toEqual([copy.nodes[0].id]);
    expect(copy.edges[0].source).toBe(copy.nodes[0].id);
    expect(copy.annotations?.items[0].id).not.toBe('mark');
    expect(copy.annotations?.items[0].layerId).toBe(copy.annotations?.layers[0].id);
    s.useTemplate(template);
    expect(board().nodes[0].id).not.toBe(copy.nodes[0].id);
    expect(state().organization.templates[0]).toEqual(original);
    s.renameTemplate(template, 'New name');
    s.deleteTemplate(template);
    expect(state().organization.templates).toHaveLength(0);
    expect(board().nodes).toHaveLength(3);
  });

  it('explicitly includes real saved history and historical branch cutoffs when requested', () => {
    const s = state();
    savedConversation();
    const template = s.saveTemplate('With history', true);
    s.useTemplate(template);
    expect(board().nodes[0].data.messages).toHaveLength(2);
    expect(board().edges[0].data?.historyMessageIds).toEqual(['first']);
    const b = board();
    expect(contextFor(b.nodes[1].id, b.nodes, b.edges)).toHaveLength(2); // Explicit full-history inclusion.
  });

  it('blocks saving/using templates while streaming and enforces template limits', () => {
    const s = state();
    const id = s.saveTemplate('Template');
    store.useStore.setState({ streaming: { active: true } });
    expect(() => s.saveTemplate('Partial')).toThrow('Stop active');
    expect(() => s.useTemplate(id)).toThrow('Stop active');
    store.useStore.setState({ streaming: {} });
    for (let i = 1; i < 50; i++) s.saveTemplate(`Template ${i}`);
    expect(() => s.saveTemplate('One too many')).toThrow('50 templates');
  });

  it('backs up and imports independent projects, favorites, templates and all graph IDs', () => {
    const s = state();
    savedConversation();
    const parent = s.createFolder('Research');
    const folder = s.createFolder('Questions', parent);
    s.moveBoard(board().id, folder);
    s.toggleFavorite(board().id);
    s.saveTemplate('Plan', true);
    const backup = store.workspaceBackup();
    s.importWorkspace(backup);
    const o = state().organization;
    const copiedFolder = o.folders.at(-1)!;
    expect(copiedFolder.id).not.toBe(folder);
    expect(copiedFolder.parentId).not.toBe(parent);
    expect(o.boardFolders[board().id]).toBe(copiedFolder.id);
    expect(o.favoriteBoardIds).toContain(board().id);
    expect(o.templates[1].id).not.toBe(o.templates[0].id);
    expect(o.templates[1].board.nodes[0].id).not.toBe(o.templates[0].board.nodes[0].id);
    const legacy = { ...backup, organization: undefined };
    expect(store.validateWorkspaceBackup(legacy).organization).toEqual(emptyOrganization());
  });

  it('rejects malformed organization/templates atomically and never overwrites unreadable saved bytes', async () => {
    const s = state();
    const backup = store.workspaceBackup();
    const before = state().boards;
    const invalid = {
      ...backup,
      organization: {
        ...backup.organization,
        templates: [{ id: 'bad', name: 'Bad', createdAt: 1, board: {} as Board }],
      },
    };
    expect(() => s.importWorkspace(invalid)).toThrow();
    expect(state().boards).toBe(before);
    const corrupt = JSON.stringify(invalid);
    memory.set('branchboard.workspace.v1', corrupt);
    vi.resetModules();
    store = await import('../src/store');
    expect(state().storageError).toContain('could not be read');
    store.saveWorkspace();
    expect(memory.get('branchboard.workspace.v1')).toBe(corrupt);
  });

  it('surfaces organization quota failures instead of acknowledging a save', () => {
    state().createFolder('Research');
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('Quota');
      },
    });
    store.saveWorkspace();
    expect(state().storageError).toContain('full or unavailable');
  });
});
