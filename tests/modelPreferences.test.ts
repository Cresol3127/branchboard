import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emptyModelPreferences,
  loadModelPreferences,
  MODEL_PREFERENCES_KEY,
  rememberModel,
  saveModelPreferences,
  selectableProviders,
} from '../src/modelPreferences';
import { providerDefinitions, providerIds } from '../src/providers';

afterEach(() => vi.unstubAllGlobals());

describe('minimal model preferences', () => {
  it('shows only keyed configured providers and successfully discovered local Ollama', () => {
    const providers = providerIds.map((id) => ({
      id,
      name: providerDefinitions[id].name,
      configured: true,
      hasKey: id === 'google',
      baseURL: '',
      models: [],
      extraModels: [],
      defaultModel: '',
    }));
    expect(selectableProviders(providers, {}).map((p) => p.id)).toEqual(['google']);
    expect(
      selectableProviders(providers, { ollama: { loading: false, updatedAt: 1 } }).map((p) => p.id),
    ).toEqual(['google', 'ollama']);
    expect(
      selectableProviders(
        providers.map((p) => ({ ...p, configured: false })),
        { ollama: { loading: false, updatedAt: 1 } },
      ),
    ).toEqual([]);
  });
  it('keeps five exact provider-scoped choices in most-recent-first order', () => {
    let preferences = emptyModelPreferences();
    for (let i = 0; i < 7; i++)
      preferences = rememberModel(preferences, { provider: 'openai', model: `exact-${i}` });
    preferences = rememberModel(preferences, { provider: 'openai', model: 'exact-4' });
    preferences = rememberModel(preferences, { provider: 'google', model: 'exact-4' });
    expect(preferences.recent).toHaveLength(5);
    expect(preferences.recent.slice(0, 3)).toEqual([
      { provider: 'google', model: 'exact-4' },
      { provider: 'openai', model: 'exact-4' },
      { provider: 'openai', model: 'exact-6' },
    ]);
  });
  it('restores model history after reload without touching workspace data', () => {
    const memory = new Map([['branchboard.workspace.v1', 'untouched']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) || null,
      setItem: (key: string, value: string) => memory.set(key, value),
    });
    const preferences = rememberModel(emptyModelPreferences(), {
      provider: 'openai',
      model: 'private/exact:2026',
    });
    expect(saveModelPreferences(preferences)).toBe('');
    expect(loadModelPreferences()).toEqual({
      modelPreferences: preferences,
      modelPreferenceError: '',
    });
    expect(memory.get('branchboard.workspace.v1')).toBe('untouched');
    expect([...memory.keys()]).toEqual(['branchboard.workspace.v1', MODEL_PREFERENCES_KEY]);
  });
  it('bounds and validates corrupt, oversized and unsupported history without breaking canvases', () => {
    for (const raw of [
      '{',
      'x'.repeat(16_385),
      JSON.stringify({ version: 2, recent: [] }),
      JSON.stringify({ version: 1, recent: [{ provider: 'unknown', model: 'x' }] }),
      JSON.stringify({ version: 1, recent: [{ provider: 'openai', model: '\u0000' }] }),
    ]) {
      vi.stubGlobal('localStorage', { getItem: () => raw });
      expect(loadModelPreferences().modelPreferences).toEqual(emptyModelPreferences());
      expect(loadModelPreferences().modelPreferenceError).toContain('canvases are unchanged');
    }
  });
  it('reports blocked storage honestly, keeping a usable session choice', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(loadModelPreferences().modelPreferenceError).toContain('unavailable');
    expect(
      saveModelPreferences(
        rememberModel(emptyModelPreferences(), { provider: 'google', model: 'gemini-2.5-flash' }),
      ),
    ).toContain('session');
  });
});
