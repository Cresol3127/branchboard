import { validModelId } from './modelCatalog';
import type { ModelDiscoveryState } from './modelDiscovery';
import { isProviderId, type ProviderId, type PublicProvider } from './providers';

export const MODEL_PREFERENCES_KEY = 'branchboard.model-preferences.v1';
export const RECENT_MODEL_LIMIT = 5;
export type ModelChoice = { provider: ProviderId; model: string };
export type ModelPreferences = { version: 1; recent: ModelChoice[] };
export const emptyModelPreferences = (): ModelPreferences => ({ version: 1, recent: [] });

export function selectableProviders(providers: PublicProvider[], discovery: ModelDiscoveryState) {
  return providers.filter(
    (p) =>
      p.configured && (p.id === 'ollama' ? discovery[p.id]?.updatedAt !== undefined : p.hasKey),
  );
}

export function rememberModel(
  preferences: ModelPreferences,
  choice: ModelChoice,
): ModelPreferences {
  return {
    version: 1,
    recent: [
      choice,
      ...preferences.recent.filter(
        (item) => item.provider !== choice.provider || item.model !== choice.model,
      ),
    ].slice(0, RECENT_MODEL_LIMIT),
  };
}

export function loadModelPreferences(): {
  modelPreferences: ModelPreferences;
  modelPreferenceError: string;
} {
  try {
    const raw = localStorage.getItem(MODEL_PREFERENCES_KEY);
    if (!raw) return { modelPreferences: emptyModelPreferences(), modelPreferenceError: '' };
    if (raw.length > 16_384) throw new Error();
    const value = JSON.parse(raw);
    if (
      value?.version !== 1 ||
      !Array.isArray(value.recent) ||
      value.recent.length > RECENT_MODEL_LIMIT
    )
      throw new Error();
    let preferences = emptyModelPreferences();
    for (const item of [...value.recent].reverse()) {
      if (
        !isProviderId(item?.provider) ||
        typeof item.model !== 'string' ||
        !validModelId(item.model)
      )
        throw new Error();
      preferences = rememberModel(preferences, {
        provider: item.provider,
        model: item.model.trim(),
      });
    }
    return { modelPreferences: preferences, modelPreferenceError: '' };
  } catch {
    return {
      modelPreferences: emptyModelPreferences(),
      modelPreferenceError: 'Model history is unavailable. Your canvases are unchanged.',
    };
  }
}

export function saveModelPreferences(preferences: ModelPreferences): string {
  try {
    localStorage.setItem(MODEL_PREFERENCES_KEY, JSON.stringify(preferences));
    return '';
  } catch {
    return 'Model history could not be saved. This choice is available for this session.';
  }
}
