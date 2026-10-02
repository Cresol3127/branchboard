import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type AttachmentRef, type Settings } from "../types";
import { getAttachmentBlob, getAttachmentText } from "./assets";
import {
  ensureEndpointPermission,
  getProviderConfigError,
  getSelectedEndpointOrigin,
  joinEndpoint,
  listProviderModels,
  normalizeEndpoint,
  streamProvider,
  testSelectedModel,
  validateAttachmentsForProvider,
} from "./providers";

vi.mock("./assets", async () => {
  const actual = await vi.importActual<typeof import("./assets")>("./assets");
  return {
    ...actual,
    getAttachmentBlob: vi.fn(),
    getAttachmentText: vi.fn(),
  };
});

function settingsFor(provider: Settings["provider"]): Settings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.provider = provider;
  settings.providers[provider].apiKey = "test-key";
  settings.providers[provider].model = "test-model";
  return settings;
}

function streamedResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
  );
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(getAttachmentBlob).mockReset();
  vi.mocked(getAttachmentText).mockReset();
});

function attachment(
  kind: AttachmentRef["kind"],
  name: string,
  mimeType: string,
): AttachmentRef {
  return { id: `${kind}-id`, kind, name, mimeType, size: 4, createdAt: 1 };
}

describe("endpoint helpers", () => {
  it("normalizes HTTP endpoints and preserves base paths", () => {
    expect(normalizeEndpoint(" https://example.test/v1/// ")).toBe(
      "https://example.test/v1",
    );
    expect(joinEndpoint("https://example.test/v1/", "/models")).toBe(
      "https://example.test/v1/models",
    );
  });

  it.each([
    "ftp://example.test",
    "example.test",
    "https://user:pass@example.test",
    "https://example.test/v1?token=secret",
  ])("rejects unsafe endpoint %s", (endpoint) => {
    expect(() => normalizeEndpoint(endpoint)).toThrow(/HTTP\(S\)/);
  });

  it("validates only the active provider configuration", () => {
    const settings = settingsFor("local");
    settings.providers.local.apiKey = "";
    settings.providers.local.endpoint = "http://localhost:11434";
    expect(getProviderConfigError(settings)).toBeNull();
    settings.providers.local.model = "";
    expect(getProviderConfigError(settings)).toMatch(/Select a model/);
  });

  it("requests only the selected endpoint origin when needed", async () => {
    const request = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("chrome", { permissions: { request } });
    const settings = settingsFor("local");
    settings.providers.local.endpoint = "http://localhost:11434/v1";

    await expect(ensureEndpointPermission(settings)).resolves.toBe(true);
    expect(getSelectedEndpointOrigin(settings)).toBe("http://localhost:11434");
    expect(request).toHaveBeenCalledWith({ origins: ["http://localhost:11434/*"] });
  });

  it("skips extension permission APIs for Gemini", async () => {
    const request = vi.fn();
    vi.stubGlobal("chrome", { permissions: { request } });
    await expect(ensureEndpointPermission(settingsFor("gemini"))).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("attachment compatibility", () => {
  it("allows safe hybrid types and rejects unsupported files with provider context", () => {
    expect(() =>
      validateAttachmentsForProvider(settingsFor("anthropic"), [
        attachment("text", "notes.txt", "text/plain"),
        attachment("image", "chart.png", "image/png"),
        attachment("pdf", "report.pdf", "application/pdf"),
      ]),
    ).not.toThrow();
    expect(() =>
      validateAttachmentsForProvider(settingsFor("openai"), [
        attachment(
          "file",
          "forecast.xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
      ]),
    ).not.toThrow();
    expect(() =>
      validateAttachmentsForProvider(settingsFor("gemini"), [
        attachment("video", "clip.mp4", "video/mp4"),
        attachment("file", "audio.mp3", "audio/mpeg"),
      ]),
    ).not.toThrow();

    expect(() =>
      validateAttachmentsForProvider(settingsFor("local"), [
        attachment("pdf", "private.pdf", "application/pdf"),
      ]),
    ).toThrow("private.pdf is not supported by Local");
    expect(() =>
      validateAttachmentsForProvider(settingsFor("openai"), [
        attachment("file", "archive.zip", "application/zip"),
      ]),
    ).toThrow("archive.zip is not supported by OpenAI");
  });
});

describe("model discovery", () => {
  it("filters Gemini generation models and keeps the key out of the URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        models: [
          {
            name: "models/gemini-z",
            displayName: "Gemini Z",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/embed-only",
            supportedGenerationMethods: ["embedContent"],
          },
          {
            name: "models/gemini-a",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      }),
    );

    await expect(listProviderModels(settingsFor("gemini"))).resolves.toEqual([
      { id: "gemini-a" },
      { id: "gemini-z", name: "Gemini Z" },
    ]);
    expect(vi.mocked(fetch).mock.calls[0][0]).not.toContain("test-key");
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toEqual({
      "x-goog-api-key": "test-key",
    });
  });

  it("lists and sorts every OpenAI account model", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ data: [{ id: "z-model" }, { id: "a-model" }] }),
    );
    const signal = new AbortController().signal;

    await expect(listProviderModels(settingsFor("openai"), signal)).resolves.toEqual([
      { id: "a-model" },
      { id: "z-model" },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-key" },
        signal,
      }),
    );
  });

  it("uses Anthropic browser headers and display names", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ data: [{ id: "claude-test", display_name: "Claude Test" }] }),
    );

    await expect(listProviderModels(settingsFor("anthropic"))).resolves.toEqual([
      { id: "claude-test", name: "Claude Test" },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models?limit=1000",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        }),
      }),
    );
  });

  it("uses native Ollama tags and an optional local key", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ models: [{ name: "qwen:latest", model: "qwen:latest" }] }),
    );
    const settings = settingsFor("local");
    settings.providers.local.apiKey = "";
    settings.providers.local.endpoint = "http://localhost:11434/";

    await expect(listProviderModels(settings)).resolves.toEqual([
      { id: "qwen:latest", name: "qwen:latest" },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/tags",
      expect.objectContaining({ headers: {} }),
    );
  });

  it("loads the public Ollama Cloud catalog before a key is configured", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ models: [{ name: "cloud-model:latest" }] }),
    );
    const settings = settingsFor("ollama-cloud");
    settings.providers["ollama-cloud"].apiKey = "";

    await expect(listProviderModels(settings)).resolves.toEqual([
      { id: "cloud-model:latest", name: "cloud-model:latest" },
    ]);
  });

  it("surfaces JSON and text discovery errors", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "Denied" } }, 403));
    await expect(listProviderModels(settingsFor("openai"))).rejects.toThrow("Denied");

    fetchMock.mockResolvedValueOnce(new Response("Proxy unavailable", { status: 502 }));
    await expect(listProviderModels(settingsFor("openai"))).rejects.toThrow(
      "Proxy unavailable",
    );
  });
});

