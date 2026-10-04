import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { createApp } from '../server/app';
import viteConfig from '../vite.config';

const root = fileURLToPath(new URL('..', import.meta.url));
const servers: Server[] = [];
const proxies: ViteDevServer[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

async function setup(options: Parameters<typeof createApp>[0] = {}) {
  const directory = await mkdtemp('/tmp/opencode/branchboard-dev-proxy-');
  directories.push(directory);
  const configPath = `${directory}/providers.json`;
  const api = await listen(createServer(createApp({ ...options, configPath })));
  const config = viteConfig({ command: 'serve', mode: 'test' });
  const configuredProxy = config.server?.proxy?.['/api'];
  if (!configuredProxy) throw new Error('The development API proxy is missing.');
  // Exercise the real configuration, changing only its destination to our isolated API.
  // Preserve string shorthand too: its implicit Host rewrite caused this regression.
  const proxy = typeof configuredProxy === 'string' ? api : { ...configuredProxy, target: api };
  const vite = await createViteServer({
    configFile: false,
    root,
    cacheDir: `${directory}/vite-cache`,
    logLevel: 'silent',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      middlewareMode: true,
      hmr: false,
      watch: null,
      proxy: { '/api': proxy },
    },
  });
  proxies.push(vite);
  const frontend = await listen(createServer(vite.middlewares));
  return { frontend, configPath };
}

const post = (url: string, origin: string, body: unknown) =>
  fetch(`${url}/api/config`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('development API proxy origin protection', () => {
  it.each(['localhost', '127.0.0.1'])(
    'runs a bounded model test through the real %s proxy',
    async (hostname) => {
      let body: Record<string, unknown> = {};
      const upstream = await listen(
        createServer(async (request, response) => {
          const chunks = [];
          for await (const chunk of request) chunks.push(chunk);
          body = JSON.parse(Buffer.concat(chunks).toString());
          response.setHeader('Content-Type', 'text/event-stream');
          response.end(
            'data: {"choices":[{"delta":{"content":"Proxy response"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          );
        }),
      );
      const { frontend } = await setup({ apiKey: 'isolated-proxy-fixture', baseURL: upstream });
      const origin = new URL(frontend);
      origin.hostname = hostname;
      const response = await fetch(`${origin.origin}/api/providers/openai/test-model`, {
        method: 'POST',
        headers: { Origin: origin.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini' }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        status: 'passed',
        text: 'Proxy response',
        model: 'gpt-4o-mini',
      });
      expect(body).toMatchObject({ max_tokens: 128, model: 'gpt-4o-mini' });
    },
  );
  it.each(['localhost', '127.0.0.1'])(
    'saves, reloads and removes settings from the same %s browser origin',
    async (hostname) => {
      const { frontend, configPath } = await setup();
      const browser = new URL(frontend);
      browser.hostname = hostname;
      const origin = browser.origin;
      const secret = 'dev-proxy-test-secret';
      const saved = await post(origin, origin, {
        provider: 'openai',
        apiKey: secret,
        model: 'proxy-test-model',
      });
      expect(saved.status).toBe(200);
      const publicConfig = await saved.text();
      expect(publicConfig).not.toContain(secret);
      expect(JSON.parse(publicConfig).providers[0]).toMatchObject({
        configured: true,
        hasKey: true,
        defaultModel: 'proxy-test-model',
      });
      expect(JSON.parse(await readFile(configPath, 'utf8')).providers.openai.apiKey).toBe(secret);

      const restarted = await listen(createServer(createApp({ configPath })));
      const reloaded = await fetch(`${restarted}/api/config`, { headers: { Origin: restarted } });
      expect(reloaded.status).toBe(200);
      expect((await reloaded.json()).providers[0]).toMatchObject({
        hasKey: true,
        defaultModel: 'proxy-test-model',
      });

      const removed = await post(origin, origin, { provider: 'openai', apiKey: '' });
      expect(removed.status).toBe(200);
      expect((await removed.json()).providers[0].hasKey).toBe(false);
      expect(JSON.parse(await readFile(configPath, 'utf8')).providers.openai.apiKey).toBe('');
    },
  );

  it('rejects foreign hosts and ports through the proxy without writing settings', async () => {
    const { frontend, configPath } = await setup();
    const foreignPort = new URL(frontend);
    foreignPort.port = foreignPort.port === '3000' ? '3001' : '3000';
    for (const origin of ['https://untrusted.example', foreignPort.origin]) {
      const response = await post(frontend, origin, {
        provider: 'openai',
        apiKey: 'must-not-be-saved',
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Cross-origin requests are not allowed.' });
    }
    expect((await (await fetch(`${frontend}/api/config`)).json()).providers[0].hasKey).toBe(false);
    await expect(readFile(configPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
