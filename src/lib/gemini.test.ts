import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttachmentRef } from "../types";
import { getAttachmentBlob, getAttachmentText } from "./assets";
import { streamGemini } from "./gemini";

vi.mock("./assets", async () => {
  const actual = await vi.importActual<typeof import("./assets")>("./assets");
  return {
    ...actual,
    getAttachmentBlob: vi.fn(),
    getAttachmentText: vi.fn(),
  };
});

function streamedResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function attachment(
  kind: AttachmentRef["kind"],
  name: string,
  mimeType: string,
  size = 4,
): AttachmentRef {
  return { id: `${kind}-id`, kind, name, mimeType, size, createdAt: 1 };
}

describe("streamGemini", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getAttachmentBlob).mockReset();
    vi.mocked(getAttachmentText).mockReset();
  });

  it("parses SSE events split across network chunks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hel',
        'lo"}]}}]}\n\ndata: {"modelVersion":"gemini-test-001","usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":2,"totalTokenCount":9},"candidates":[{"content":{"parts":[{"text":" world"}]}}]}\n\n',
      ]),
    );
    const received: string[] = [];

    const result = await streamGemini({
      apiKey: "test-key",
      model: "gemini-test",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
      systemInstruction: "Be concise.",
      onText: (text) => received.push(text),
    });

    expect(result).toEqual({
      text: "Hello world",
      model: "gemini-test-001",
      usage: { inputTokens: 7, outputTokens: 2, totalTokens: 9 },
    });
    expect(received).toEqual(["Hello", " world"]);
    expect(fetch).toHaveBeenCalledWith(
      expect.not.stringContaining("test-key"),
      expect.objectContaining({
        headers: expect.objectContaining({ "x-goog-api-key": "test-key" }),
      }),
    );
    const request = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(request[1]?.body)) as {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      system_instruction: { parts: Array<{ text: string }> };
    };
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "Hi" }] },
      { role: "model", parts: [{ text: "Hello" }] },
    ]);
    expect(body.system_instruction.parts[0].text).toBe("Be concise.");
  });

  it("surfaces API error messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      streamGemini({
        apiKey: "bad-key",
        model: "gemini-test",
        messages: [{ role: "user", content: "Hi" }],
        onText: () => undefined,
      }),
    ).rejects.toThrow("Invalid API key");
  });

  it("inlines images and materializes labeled text attachments", async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValue(new Blob(["img"], { type: "image/png" }));
    vi.mocked(getAttachmentText).mockResolvedValue("reference text");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"OK"}]}}]}\n\n',
      ]),
    );

    await streamGemini({
      apiKey: "test-key",
      model: "gemini-test",
      messages: [
        {
          role: "user",
          content: "Inspect.",
          attachments: [
            attachment("text", "notes.txt", "text/plain"),
            attachment("image", "photo.png", "image/png"),
          ],
        },
      ],
      onText: () => undefined,
    });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };
    expect(body.contents[0].parts).toEqual([
      {
        text: "Inspect.\n\n[Attached text file: notes.txt]\nreference text\n[End attached text file: notes.txt]",
      },
      { inlineData: { mimeType: "image/png", data: "aW1n" } },
    ]);
  });

  it("omits empty text parts for attachment-only requests", async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValue(new Blob(["img"], { type: "image/png" }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse(['data: {"candidates":[{"content":{"parts":[{"text":"Seen"}]}}]}\n\n']),
    );

    await streamGemini({
      apiKey: "test-key",
      model: "gemini-test",
      messages: [
        {
          role: "user",
          content: "",
          attachments: [attachment("image", "photo.png", "image/png")],
        },
      ],
      onText: () => undefined,
    });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };
    expect(body.contents[0].parts).toEqual([
      { inlineData: { mimeType: "image/png", data: "aW1n" } },
    ]);
  });

  it("uploads videos resumably, polls processing, and never puts the key in a URL", async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValue(new Blob(["video"], { type: "video/mp4" }));
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        headers: { "x-goog-upload-url": "https://upload.example.test/session" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          file: {
            name: "files/video-id",
            uri: "https://generativelanguage.googleapis.com/v1beta/files/video-id",
            state: "PROCESSING",
          },
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: "files/video-id",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/video-id",
          state: "ACTIVE",
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(
      streamedResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Done"}]}}]}\n\n',
      ]),
    );

    await streamGemini({
      apiKey: "secret-key",
      model: "gemini-test",
      messages: [
        {
          role: "user",
          content: "Review.",
          attachments: [attachment("video", "clip.mp4", "video/mp4")],
        },
      ],
      onText: () => undefined,
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://generativelanguage.googleapis.com/upload/v1beta/files",
      "https://upload.example.test/session",
      "https://generativelanguage.googleapis.com/v1beta/files/video-id",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse",
    ]);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("secret-key"))).toBe(true);
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual(
      expect.objectContaining({ "x-goog-api-key": "secret-key" }),
    );
    expect(fetchMock.mock.calls[2][1]?.headers).toEqual({
      "x-goog-api-key": "secret-key",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[3][1]?.body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };
    expect(body.contents[0].parts[1]).toEqual({
      fileData: {
        mimeType: "video/mp4",
        fileUri: "https://generativelanguage.googleapis.com/v1beta/files/video-id",
      },
    });
  });

  it("rejects unsafe model path values", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(
      streamGemini({
        apiKey: "test-key",
        model: "../other-endpoint",
        messages: [{ role: "user", content: "Hi" }],
        onText: () => undefined,
      }),
    ).rejects.toThrow(/valid Gemini model/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
