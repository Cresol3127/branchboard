import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  catalogIsStale,
  catalogModelChoices,
  loadModelCatalog,
  MODEL_CATALOG_STORAGE_KEY,
  validateModelCatalog,
} from '../src/modelCatalog';
import { MODEL_REFRESH_INTERVAL } from '../src/modelDiscovery';
import type { PublicProvider } from '../src/providers';

let store: typeof import('../src/store');
let memory: Map<string, string>;
const catalog = (models = ['public-new']) => ({
  version: 2,
  providers: {
    openai: { models, source: 'models.dev', updatedAt: Date.now() },
  },
});
const provider: PublicProvider = {
  id: 'openai',
  name: 'OpenAI',
  configured: false,
  hasKey: false,
  baseURL: 'https://api.openai.com/v1',
  models: ['old-suggestion'],
  extraModels: ['saved-custom'],
  defaultModel: 'saved-default',
};
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  memory = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => memory.set(key, value)),
  });
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  store = await import('../src/store');
  store.useStore
    .getState()
    .applyConfig({ configured: false, model: 'saved-default', providers: [provider] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('public catalog state', () => {
  it('updates without a key and never mutates conversations/history/backups or workspace storage', async () => {
    const state = store.useStore.getState();
    const id = state.addNode('chat', { x: 0, y: 0 });
    state.updateNode(id, { provider: 'openai', model: 'private-exact-selection' }, true);
    await vi.advanceTimersByTimeAsync(400);
    const original = store.useStore.getState();
    const request = vi.fn().mockResolvedValue(Response.json(catalog()));
    vi.stubGlobal('fetch', request);
    await state.refreshModelCatalog();
    const result = store.useStore.getState();
    expect(request.mock.calls[0][0]).toBe('/api/models/catalog');
    expect(catalogModelChoices(provider, result.modelCatalog)).toEqual(['public-new']);
    expect(result.boards).toBe(original.boards);
    expect(result.past).toBe(original.past);
    expect(memory.get('branchboard.workspace.v1')).toContain('private-exact-selection');
    expect(memory.get(MODEL_CATALOG_STORAGE_KEY)).toContain('public-new');
    expect(JSON.stringify(store.workspaceBackup())).not.toContain('public-new');
    expect(result.modelDiscovery).toEqual({});
  });

  it('deduplicates checks, preserves successful entries on network/partial failures and restores offline cache', async () => {
    const state = store.useStore.getState();
    const request = vi.fn().mockResolvedValue(Response.json(catalog()));
    vi.stubGlobal('fetch', request);
    await Promise.all([state.refreshModelCatalog(), state.refreshModelCatalog()]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(loadModelCatalog().providers.openai?.models).toEqual(['public-new']);
    request.mockResolvedValue(
      Response.json({ version: 2, providers: {}, errors: { openai: 'Unavailable' } }),
    );
    await state.refreshModelCatalog(true);
    expect(store.useStore.getState().modelCatalog.providers.openai?.models).toEqual(['public-new']);
    expect(store.useStore.getState().modelCatalog.errors?.openai).toBe('Unavailable');
    request.mockRejectedValue(new Error('Offline'));
    await expect(state.refreshModelCatalog()).rejects.toThrow('Offline');
    expect(loadModelCatalog().providers.openai?.models).toEqual(['public-new']);
    expect(catalogIsStale(store.useStore.getState().modelCatalog)).toBe(false);
    await vi.advanceTimersByTimeAsync(MODEL_REFRESH_INTERVAL);
    expect(catalogIsStale(store.useStore.getState().modelCatalog)).toBe(true);
  });

  it('ignores corrupt caches and rejects malformed catalogs without losing the previous data', async () => {
    memory.set(MODEL_CATALOG_STORAGE_KEY, 'broken JSON');
    expect(loadModelCatalog().providers).toEqual({});
    expect(() => validateModelCatalog(catalog(['bad\nID']))).toThrow('Invalid');
    expect(() => validateModelCatalog({ ...catalog(), version: 1 })).toThrow('Invalid');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(catalog())));
    await store.useStore.getState().refreshModelCatalog();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ version: 2, providers: { openai: { models: [null] } } }),
        ),
    );
    await expect(store.useStore.getState().refreshModelCatalog()).rejects.toThrow('Invalid');
    expect(loadModelCatalog().providers.openai?.models).toEqual(['public-new']);
  });

  it('cancels silently and times out hung requests while retaining previous choices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, { signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            ),
          ),
      ),
    );
    const state = store.useStore.getState();
    const controller = new AbortController();
    const cancelled = state.refreshModelCatalog(false, controller.signal);
    controller.abort();
    await cancelled;
    expect(store.useStore.getState().modelCatalog.error).toBeUndefined();
    const timeout = expect(state.refreshModelCatalog()).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(20_000);
    await timeout;
    expect(store.useStore.getState().modelCatalog.loading).toBe(false);
    expect(catalogModelChoices(provider, store.useStore.getState().modelCatalog)).toEqual([]);
  });

  it('keeps fresh choices usable when the disposable offline cache exceeds storage quota', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(catalog())));
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new DOMException('Quota', 'QuotaExceededError');
    });
    await store.useStore.getState().refreshModelCatalog();
    const result = store.useStore.getState();
    expect(result.modelCatalog.error).toBeUndefined();
    expect(result.modelCatalog.cacheError).toContain('offline cache could not be saved');
    expect(result.modelCatalog.providers.openai?.models).toEqual(['public-new']);
    expect(result.storageError).toBe('');
  });
});
