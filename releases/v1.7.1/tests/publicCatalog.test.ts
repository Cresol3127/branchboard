import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { publicModelCatalog } from '../server/modelCatalog';
import { createApp } from '../server/app';
import { catalogProviderIds } from '../src/modelCatalog';
import { MODEL_REFRESH_INTERVAL } from '../src/modelDiscovery';

const textModel = (id: string, extra = {}) => ({
  id,
  modalities: { input: ['text'], output: ['text'] },
  ...extra,
});
const registry = () =>
  Object.fromEntries(
    catalogProviderIds.map((id) => [
      id === 'ollama_cloud' ? 'ollama-cloud' : id,
      {
        models: {
          current: textModel(`${id}-new`),
          duplicate: textModel(`${id}-new`),
          old: textModel('retired', { status: 'deprecated' }),
          embedding: textModel('embedding', { type: 'embedding' }),
          image: { id: 'image', modalities: { input: ['text'], output: ['image'] } },
        },
      },
    ]),
  );
const router = {
  data: [
    {
      id: 'provider/current',
      architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    },
    {
      id: 'provider/picture',
      architecture: { input_modalities: ['text'], output_modalities: ['image'] },
    },
  ],
  links: { next: null },
};
const successfulFetch = () =>
  vi.fn<typeof fetch>(async (url) =>
    Response.json(String(url).includes('models.dev') ? registry() : router),
  );

describe('keyless public model catalog', () => {
  it('uses only fixed unauthenticated public sources, filters non-chat/retired entries and maps provider IDs exactly', async () => {
    const fetcher = successfulFetch();
    const service = publicModelCatalog({ fetcher });
    const result = await service.get();
    expect(result.providers.openai?.models).toEqual(['openai-new']);
    expect(result.providers.ollama_cloud?.models).toEqual(['ollama_cloud-new']);
    expect(result.providers.openrouter).toMatchObject({
      models: ['provider/current'],
      source: 'openrouter',
    });
    expect(result.errors).toEqual({});
    expect(result.providers).not.toHaveProperty('ollama');
    expect(result.providers).not.toHaveProperty('custom');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://models.dev/api.json',
      'https://openrouter.ai/api/v1/models',
    ]);
    for (const [, options] of fetcher.mock.calls) {
      expect(options?.headers).toEqual({ Accept: 'application/json' });
      expect(options?.credentials).toBe('omit');
      expect(options?.redirect).toBe('error');
    }
  });

  it('deduplicates requests, caches automatic checks and bounds manual refresh frequency', async () => {
    let now = 100;
    const fetcher = successfulFetch();
    const service = publicModelCatalog({ fetcher, now: () => now });
    const [first, second] = await Promise.all([service.get(), service.get(true)]);
    expect(first).toBe(second);
    await service.get();
    await service.get(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    now += 30_000;
    await service.get(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
    now += MODEL_REFRESH_INTERVAL;
    await service.get();
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it('keeps last successful lists and timestamps through failures without hiding partial source errors', async () => {
    let now = 100;
    const fetcher = successfulFetch();
    const service = publicModelCatalog({ fetcher, now: () => now });
    const original = await service.get();
    now += MODEL_REFRESH_INTERVAL;
    fetcher.mockResolvedValue(new Response('offline', { status: 503 }));
    const failed = await service.get();
    expect(failed.providers).toEqual(original.providers);
    expect(Object.keys(failed.errors!)).toHaveLength(6);
    now += MODEL_REFRESH_INTERVAL;
    fetcher.mockImplementation(async (url) =>
      String(url).includes('models.dev')
        ? Response.json(registry())
        : new Response('offline', { status: 503 }),
    );
    const partial = await service.get();
    expect(partial.providers.openrouter?.source).toBe('models.dev');
    expect(Object.keys(partial.errors!)).toEqual(['openrouter']);
  });

  it('rejects invalid, unexpectedly paginated and oversized upstream data safely', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).includes('models.dev')
        ? new Response('x'.repeat(12 * 1024 * 1024 + 1))
        : Response.json({ ...router, links: { next: 'https://untrusted.example' } }),
    );
    const result = await publicModelCatalog({ fetcher }).get();
    expect(result.providers).toEqual({});
    expect(Object.keys(result.errors!)).toHaveLength(6);
    expect(fetcher).toHaveBeenCalledTimes(2); // Never follows remote pagination/redirect URLs.
  });

  it('exposes a same-origin keyless HTTP route and never passes saved credentials upstream', async () => {
    const fetcher = successfulFetch();
    const server = createServer(createApp({ apiKey: 'private-test-key', catalog: { fetcher } }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const forbidden = await fetch(`${url}/api/models/catalog`, {
        headers: { Origin: 'https://untrusted.example' },
      });
      expect(forbidden.status).toBe(403);
      expect(fetcher).not.toHaveBeenCalled();
      const response = await fetch(`${url}/api/models/catalog`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await response.json()).providers.openai.models).toEqual(['openai-new']);
      expect(JSON.stringify(fetcher.mock.calls)).not.toContain('private-test-key');
      const noKey = createServer(createApp({ catalog: { fetcher } }));
      await new Promise<void>((resolve) => noKey.listen(0, '127.0.0.1', resolve));
      try {
        const response = await fetch(
          `http://127.0.0.1:${(noKey.address() as { port: number }).port}/api/models/catalog`,
        );
        expect(response.status).toBe(200);
      } finally {
        noKey.closeAllConnections();
        await new Promise<void>((resolve) => noKey.close(() => resolve()));
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
