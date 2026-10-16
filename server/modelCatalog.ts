import {
  catalogProviderIds,
  validModelId,
  type CatalogEntry,
  type ModelCatalog,
} from '../src/modelCatalog';
import { MODEL_REFRESH_INTERVAL } from '../src/modelDiscovery';
import { latestGenerationModels, type GenerationModel } from '../src/modelGeneration';

const REGISTRY_URL = 'https://models.dev/api.json';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';
const MAX_BYTES = 12 * 1024 * 1024;
export type CatalogOptions = { fetcher?: typeof fetch; now?: () => number; timeoutMs?: number };

async function publicJSON(url: string, options: CatalogOptions) {
  // Fixed public URLs only. Never forward configured endpoints, keys, cookies, or workspace data.
  const response = await (options.fetcher ?? fetch)(url, {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Public catalog is unavailable.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('Public catalog is too large.');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function publicModelCatalog(options: CatalogOptions = {}) {
  const now = options.now ?? Date.now;
  let cached: ModelCatalog = { version: 2, providers: {} };
  let checkedAt: number | undefined;
  let pending: Promise<ModelCatalog> | undefined;
  return {
    get(force = false): Promise<ModelCatalog> {
      if (pending) return pending;
      // Also coalesce manual checks from several tabs for a short cooldown.
      if (checkedAt !== undefined && now() - checkedAt < (force ? 30_000 : MODEL_REFRESH_INTERVAL))
        return Promise.resolve(cached);
      pending = (async () => {
        const providers = { ...cached.providers };
        const errors: NonNullable<ModelCatalog['errors']> = {};
        let routerVerified = false;
        const [registry, router] = await Promise.allSettled([
          publicJSON(REGISTRY_URL, options),
          publicJSON(OPENROUTER_URL, options),
        ]);
        for (const id of catalogProviderIds) {
          try {
            if (registry.status !== 'fulfilled') throw new Error();
            const key = id === 'ollama_cloud' ? 'ollama-cloud' : id;
            const value = registry.value[key] as
              | {
                  models?: Record<string, GenerationModel>;
                }
              | undefined;
            if (!value?.models || typeof value.models !== 'object' || Array.isArray(value.models))
              throw new Error();
            const entries = Object.values(value.models);
            if (entries.length > 3000 || entries.some((m) => !m || !validModelId(m.id)))
              throw new Error();
            const models = latestGenerationModels(entries, now());
            if (id === 'openrouter') routerVerified = true;
            providers[id] = {
              models: [...new Set(models)].sort(),
              source: 'models.dev',
              updatedAt: now(),
            };
          } catch {
            errors[id] =
              'Models.dev could not be updated. Last verified recommendations and saved exact IDs remain available.';
          }
        }
        try {
          if (
            router.status !== 'fulfilled' ||
            !Array.isArray(router.value.data) ||
            router.value.data.length > 3000
          )
            throw new Error();
          // Without pagination parameters OpenRouter returns its complete public text-model list.
          const entries = router.value.data as {
            id?: unknown;
            architecture?: { input_modalities?: string[]; output_modalities?: string[] };
          }[];
          if (
            entries.some((m) => !m || !validModelId(m.id)) ||
            (router.value.links as { next?: unknown } | undefined)?.next
          )
            throw new Error();
          const listed = entries
            .filter(
              (m) =>
                Array.isArray(m.architecture?.input_modalities) &&
                m.architecture.input_modalities.includes('text') &&
                Array.isArray(m.architecture.output_modalities) &&
                m.architecture.output_modalities.includes('text'),
            )
            .map((m) => (m.id as string).trim());
          // Native listing timestamps are not generation dates. Only join IDs verified
          // by the same family policy; never replace them with an unfiltered native list.
          if (!routerVerified) throw new Error();
          const models = providers.openrouter!.models.filter((id) => listed.includes(id));
          const entry: CatalogEntry = {
            models: [...new Set(models)].sort(),
            source: 'openrouter',
            updatedAt: now(),
          };
          providers.openrouter = entry;
          delete errors.openrouter;
        } catch {
          errors.openrouter =
            'OpenRouter public catalog could not be updated. Using the last catalog or Models.dev when available.';
        }
        checkedAt = now();
        cached = { version: 2, providers, errors };
        return cached;
      })().finally(() => {
        pending = undefined;
      });
      return pending;
    },
  };
}
