import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODEL_REFRESH_INTERVAL, modelsAreStale } from '../src/modelDiscovery';
import { providerDefinitions, type PublicProvider } from '../src/providers';

let store: typeof import('../src/store');
const provider = (id: PublicProvider['id'] = 'openai'): PublicProvider => ({
  id,
  name: providerDefinitions[id].name,
  configured: true,
  hasKey: true,
  baseURL: providerDefinitions[id].baseURL,
  models: ['previous'],
  extraModels: ['manual-saved'],
  defaultModel: 'selected-default',
});
const config = (providers = [provider()]) => ({
  configured: true,
  model: 'selected-default',
  providers,
});

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  store = await import('../src/store');
  store.useStore.getState().applyConfig(config());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('provider model discovery', () => {
  it('marks only stale providers for automatic refresh, including failed checks', () => {
    expect(modelsAreStale(undefined, 100)).toBe(true);
    expect(modelsAreStale({ loading: true }, 100)).toBe(false);
    expect(modelsAreStale({ loading: false, checkedAt: 100, error: 'offline' }, 101)).toBe(false);
    expect(modelsAreStale({ loading: false, checkedAt: 100 }, 100 + MODEL_REFRESH_INTERVAL)).toBe(
      true,
    );
  });

  it('replaces discovered lists, preserves manual/default IDs and node selections without history or persistence', async () => {
    const s = store.useStore.getState();
    const id = s.addNode('chat', { x: 0, y: 0 });
    s.updateNode(id, { provider: 'openai', model: 'exact/private-model' }, true);
    const board = store.currentBoard(store.useStore.getState());
    const past = store.useStore.getState().past;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ models: ['new', 'new', ' another '] })),
    );
    await s.refreshModels('openai');
    const result = store.useStore.getState();
    expect(result.providers[0].models).toEqual([
      'another',
      'manual-saved',
      'new',
      'selected-default',
    ]);
    expect(result.modelDiscovery.openai).toMatchObject({
      loading: false,
      updatedAt: Date.now(),
      checkedAt: Date.now(),
    });
    expect(store.currentBoard(result)).toBe(board);
    expect(result.past).toBe(past);
    expect(JSON.stringify(store.workspaceBackup())).not.toContain('modelDiscovery');
  });

  it('deduplicates concurrent requests and isolates failures without removing the last successful list', async () => {
    const s = store.useStore.getState();
    s.applyConfig(config([provider(), provider('anthropic')]));
    let release!: (response: Response) => void;
    const request = vi.fn((url: string) =>
      url.includes('openai')
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(Response.json({ error: 'Key not authorized' }, { status: 401 })),
    );
    vi.stubGlobal('fetch', request);
    const first = s.refreshModels('openai');
    const second = s.refreshModels('openai');
    expect(request).toHaveBeenCalledTimes(1);
    expect(store.useStore.getState().modelDiscovery.openai?.loading).toBe(true);
    await expect(s.refreshModels('anthropic')).rejects.toThrow('Key not authorized');
    release(Response.json({ models: ['latest'] }));
    await Promise.all([first, second]);
    expect(store.useStore.getState().modelDiscovery.anthropic).toMatchObject({
      loading: false,
      error: 'Key not authorized',
    });
    expect(store.useStore.getState().providers[1].models).toEqual(['previous']);
    expect(store.useStore.getState().providers[0].models).toContain('latest');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ models: [null] })));
    await expect(s.refreshModels('openai')).rejects.toThrow('invalid model list');
    expect(store.useStore.getState().providers[0].models).toContain('latest');
    expect(store.useStore.getState().modelDiscovery.openai?.updatedAt).toBeTruthy();
  });

  it('discards late results from replaced credentials/endpoints, without invalidating other providers', async () => {
    const s = store.useStore.getState();
    s.applyConfig(config([provider(), provider('anthropic')]));
    let release!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              release = resolve;
            }),
        )
        .mockResolvedValue(Response.json({ models: ['new-endpoint'] })),
    );
    const stale = s.refreshModels('openai');
    const unchanged = store.useStore.getState().providers[1];
    s.applyConfig(
      config([{ ...provider(), baseURL: 'https://different.example/v1' }, provider('anthropic')]),
      'openai',
    );
    await s.refreshModels('openai');
    release(Response.json({ models: ['stale-secret-model'] }));
    await stale;
    expect(store.useStore.getState().providers[0].models).toContain('new-endpoint');
    expect(store.useStore.getState().providers[0].models).not.toContain('stale-secret-model');
    expect(store.useStore.getState().providers[1]).toBe(unchanged);
  });

  it('times out hung discovery and supports cancellation without displaying an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, { signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      ),
    );
    const s = store.useStore.getState();
    const timeout = expect(s.refreshModels('openai')).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(20_000);
    await timeout;
    expect(store.useStore.getState().providers[0].models).toEqual(['previous']);
    const controller = new AbortController();
    const cancelled = s.refreshModels('openai', controller.signal);
    controller.abort();
    await cancelled;
    expect(store.useStore.getState().modelDiscovery.openai?.loading).toBe(false);
    expect(store.useStore.getState().modelDiscovery.openai?.error).toBeUndefined();
  });

  it('never requests unconfigured providers and clears their stale discovery state when a key is removed', async () => {
    const s = store.useStore.getState();
    const request = vi.fn().mockResolvedValue(Response.json({ models: ['live'] }));
    vi.stubGlobal('fetch', request);
    await s.refreshModels('openai');
    s.applyConfig(config([{ ...provider(), hasKey: false, configured: false }]), 'openai');
    await s.refreshModels('openai');
    expect(request).toHaveBeenCalledTimes(1);
    expect(store.useStore.getState().modelDiscovery.openai).toBeUndefined();
  });
});
