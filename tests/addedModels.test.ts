import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let memory: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  memory = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => memory.set(k, v)),
  });
});
afterEach(() => vi.unstubAllGlobals());
it('saves exact IDs independently of recents, deduplicating provider/model pairs', async () => {
  const { useAddedModels, ADDED_MODELS_KEY, validateAddedModels } =
    await import('../src/addedModels');
  memory.set('branchboard.model-preferences.v1', 'existing recents');
  expect(useAddedModels.getState().add({ provider: 'openai', model: 'private/exact:2026' })).toBe(
    true,
  );
  expect(useAddedModels.getState().add({ provider: 'openai', model: ' private/exact:2026 ' })).toBe(
    true,
  );
  expect(useAddedModels.getState().add({ provider: 'custom', model: 'private/exact:2026' })).toBe(
    true,
  );
  expect(JSON.parse(memory.get(ADDED_MODELS_KEY)!)).toHaveLength(2);
  expect(memory.get('branchboard.model-preferences.v1')).toBe('existing recents');
  expect(() => validateAddedModels([{ provider: 'invalid', model: 'model' }])).toThrow();
  expect(() => validateAddedModels([{ provider: 'openai', model: 'bad\nID' }])).toThrow();
});
it('does not replace unreadable data or claim a successful save when storage is full', async () => {
  const { useAddedModels, ADDED_MODELS_KEY } = await import('../src/addedModels');
  vi.mocked(localStorage.setItem).mockImplementation(() => {
    throw new Error('Quota');
  });
  expect(useAddedModels.getState().add({ provider: 'openai', model: 'exact' })).toBe(false);
  expect(useAddedModels.getState().models).toEqual([]);
  memory.set(ADDED_MODELS_KEY, 'broken');
  vi.resetModules();
  const again = await import('../src/addedModels');
  expect(again.useAddedModels.getState().add({ provider: 'openai', model: 'exact' })).toBe(false);
  expect(memory.get(ADDED_MODELS_KEY)).toBe('broken');
});
