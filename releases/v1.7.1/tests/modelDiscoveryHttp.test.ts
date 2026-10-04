import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../server/app';

const servers: Server[] = [];
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

describe('live model-list HTTP protocol', () => {
  it.each(['google', 'anthropic'] as const)(
    'reads every %s page with server-only authentication',
    async (provider) => {
      const paths: string[] = [];
      const upstream = await listen(
        createServer((req, res) => {
          paths.push(req.url!);
          expect(req.headers[provider === 'google' ? 'x-goog-api-key' : 'x-api-key']).toBe(
            'private-fixture-key',
          );
          expect(req.url).not.toContain('private-fixture-key');
          res.setHeader('Content-Type', 'application/json');
          const first = req.url === '/models';
          res.end(
            JSON.stringify(
              provider === 'google'
                ? {
                    models: [
                      {
                        name: `models/${first ? 'first' : 'latest'}`,
                        supportedGenerationMethods: ['generateContent'],
                      },
                    ],
                    ...(first ? { nextPageToken: 'next page' } : {}),
                  }
                : {
                    data: [{ id: first ? 'first' : 'latest' }],
                    has_more: first,
                    last_id: 'last/model',
                  },
            ),
          );
        }),
      );
      const url = await listen(
        createServer(
          createApp({
            providers: { [provider]: { apiKey: 'private-fixture-key', baseURL: upstream } },
          }),
        ),
      );
      const result = await (await fetch(`${url}/api/providers/${provider}/models`)).json();
      expect(result).toEqual({ models: ['first', 'latest'] });
      expect(paths).toEqual([
        '/models',
        provider === 'google' ? '/models?pageToken=next%20page' : '/models?after_id=last%2Fmodel',
      ]);
      const config = await (await fetch(`${url}/api/config`)).json();
      expect(JSON.stringify(config)).not.toContain('private-fixture-key');
    },
  );

  it('refreshes without a server restart and keeps successful/manual models on subsequent provider failure', async () => {
    let version = 1;
    let fail = false;
    const upstream = await listen(
      createServer((_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = fail ? 403 : 200;
        res.end(
          JSON.stringify(
            fail
              ? { error: { message: 'Rejected private-fixture-key' } }
              : { data: [{ id: `live-${version}` }] },
          ),
        );
      }),
    );
    const url = await listen(
      createServer(
        createApp({
          providers: {
            openai: {
              apiKey: 'private-fixture-key',
              baseURL: upstream,
              model: 'my-default',
              models: ['manual-model'],
            },
          },
        }),
      ),
    );
    const endpoint = `${url}/api/providers/openai/models`;
    expect(await (await fetch(endpoint)).json()).toEqual({ models: ['live-1'] });
    version++;
    expect(await (await fetch(endpoint)).json()).toEqual({ models: ['live-2'] });
    fail = true;
    const failed = await fetch(endpoint);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: 'Rejected [redacted]' });
    const config = await (await fetch(`${url}/api/config`)).json();
    expect(config.providers.find((p: { id: string }) => p.id === 'openai').models).toEqual([
      'live-2',
      'manual-model',
      'my-default',
    ]);
  });
});
