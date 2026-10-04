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
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    ),
  );
});
const post = (url: string, body: unknown, signal?: AbortSignal) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
describe('bounded real model test transport', () => {
  it.each([
    'anthropic',
    'google',
    'groq',
    'openrouter',
    'custom',
    'ollama',
    'ollama_cloud',
  ] as const)(
    'caps real %s adapter output without changing the selected model',
    async (provider) => {
      let body: Record<string, unknown> = {};
      const upstream = await listen(
        createServer(async (request, response) => {
          const chunks = [];
          for await (const chunk of request) chunks.push(chunk);
          body = JSON.parse(Buffer.concat(chunks).toString());
          response.setHeader('Content-Type', 'text/event-stream');
          response.end(
            provider === 'anthropic'
              ? 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Native reply"}}\n\ndata: {"type":"message_stop"}\n\n'
              : provider === 'google'
                ? 'data: {"candidates":[{"content":{"parts":[{"text":"Native reply"}]},"finishReason":"STOP"}]}\n\n'
                : provider.startsWith('ollama')
                  ? '{"message":{"content":"Native reply"},"done":true}\n'
                  : 'data: {"choices":[{"delta":{"content":"Native reply"},"finish_reason":"stop"}]}\n\n',
          );
        }),
      );
      const api = await listen(
        createServer(
          createApp({
            providers: {
              [provider]: {
                apiKey: 'fixture-native-key',
                baseURL: upstream,
                model: 'exact-native-model',
              },
            },
          }),
        ),
      );
      const result = await post(`${api}/api/providers/${provider}/test-model`, {
        model: 'exact-native-model',
      });
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({
        provider,
        model: 'exact-native-model',
        text: 'Native reply',
        status: 'passed',
      });
      if (provider === 'google') expect(body.generationConfig).toEqual({ maxOutputTokens: 128 });
      else if (provider.startsWith('ollama'))
        expect(body).toMatchObject({ model: 'exact-native-model', options: { num_predict: 128 } });
      else expect(body).toMatchObject({ model: 'exact-native-model', max_tokens: 128 });
    },
  );
  it('uses a fixed prompt, exact model, private saved key and output cap without canvas content', async () => {
    let body: Record<string, unknown> = {},
      authorization = '';
    const upstream = await listen(
      createServer(async (req, res) => {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        body = JSON.parse(Buffer.concat(chunks).toString());
        authorization = req.headers.authorization || '';
        res.setHeader('Content-Type', 'text/event-stream');
        res.end(
          'data: {"choices":[{"delta":{"content":"A real local response."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        );
      }),
    );
    const api = await listen(
      createServer(createApp({ apiKey: 'fixture-private-key', baseURL: upstream })),
    );
    const response = await post(`${api}/api/providers/openai/test-model`, { model: 'gpt-5-mini' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'passed',
      provider: 'openai',
      model: 'gpt-5-mini',
      text: 'A real local response.',
    });
    expect(authorization).toBe('Bearer fixture-private-key');
    expect(body).toMatchObject({ model: 'gpt-5-mini', max_completion_tokens: 128, stream: true });
    expect(body).not.toHaveProperty('max_tokens');
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: 'Reply with one short sentence confirming you can respond. Do not use tools.',
      },
    ]);
  });
  it('rejects missing credentials, arbitrary request fields and cross-origin requests', async () => {
    const api = await listen(createServer(createApp()));
    expect((await post(`${api}/api/providers/openai/test-model`, { model: 'any' })).status).toBe(
      401,
    );
    for (const body of [
      { model: 'any', messages: [] },
      { model: 'any', apiKey: 'override' },
      { model: '\n' },
      {},
    ])
      expect((await post(`${api}/api/providers/openai/test-model`, body)).status).toBe(400);
    expect(
      (
        await fetch(`${api}/api/providers/openai/test-model`, {
          method: 'POST',
          headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
          body: '{"model":"any"}',
        })
      ).status,
    ).toBe(403);
  });
  it('does not report empty or truncated model streams as success and redacts errors', async () => {
    let mode = 0;
    const upstream = await listen(
      createServer((_req, res) => {
        if (mode === 2) {
          res.writeHead(401);
          res.end('{"error":{"message":"invalid fixture-private-key"}}');
          return;
        }
        res.setHeader('Content-Type', 'text/event-stream');
        res.end(
          mode === 0
            ? 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
            : 'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
        );
      }),
    );
    const api = await listen(
      createServer(createApp({ apiKey: 'fixture-private-key', baseURL: upstream })),
    );
    for (mode = 0; mode < 3; mode++) {
      const response = await post(`${api}/api/providers/openai/test-model`, { model: 'any' });
      expect(response.status).toBe(502);
      const text = await response.text();
      expect(text).not.toContain('fixture-private-key');
      expect(text).toContain('error');
    }
  });
  it('limits simultaneous tests, times out and releases capacity', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const upstream = await listen(createServer(() => started()));
    const api = await listen(
      createServer(createApp({ apiKey: 'fixture-key', baseURL: upstream, timeoutMs: 100 })),
    );
    const running = post(`${api}/api/providers/openai/test-model`, { model: 'any' });
    await ready;
    expect((await post(`${api}/api/providers/openai/test-model`, { model: 'any' })).status).toBe(
      429,
    );
    const response = await running;
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('timed out');
    expect((await post(`${api}/api/providers/openai/test-model`, { model: 'any' })).status).toBe(
      502,
    );
  });
});
