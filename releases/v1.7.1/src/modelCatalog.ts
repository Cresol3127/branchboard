import type { ProviderId, PublicProvider } from './providers';
import { MODEL_REFRESH_INTERVAL, type ModelDiscovery } from './modelDiscovery';

export const catalogProviderIds = [
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'groq',
  'ollama_cloud',
] as const satisfies readonly ProviderId[];
export type CatalogProviderId = (typeof catalogProviderIds)[number];
export const catalogSources = {
  'models.dev': { name: 'Models.dev', url: 'https://models.dev' },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/models' },
} as const;
export type CatalogEntry = {
  models: string[];
  source: keyof typeof catalogSources;
  updatedAt: number;
};
export type ModelCatalog = {
  version: 1;
  providers: Partial<Record<CatalogProviderId, CatalogEntry>>;
  errors?: Partial<Record<CatalogProviderId, string>>;
};
export type ModelCatalogState = ModelCatalog & ModelDiscovery & { cacheError?: string };
export const MODEL_CATALOG_STORAGE_KEY = 'branchboard.model-catalog.v1';
export const validModelId = (value: unknown): value is string =>
  typeof value === 'string' &&
  Boolean(value.trim()) &&
  value.length <= 512 &&
  !/[\r\n\x00]/.test(value);
export const hasPublicCatalog = (id: ProviderId): id is CatalogProviderId =>
  (catalogProviderIds as readonly string[]).includes(id);

/** Treat public data and the disposable browser cache as untrusted input. */
export function validateModelCatalog(input: unknown): ModelCatalog {
  if (!input || typeof input !== 'object') throw new Error('Invalid public model catalog.');
  const value = input as ModelCatalog;
  if (
    value.version !== 1 ||
    !value.providers ||
    typeof value.providers !== 'object' ||
    Array.isArray(value.providers)
  )
    throw new Error('Invalid public model catalog.');
  const providers: ModelCatalog['providers'] = {};
  const errors: NonNullable<ModelCatalog['errors']> = {};
  for (const id of catalogProviderIds) {
    const entry = value.providers[id];
    if (entry !== undefined) {
      if (
        !entry ||
        !Array.isArray(entry.models) ||
        entry.models.length > 3000 ||
        !entry.models.every(validModelId) ||
        !Object.hasOwn(catalogSources, entry.source) ||
        !Number.isSafeInteger(entry.updatedAt) ||
        entry.updatedAt < 0 ||
        entry.updatedAt > Date.now() + 60_000
      )
        throw new Error('Invalid public model catalog.');
      providers[id] = {
        models: [...new Set(entry.models.map((m) => m.trim()))].sort(),
        source: entry.source,
        updatedAt: entry.updatedAt,
      };
    }
    if (value.errors?.[id] !== undefined) {
      if (typeof value.errors[id] !== 'string' || value.errors[id]!.length > 500)
        throw new Error('Invalid public model catalog status.');
      errors[id] = value.errors[id];
    }
  }
  return { version: 1, providers, errors };
}

export function loadModelCatalog(): ModelCatalogState {
  try {
    const saved = localStorage.getItem(MODEL_CATALOG_STORAGE_KEY);
    if (saved && saved.length <= 2 * 1024 * 1024) {
      const result = validateModelCatalog(JSON.parse(saved));
      const times = Object.values(result.providers).map((entry) => entry.updatedAt);
      return {
        ...result,
        loading: false,
        checkedAt: times.length ? Math.min(...times) : undefined,
      };
    }
  } catch {
    /* A broken cache must never affect workspace recovery or startup. */
  }
  return { version: 1, providers: {}, loading: false };
}

export function catalogIsStale(state: ModelCatalogState, now = Date.now()) {
  return (
    !state.loading &&
    (state.checkedAt === undefined || now - state.checkedAt >= MODEL_REFRESH_INTERVAL)
  );
}

export function catalogModelChoices(
  provider: PublicProvider,
  catalog: ModelCatalogState,
  discovery?: ModelDiscovery,
) {
  const entry = hasPublicCatalog(provider.id) ? catalog.providers[provider.id] : undefined;
  return [
    ...new Set([
      ...(entry?.models ?? provider.models),
      ...(entry && discovery?.updatedAt ? provider.models : []),
      ...provider.extraModels,
      ...(provider.defaultModel ? [provider.defaultModel] : []),
    ]),
  ].sort();
}

export function catalogLabel(state: ModelCatalogState, id: CatalogProviderId) {
  const entry = state.providers[id];
  const source = entry ? catalogSources[entry.source].name : 'Public catalog';
  const time = entry
    ? ` · Updated ${new Date(entry.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';
  if (state.loading) return 'Checking public catalog…';
  if (state.error || state.errors?.[id])
    return `Update failed — cached / suggested list kept · ${source}${time}`;
  return entry
    ? `${source}${time} · No key needed`
    : 'Public catalog not checked · Suggested / saved IDs';
}
