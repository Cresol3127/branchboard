import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app';
import { sseData } from '../server/stream';
import type { ProviderId } from '../src/providers';

const servers: Server[] = [];
const directories: string[] = [];
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
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
async function body(req: IncomingMessage) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}
const post = (url: string, data: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
const messages = [
  { role: 'system', content: 'Be precise.' },
  { role: 'user', content: 'Hello' },
];
const events = async (response: Response) =>
  (await Array.fromAsync(sseData(response.body!))).map((raw) => JSON.parse(raw));

describe('multi-provider routing', () => {
  it.each([
    {
      provider: 'openai',
      chunks: [
        { choices: [{ delta: { content: 'Reply' }, finish_reason: 'stop' }] },
        { choices: [], usage: { prompt_tokens: 120, completion_tokens: 15, total_tokens: 135 } },
      ],
    },
    {
      provider: 'anthropic',
      chunks: [
        {
          type: 'message_start',
          message: {
            usage: {
              input_tokens: 20,
              cache_read_input_tokens: 90,
              cache_creation_input_tokens: 10,
            },
          },
        },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Reply' } },
        { type: 'message_delta', usage: { output_tokens: 15 } },
        { type: 'message_stop' },
      ],
    },
    {
      provider: 'google',
      chunks: [
        {
          candidates: [{ content: { parts: [{ text: 'Reply' }] }, finishReason: 'STOP' }],
          usageMetadata: {
            promptTokenCount: 120,
            candidatesTokenCount: 10,
            thoughtsTokenCount: 5,
            totalTokenCount: 135,
          },
        },
      ],
    },
    {
      provider: 'ollama',
      chunks: [
        { message: { content: 'Reply' }, done: true, prompt_eval_count: 120, eval_count: 15 },
      ],
    },
  ])(
    'relays $provider usage through HTTP before the final done event',
    async ({ provider, chunks }) => {
      const upstream = await listen(
        createServer((_req, res) => {
          if (provider === 'ollama')
            res.end(chunks.map((chunk) => JSON.stringify(chunk)).join('\n') + '\n');
          else
            res.end(
              chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') +
                'data: [DONE]\n\n',
            );
        }),
      );
      const url = await listen(
        createServer(
          createApp({
            providers: {
              [provider]: { apiKey: 'test-only', baseURL: upstream },
            },
          }),
        ),
      );
      const received = await events(
        await post(`${url}/api/chat`, { provider, model: 'test', messages }),
      );
      expect(received).toEqual([
        { token: 'Reply' },
        { usage: { inputTokens: 120, outputTokens: 15, totalTokens: 135, source: 'provider' } },
        { done: true },
      ]);
    },
  );
  it.each<ProviderId>(['openai', 'openrouter', 'groq', 'custom'])(
    'routes %s using the chosen model and only its key',
    async (provider) => {
      let received: unknown;
      let authorization: string | undefined;
      let requestPath: string | undefined;
      const upstream = await listen(
        createServer(async (req, res) => {
          requestPath = req.url;
          authorization = req.headers.authorization;
          received = await body(req);
          res.end('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n');
        }),
      );
      const url = await listen(
        createServer(
          createApp({
            providers: {
              [provider]: { apiKey: 'selected-secret', baseURL: upstream, model: 'default' },
            },
          }),
        ),
      );
      expect(
        await events(await post(`${url}/api/chat`, { provider, model: 'chosen-model', messages })),
      ).toEqual([{ token: 'Hello' }, { done: true }]);
      expect(requestPath).toBe('/chat/completions');
      expect(authorization).toBe('Bearer selected-secret');
      expect(received).toEqual({
        model: 'chosen-model',
        messages,
        stream: true,
        ...(['openai', 'openrouter'].includes(provider)
          ? { stream_options: { include_usage: true } }
          : {}),
      });
    },
  );

  it('adapts Anthropic authentication, system prompts and native SSE deltas', async () => {
    let received: Record<string, unknown> = {};
    const upstream = await listen(
      createServer(async (req, res) => {
        expect(req.url).toBe('/messages');
        expect(req.headers['x-api-key']).toBe('anthropic-secret');
        expect(req.headers['anthropic-version']).toBe('2023-06-01');
        expect(req.headers.authorization).toBeUndefined();
        received = await body(req);
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude "}}\n\n',
        );
        setTimeout(
          () =>
            res.end(
              'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"works"}}\n\ndata: {"type":"message_stop"}\n\n',
            ),
          15,
        );
      }),
    );
    const url = await listen(
      createServer(
        createApp({ providers: { anthropic: { apiKey: 'anthropic-secret', baseURL: upstream } } }),
      ),
    );
    const response = await post(`${url}/api/chat`, {
      provider: 'anthropic',
      model: 'claude-test',
      messages,
    });
    expect(await events(response)).toEqual([
      { token: 'Claude ' },
      { token: 'works' },
      { done: true },
    ]);
    expect(received).toEqual({
      model: 'claude-test',
      max_tokens: 8192,
      system: 'Be precise.',
      messages: [messages[1]],
      stream: true,
    });
  });

  it('adapts Google roles and native streamed text without exposing the key in URLs', async () => {
    let received: unknown;
    const upstream = await listen(
      createServer(async (req, res) => {
        expect(req.url).toBe('/models/gemini-test:streamGenerateContent?alt=sse');
        expect(req.headers['x-goog-api-key']).toBe('google-secret');
        received = await body(req);
        res.end(
          'data: {"candidates":[{"content":{"parts":[{"text":"hidden","thought":true},{"text":"Gemini "}]}}]}\n\ndata: {"candidates":[{"content":{"parts":[{"text":"works"}]},"finishReason":"STOP"}]}\n\n',
        );
      }),
    );
    const url = await listen(
      createServer(
        createApp({ providers: { google: { apiKey: 'google-secret', baseURL: upstream } } }),
      ),
    );
    expect(
      await events(
        await post(`${url}/api/chat`, {
          provider: 'google',
          model: 'gemini-test',
          messages: [...messages, { role: 'assistant', content: 'Hi' }],
        }),
      ),
    ).toEqual([{ token: 'Gemini ' }, { token: 'works' }, { done: true }]);
    expect(received).toEqual({
      systemInstruction: { parts: [{ text: 'Be precise.' }] },
      contents: [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi' }] },
      ],
    });
  });

  it('streams native Ollama NDJSON without an API key', async () => {
    const upstream = await listen(
      createServer(async (req, res) => {
        expect(req.url).toBe('/api/chat');
        expect(req.headers.authorization).toBeUndefined();
        expect(await body(req)).toEqual({ model: 'llama-local', messages, stream: true });
        const bytes = Buffer.from(
          '{"message":{"content":"Local 🌿"},"done":false}\r\n{"message":{"content":" works"},"done":true}',
        );
        res.write(bytes.subarray(0, 32));
        setTimeout(() => res.end(bytes.subarray(32)), 10);
      }),
    );
    const url = await listen(
      createServer(createApp({ providers: { ollama: { baseURL: upstream } } })),
    );
    expect(
      await events(
        await post(`${url}/api/chat`, { provider: 'ollama', model: 'llama-local', messages }),
      ),
    ).toEqual([{ token: 'Local 🌿' }, { token: ' works' }, { done: true }]);
  });

  it.each<ProviderId>(['anthropic', 'google', 'ollama'])(
    'preserves partial %s output on an interrupted stream without fallback',
    async (provider) => {
      let calls = 0;
      const upstream = await listen(
        createServer((_req, res) => {
          calls++;
          res.end(
            provider === 'anthropic'
              ? 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Partial"}}\n\n'
              : provider === 'google'
                ? 'data: {"candidates":[{"content":{"parts":[{"text":"Partial"}]}}]}\n\n'
                : '{"message":{"content":"Partial"},"done":false}\n',
          );
        }),
      );
      const url = await listen(
        createServer(
          createApp({ providers: { [provider]: { apiKey: 'secret', baseURL: upstream } } }),
        ),
      );
      const result = await events(
        await post(`${url}/api/chat`, { provider, model: 'test-model', messages }),
      );
      expect(result[0]).toEqual({ token: 'Partial' });
      expect(result[1].error).toContain('disconnected');
      expect(calls).toBe(1);
    },
  );

  it('reports native API errors and redacts echoed credentials', async () => {
    const upstream = await listen(
      createServer((_req, res) =>
        res.end('data: {"type":"error","error":{"message":"Invalid key private-secret"}}\n\n'),
      ),
    );
    const url = await listen(
      createServer(
        createApp({ providers: { anthropic: { apiKey: 'private-secret', baseURL: upstream } } }),
      ),
    );
    const response = await post(`${url}/api/chat`, {
      provider: 'anthropic',
      model: 'claude-test',
      messages,
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Invalid key [redacted]' });
  });
});

describe('provider settings and discovery', () => {
  it('persists edits/removals across restarts, keeps secrets private, and uses private permissions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'branchboard-providers-'));
    directories.push(directory);
    const configPath = `${directory}/settings.json`;
    const url = await listen(
      createServer(createApp({ configPath, providers: { anthropic: { apiKey: 'env-secret' } } })),
    );
    const save = await post(`${url}/api/config`, {
      provider: 'custom',
      apiKey: 'custom-secret',
      baseURL: 'http://localhost:1234/v1/',
      model: 'my-model',
      models: ['extra-model'],
    });
    expect(save.status).toBe(200);
    expect(await save.text()).not.toContain('custom-secret');
    if (process.platform !== 'win32') {
      expect((await stat(configPath)).mode & 0o777).toBe(0o600);
    }
    const restarted = await listen(createServer(createApp({ configPath })));
    let config = await (await fetch(`${restarted}/api/config`)).json();
    expect(config.providers.find((p: { id: string }) => p.id === 'custom')).toMatchObject({
      configured: true,
      baseURL: 'http://localhost:1234/v1',
      defaultModel: 'my-model',
      models: ['extra-model', 'my-model'],
    });
    await post(`${restarted}/api/config`, { provider: 'anthropic', apiKey: '' });
    const third = await listen(
      createServer(createApp({ configPath, providers: { anthropic: { apiKey: 'env-secret' } } })),
    );
    config = await (await fetch(`${third}/api/config`)).json();
    expect(config.providers.find((p: { id: string }) => p.id === 'anthropic').configured).toBe(
      false,
    );
    expect(JSON.stringify(config)).not.toMatch(/custom-secret|env-secret/);
    expect(JSON.parse(await readFile(configPath, 'utf8')).providers.custom.apiKey).toBe(
      'custom-secret',
    );
  });

  it('does not overwrite invalid saved config or apply settings when saving fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'branchboard-providers-'));
    directories.push(directory);
    const configPath = `${directory}/settings.json`;
    await writeFile(configPath, 'not valid JSON');
    expect(() => createApp({ configPath })).toThrow('Provider config could not be read');
    expect(await readFile(configPath, 'utf8')).toBe('not valid JSON');
    const url = await listen(
      createServer(createApp({ configPath: `${directory}/missing/settings.json` })),
    );
    expect(
      (await post(`${url}/api/config`, { provider: 'openai', apiKey: 'not-saved' })).status,
    ).toBe(400);
    expect((await (await fetch(`${url}/api/config`)).json()).providers[0].configured).toBe(false);
  });

  it.each<ProviderId>(['openai', 'anthropic', 'google', 'openrouter', 'groq', 'ollama', 'custom'])(
    'discovers %s models with the native endpoint and auth',
    async (provider) => {
      const upstream = await listen(
        createServer((req, res) => {
          expect(req.url).toBe(provider === 'ollama' ? '/api/tags' : '/models');
          if (provider === 'anthropic') expect(req.headers['x-api-key']).toBe('secret');
          else if (provider === 'google') expect(req.headers['x-goog-api-key']).toBe('secret');
          else if (provider !== 'ollama') expect(req.headers.authorization).toBe('Bearer secret');
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify(
              provider === 'ollama'
                ? { models: [{ name: 'installed:latest' }] }
                : provider === 'google'
                  ? {
                      models: [
                        {
                          name: 'models/discovered',
                          supportedGenerationMethods: ['generateContent'],
                        },
                        { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] },
                      ],
                    }
                  : { data: [{ id: 'discovered' }] },
            ),
          );
        }),
      );
      const url = await listen(
        createServer(
          createApp({
            providers: {
              [provider]: {
                apiKey: provider === 'ollama' ? '' : 'secret',
                baseURL: upstream,
                model: 'default',
                models: ['extended'],
              },
            },
          }),
        ),
      );
      const result = await (await fetch(`${url}/api/providers/${provider}/models`)).json();
      expect(result).toEqual({
        models: [provider === 'ollama' ? 'installed:latest' : 'discovered'],
      });
      const config = await (await fetch(`${url}/api/config`)).json();
      expect(config.providers.find((p: { id: string }) => p.id === provider).models).toEqual([
        provider === 'ollama' ? 'installed:latest' : 'discovered',
        'extended',
        'default',
      ]);
    },
  );

  it('tests an unsaved Ollama URL through /api/tags without persisting it', async () => {
    const upstream = await listen(
      createServer((req, res) => {
        expect(req.url).toBe('/api/tags');
        res.end('{"models":[{"name":"llama3.2:latest"}]}');
      }),
    );
    const url = await listen(createServer(createApp()));
    expect(
      await (await post(`${url}/api/providers/ollama/test`, { baseURL: upstream })).json(),
    ).toEqual({ connected: true, models: ['llama3.2:latest'] });
    const config = await (await fetch(`${url}/api/config`)).json();
    expect(config.providers.find((p: { id: string }) => p.id === 'ollama').baseURL).toBe(
      'http://localhost:11434',
    );
  });

  it('rejects unknown providers, invalid settings, unsafe credential URLs and missing keys', async () => {
    const url = await listen(createServer(createApp()));
    for (const patch of [
      { provider: 'unknown', apiKey: 'x' },
      { provider: 'openai', baseURL: 'file:///secrets' },
      { provider: 'custom', baseURL: 'http://key:secret@localhost/v1' },
      { provider: 'custom', baseURL: 'http://localhost/v1?apiKey=secret' },
      { provider: 'openai', models: [3] },
    ]) {
      expect((await post(`${url}/api/config`, patch)).status).toBe(400);
    }
    expect((await fetch(`${url}/api/providers/anthropic/models`)).status).toBe(401);
    expect(
      (await post(`${url}/api/chat`, { provider: 'unknown', model: 'test', messages })).status,
    ).toBe(400);
    expect(
      (await post(`${url}/api/chat`, { provider: 'google', model: 'test', messages })).status,
    ).toBe(401);
  });
});
