import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../server/app';
import { sseData } from '../server/stream';

const servers: Server[] = [];
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
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
const chatBody = { messages: [{ role: 'user', content: 'A real transport test' }] };
const post = (url: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
describe('local AI API', () => {
  it('requires credentials, validates settings and never returns the key', async () => {
    const url = await listen(createServer(createApp()));
    expect((await post(`${url}/api/chat`, chatBody)).status).toBe(401);
    expect((await post(`${url}/api/config`, { apiKey: '' })).status).toBe(400);
    expect(await (await post(`${url}/api/config`, { apiKey: 'sk-private-test' })).json()).toMatchObject({
      configured: true,
      model: 'gpt-4o-mini',
    });
    const response = await fetch(`${url}/api/config`);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain('sk-private-test');
  });
  it('rejects cross-origin configuration requests', async () => {
    const url = await listen(createServer(createApp()));
    const response = await fetch(`${url}/api/config`, {
      method: 'POST',
      headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-test' }),
    });
    expect(response.status).toBe(403);
  });
  it('forwards model and history and relays real incremental upstream SSE', async () => {
    let received: unknown;
    let authorization = '';
    const provider = await listen(
      createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        received = JSON.parse(Buffer.concat(chunks).toString());
        authorization = req.headers.authorization || '';
        res.setHeader('Content-Type', 'text/event-stream');
        res.write('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n');
        setTimeout(
          () =>
            res.end(
              'data: {"choices":[{"delta":{"content":"world"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
            ),
          25,
        );
      }),
    );
    const url = await listen(
      createServer(createApp({ apiKey: 'sk-test', model: 'gpt-4o-mini', baseURL: provider })),
    );
    const response = await post(`${url}/api/chat`, chatBody);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const events = await Array.fromAsync(sseData(response.body!));
    expect(events.map((e) => JSON.parse(e))).toEqual([
      { token: 'Hello ' },
      { token: 'world' },
      { done: true },
    ]);
    expect(received).toEqual({ model: 'gpt-4o-mini', messages: chatBody.messages, stream: true });
    expect(authorization).toBe('Bearer sk-test');
  });
  it('shows provider errors instead of manufacturing responses', async () => {
    const provider = await listen(
      createServer((_req, res) => {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Quota exceeded' } }));
      }),
    );
    const url = await listen(createServer(createApp({ apiKey: 'sk-test', baseURL: provider })));
    const response = await post(`${url}/api/chat`, chatBody);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Quota exceeded' });
  });
  it('detects truncated streams and preserves preceding tokens', async () => {
    const provider = await listen(
      createServer((_req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.end('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n');
      }),
    );
    const url = await listen(createServer(createApp({ apiKey: 'sk-test', baseURL: provider })));
    const response = await post(`${url}/api/chat`, chatBody);
    const events = (await Array.fromAsync(sseData(response.body!))).map((e) => JSON.parse(e));
    expect(events[0]).toEqual({ token: 'Partial' });
    expect(events[1].error).toContain('disconnected');
  });
  it('validates history and times out unresponsive providers', async () => {
    const provider = await listen(createServer(() => {}));
    const url = await listen(
      createServer(createApp({ apiKey: 'sk-test', baseURL: provider, timeoutMs: 40 })),
    );
    expect(
      (await post(`${url}/api/chat`, { messages: [{ role: 'tool', content: 'bad' }] })).status,
    ).toBe(400);
    const response = await post(`${url}/api/chat`, chatBody);
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('timed out');
  });
});
