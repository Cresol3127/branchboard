/** Parse SSE across arbitrary network and UTF-8 boundaries. */
export async function* sseData(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
      }
      if (done) break;
    }
    if (buffer.startsWith('data:')) yield buffer.slice(5).trim();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Ollama's native API emits newline-delimited JSON, not SSE. */
export async function* jsonLines(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (line) yield line;
      }
      if (done) break;
    }
    if (buffer.trim()) yield buffer.trim();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
