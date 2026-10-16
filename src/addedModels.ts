import { create } from 'zustand';
import { isProviderId } from './providers';
import { validModelId } from './modelCatalog';
import type { ModelChoice } from './modelPreferences';
export const ADDED_MODELS_KEY = 'branchboard.added-models.v1';
export function validateAddedModels(input: unknown): ModelChoice[] {
  if (
    !Array.isArray(input) ||
    input.length > 500 ||
    !input.every((c) => c && isProviderId(c.provider) && validModelId(c.model))
  )
    throw Error('Invalid saved model IDs.');
  const seen = new Set<string>();
  return input.flatMap((c: ModelChoice) => {
    const model = c.model.trim(),
      key = `${c.provider}:${model}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ provider: c.provider, model }];
  });
}
function load() {
  try {
    const raw = localStorage.getItem(ADDED_MODELS_KEY);
    if (raw && raw.length > 300_000) throw Error();
    return { models: raw ? validateAddedModels(JSON.parse(raw)) : [], error: '' };
  } catch {
    return {
      models: [] as ModelChoice[],
      error: 'Saved model IDs could not be read. The original library has not been overwritten.',
    };
  }
}
export const useAddedModels = create<
  ReturnType<typeof load> & { add: (choice: ModelChoice) => boolean }
>((set, get) => ({
  ...load(),
  add: (choice) => {
    try {
      if (get().error.startsWith('Saved model IDs could not be read')) return false;
      const models = validateAddedModels([...get().models, choice]);
      localStorage.setItem(ADDED_MODELS_KEY, JSON.stringify(models));
      set({ models, error: '' });
      return true;
    } catch {
      set({
        error: 'This model ID could not be saved. Allow browser storage or free space, then retry.',
      });
      return false;
    }
  },
}));
