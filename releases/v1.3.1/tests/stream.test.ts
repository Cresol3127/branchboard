import { expect, it } from 'vitest';
import { sseData } from '../server/stream';

async function parse(chunks: Uint8Array[]) {
  return Array.fromAsync(
    sseData(
      new ReadableStream({
        start(c) {
          chunks.forEach((chunk) => c.enqueue(chunk));
          c.close();
        },
      }),
    ),
  );
}
it('parses SSE across every byte boundary, including split UTF-8 and CRLF', async () => {
  const bytes = new TextEncoder().encode(
    ': heartbeat\r\ndata: {"token":"hello 🌱"}\r\n\r\ndata: [DONE]\r\n\r\n',
  );
  expect(await parse([...bytes].map((byte) => Uint8Array.of(byte)))).toEqual([
    '{"token":"hello 🌱"}',
    '[DONE]',
  ]);
});
it('joins multiline SSE data and handles a final unterminated event', async () => {
  expect(await parse([new TextEncoder().encode('data: one\ndata: two\n\ndata: last')])).toEqual([
    'one\ntwo',
    'last',
  ]);
});
it('cancels the underlying stream when the consumer leaves early', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('data: first\n\n'));
    },
    cancel() {
      cancelled = true;
    },
  });
  for await (const value of sseData(stream)) {
    expect(value).toBe('first');
    break;
  }
  expect(cancelled).toBe(true);
});