describe("provider streaming", () => {
  it("streams OpenAI SSE and sends system followed by neutral messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse([
        'data: {"model":"gpt-test","choices":[{"delta":{"content":"Hel',
        'lo"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"!"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":2,"total_tokens":10}}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    const received: string[] = [];

    await expect(
      streamProvider({
        settings: settingsFor("openai"),
        context: {
          systemInstruction: "Be useful.",
          messages: [{ role: "user", content: "Hi" }],
        },
        onText: (text) => received.push(text),
      }),
    ).resolves.toEqual({
      text: "Hello!",
      model: "gpt-test",
      usage: { inputTokens: 8, outputTokens: 2, totalTokens: 10 },
    });
    expect(received).toEqual(["Hello", "!"]);
    const request = vi.mocked(fetch).mock.calls[0];
    expect(request[0]).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(request[1]?.body)) as {
      messages: unknown[];
      stream_options: unknown;
    };
    expect(body.messages).toEqual([
      { role: "system", content: "Be useful." },
      { role: "user", content: "Hi" },
    ]);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("uses OpenAI Responses for binary input and parses split deltas and completed usage", async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValue(new Blob(["img"], { type: "image/png" }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse([
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hel',
        'lo"}\n\nevent: response.completed\ndata: {"type":"response.completed","response":{"model":"gpt-vision","usage":{"input_tokens":11,"output_tokens":2,"total_tokens":13}}}\n\n',
      ]),
    );
    const received: string[] = [];

    await expect(
      streamProvider({
        settings: settingsFor("openai"),
        context: {
          systemInstruction: "Inspect it.",
          messages: [
            {
              role: "user",
              content: "What is shown?",
              attachments: [attachment("image", "chart.png", "image/png")],
            },
          ],
        },
        onText: (text) => received.push(text),
      }),
    ).resolves.toEqual({
      text: "Hello",
      model: "gpt-vision",
      usage: { inputTokens: 11, outputTokens: 2, totalTokens: 13 },
    });
    expect(received).toEqual(["Hello"]);
    const request = vi.mocked(fetch).mock.calls[0];
    expect(request[0]).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(request[1]?.body)) as {
      instructions: string;
      input: Array<{ content: Array<Record<string, unknown>> }>;
    };
    expect(body.instructions).toBe("Inspect it.");
    expect(body.input[0].content).toEqual([
      { type: "input_text", text: "What is shown?" },
      { type: "input_image", image_url: "data:image/png;base64,aW1n" },
    ]);
  });

  it("keeps text attachments on Chat Completions as bounded labeled content", async () => {
    vi.mocked(getAttachmentText).mockResolvedValue("alpha\nbeta");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse(['data: {"choices":[{"delta":{"content":"OK"}}]}\n\n']),
    );

    await streamProvider({
      settings: settingsFor("openai"),
      context: {
        messages: [
          {
            role: "user",
            content: "Summarize.",
            attachments: [attachment("text", "notes.txt", "text/plain")],
          },
        ],
      },
      onText: () => undefined,
    });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[0].content).toContain(
      "[Attached text file: notes.txt]\nalpha\nbeta\n[End attached text file: notes.txt]",
    );
  });

  it("parses Anthropic deltas, ignores ping, and keeps system separate", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-test","usage":{"input_tokens":12,"output_tokens":1}}}\n\nevent: ping\ndata: {"type":"ping"}\n\nevent: content_block_',
        'delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\nevent: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":3}}\n\n',
      ]),
    );
    const settings = settingsFor("anthropic");

    await expect(
      streamProvider({
        settings,
        context: {
          systemInstruction: "System text",
          messages: [{ role: "user", content: "Test" }],
        },
        onText: () => undefined,
      }),
    ).resolves.toEqual({
      text: "Hi",
      model: "claude-test",
      usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
    });
    const request = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(request[1]?.body)) as Record<string, unknown>;
    expect(body.system).toBe("System text");
    expect(body.messages).toEqual([{ role: "user", content: "Test" }]);
  });

  it("sends Anthropic PDF document blocks", async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValue(
      new Blob(["pdf"], { type: "application/pdf" }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse([
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Read"}}\n\n',
      ]),
    );

    await streamProvider({
      settings: settingsFor("anthropic"),
      context: {
        messages: [
          {
            role: "user",
            content: "Review.",
            attachments: [attachment("pdf", "report.pdf", "application/pdf")],
          },
        ],
      },
      onText: () => undefined,
    });
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Review." },
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: "cGRm",
        },
      },
    ]);
  });

  it("omits empty Anthropic text blocks for attachment-only requests", async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValue(
      new Blob(["pdf"], { type: "application/pdf" }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse([
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Read"}}\n\n',
      ]),
    );

    await streamProvider({
      settings: settingsFor("anthropic"),
      context: {
        messages: [
          {
            role: "user",
            content: "",
            attachments: [attachment("pdf", "report.pdf", "application/pdf")],
          },
        ],
      },
      onText: () => undefined,
    });
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    expect(body.messages[0].content).toEqual([
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: "cGRm",
        },
      },
    ]);
  });

  it("parses Ollama NDJSON across chunks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse([
        '{"message":{"content":"one"}}\n{"message":{"con',
        'tent":" two"}}\r\n{"done":true,"model":"qwen-test","prompt_eval_count":9,"eval_count":4}',
      ]),
    );
    const received: string[] = [];

    await expect(
      streamProvider({
        settings: settingsFor("ollama-cloud"),
        context: { messages: [{ role: "user", content: "Hi" }] },
        onText: (text) => received.push(text),
      }),
    ).resolves.toEqual({
      text: "one two",
      model: "qwen-test",
      usage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 },
    });
    expect(received).toEqual(["one", " two"]);
    expect(fetch).toHaveBeenCalledWith(
      "https://ollama.com/api/chat",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });

  it("sends Ollama image bytes without a data URL prefix", async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValue(new Blob(["img"], { type: "image/png" }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse(['{"message":{"content":"Seen"}}\n']),
    );

    await streamProvider({
      settings: settingsFor("ollama-cloud"),
      context: {
        messages: [
          {
            role: "user",
            content: "Inspect.",
            attachments: [attachment("image", "photo.png", "image/png")],
          },
        ],
      },
      onText: () => undefined,
    });
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      messages: Array<{ images?: string[] }>;
    };
    expect(body.messages[0].images).toEqual(["aW1n"]);
  });

  it("preserves a local OpenAI-compatible base path without an empty bearer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse(['data: {"choices":[{"delta":{"content":"OK"}}]}\n\n']),
    );
    const settings = settingsFor("local");
    settings.providers.local.apiFormat = "openai-compatible";
    settings.providers.local.endpoint = "http://localhost:8080/v1/";
    settings.providers.local.apiKey = "";

    await testSelectedModel(settings);
    const request = vi.mocked(fetch).mock.calls[0];
    expect(request[0]).toBe("http://localhost:8080/v1/chat/completions");
    expect(request[1]?.headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(String(request[1]?.body)) as {
      messages: Array<{ content: string }>;
      stream_options?: unknown;
    };
    expect(body.messages).toEqual([{ role: "user", content: "Reply with OK." }]);
    expect(body.stream_options).toBeUndefined();
  });

  it("omits empty local OpenAI text parts for attachment-only requests", async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValue(new Blob(["img"], { type: "image/png" }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse(['data: {"choices":[{"delta":{"content":"Seen"}}]}\n\n']),
    );
    const settings = settingsFor("local");
    settings.providers.local.apiFormat = "openai-compatible";
    settings.providers.local.endpoint = "http://localhost:8080/v1";

    await streamProvider({
      settings,
      context: {
        messages: [
          {
            role: "user",
            content: "",
            attachments: [attachment("image", "photo.png", "image/png")],
          },
        ],
      },
      onText: () => undefined,
    });
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    expect(body.messages[0].content).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,aW1n" } },
    ]);
  });

  it("surfaces stream errors and rejects streams without text", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      streamedResponse(['data: {"error":{"message":"Rate limited"}}\n\n']),
    );
    await expect(
      streamProvider({
        settings: settingsFor("openai"),
        context: { messages: [{ role: "user", content: "Hi" }] },
        onText: () => undefined,
      }),
    ).rejects.toThrow("Rate limited");

    fetchMock.mockResolvedValueOnce(streamedResponse(["data: [DONE]\n\n"]));
    await expect(
      streamProvider({
        settings: settingsFor("openai"),
        context: { messages: [{ role: "user", content: "Hi" }] },
        onText: () => undefined,
      }),
    ).rejects.toThrow("OpenAI returned no text");
  });

  it("passes abort failures through unchanged", async () => {
    const abortError = new DOMException("Stopped", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    const promise = streamProvider({
      settings: settingsFor("openai"),
      context: { messages: [{ role: "user", content: "Hi" }] },
      signal: new AbortController().signal,
      onText: () => undefined,
    });
    await expect(promise).rejects.toBe(abortError);
  });
});
