export type SseEvent = {
  event?: string;
  data: string;
};

type ApiErrorPayload = {
  error?: string | { message?: string };
  message?: string;
};

function parseSseEvent(rawEvent: string): SseEvent | null {
  let event: string | undefined;
  const data: string[] = [];

  for (const line of rawEvent.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    if (field === "data") data.push(value);
  }

  return data.length || event ? { event, data: data.join("\n") } : null;
}

export async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeAvailableEvents = () => {
    while (true) {
      const match = /\r?\n\r?\n/.exec(buffer);
      if (!match || match.index === undefined) return;
      const rawEvent = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const event = parseSseEvent(rawEvent);
      if (event) onEvent(event);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    if (done) buffer += decoder.decode();
    consumeAvailableEvents();
    if (done) break;
  }

  if (buffer.trim()) {
    const event = parseSseEvent(buffer);
    if (event) onEvent(event);
  }
}

export async function consumeNdjson(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeLines = () => {
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const line = buffer.slice(0, newline).replace(/\r$/, "").trim();
      buffer = buffer.slice(newline + 1);
      if (line) onLine(line);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    if (done) buffer += decoder.decode();
    consumeLines();
    if (done) break;
  }

  const finalLine = buffer.trim();
  if (finalLine) onLine(finalLine);
}

export async function apiError(
  response: Response,
  providerLabel: string,
): Promise<Error> {
  const text = await response.text();
  let message = "";

  if (text) {
    try {
      const payload = JSON.parse(text) as ApiErrorPayload;
      message =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message ?? payload.message ?? "";
    } catch {
      message = text.trim();
    }
  }

  return new Error(message || `${providerLabel} returned ${response.status}.`);
}

export function parseJson<T>(text: string, providerLabel: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${providerLabel} returned invalid JSON.`);
  }
}
