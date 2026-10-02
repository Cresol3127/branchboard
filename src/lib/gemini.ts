import type { ChatContext, ChatMessage } from "./context";
import { getAttachmentBlob, getAttachmentText } from "./assets";
import type { ProviderStreamResult, ProviderTokenUsage } from "./metrics";
import { apiError, consumeSse, parseJson } from "./streaming";
import type { AttachmentRef } from "../types";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com";
const MAX_INLINE_BINARY_BYTES = 14 * 1024 * 1024;

type StreamGeminiOptions = ChatContext & {
  apiKey: string;
  model: string;
  signal?: AbortSignal;
  onText: (text: string) => void;
};

type GeminiStreamChunk = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
  modelVersion?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

type GeminiFile = {
  name?: string;
  uri?: string;
  state?: string;
  error?: { message?: string };
};

function textFromChunk(chunk: GeminiStreamChunk): string {
  return (
    chunk.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? ""
  );
}

export function normalizeGeminiModel(model: string): string {
  const normalizedModel = model.trim().replace(/^models\//, "");
  if (!normalizedModel || !/^[a-zA-Z0-9._-]+$/.test(normalizedModel)) {
    throw new Error("Enter a valid Gemini model name.");
  }
  return normalizedModel;
}

async function blobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function materializeMessageText(message: ChatMessage): Promise<string> {
  const attachments = message.attachments?.filter((attachment) => attachment.kind === "text");
  if (!attachments?.length) return message.content;
  const sections = await Promise.all(
    attachments.map(async (attachment) => {
      const text = await getAttachmentText(attachment);
      return `[Attached text file: ${attachment.name}]\n${text}\n[End attached text file: ${attachment.name}]`;
    }),
  );
  return [message.content, ...sections].filter(Boolean).join("\n\n");
}

function delayForFileProcessing(signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, 1000);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForGeminiFile(
  file: GeminiFile,
  apiKey: string,
  signal: AbortSignal | undefined,
  attachmentName: string,
): Promise<GeminiFile> {
  let current = file;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (current.error?.message) {
      throw new Error(`Gemini could not process ${attachmentName}: ${current.error.message}`);
    }
    if (current.state === "FAILED") throw new Error(`Gemini could not process ${attachmentName}.`);
    if (current.state !== "PROCESSING") return current;
    if (!current.name || !/^files\/[a-zA-Z0-9._-]+$/.test(current.name)) {
      throw new Error(`Gemini returned an invalid file reference for ${attachmentName}.`);
    }
    const response = await fetch(`${GEMINI_ENDPOINT}/v1beta/${current.name}`, {
      headers: { "x-goog-api-key": apiKey },
      signal,
    });
    if (!response.ok) throw await apiError(response, `Gemini file ${attachmentName}`);
    current = parseJson<GeminiFile>(await response.text(), `Gemini file ${attachmentName}`);
    if (current.state === "PROCESSING") await delayForFileProcessing(signal);
  }
  throw new Error(`Gemini timed out while processing ${attachmentName}.`);
}

async function uploadGeminiFile(
  attachment: AttachmentRef,
  blob: Blob,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<GeminiFile> {
  const start = await fetch(`${GEMINI_ENDPOINT}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(blob.size),
      "X-Goog-Upload-Header-Content-Type": attachment.mimeType,
    },
    body: JSON.stringify({ file: { display_name: attachment.name } }),
    signal,
  });
  if (!start.ok) throw await apiError(start, `Gemini file upload for ${attachment.name}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error(`Gemini did not provide an upload URL for ${attachment.name}.`);

  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": attachment.mimeType,
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: blob,
    signal,
  });
  if (!upload.ok) throw await apiError(upload, `Gemini file upload for ${attachment.name}`);
  const result = parseJson<{ file?: GeminiFile }>(
    await upload.text(),
    `Gemini file upload for ${attachment.name}`,
  );
  return waitForGeminiFile(result.file ?? {}, apiKey, signal, attachment.name);
}

async function geminiContents(
  messages: ChatMessage[],
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<Array<{ role: "user" | "model"; parts: GeminiPart[] }>> {
  let inlineBytes = 0;
  const contents: Array<{ role: "user" | "model"; parts: GeminiPart[] }> = [];
  for (const message of messages) {
    const parts: GeminiPart[] = [];
    const text = await materializeMessageText(message);
    if (text) parts.push({ text });
    for (const attachment of message.attachments ?? []) {
      if (attachment.kind === "text") continue;
      const blob = await getAttachmentBlob(attachment.id);
      const canInline =
        (attachment.kind === "image" || attachment.kind === "pdf") &&
        inlineBytes + blob.size <= MAX_INLINE_BINARY_BYTES;
      if (canInline) {
        inlineBytes += blob.size;
        parts.push({
          inlineData: { mimeType: attachment.mimeType, data: await blobBase64(blob) },
        });
      } else {
        const file = await uploadGeminiFile(attachment, blob, apiKey, signal);
        if (!file.uri) throw new Error(`Gemini returned no file URI for ${attachment.name}.`);
        parts.push({ fileData: { mimeType: attachment.mimeType, fileUri: file.uri } });
      }
    }
    contents.push({ role: message.role === "assistant" ? "model" : "user", parts });
  }
  return contents;
}

export async function streamGemini({
  apiKey,
  model,
  messages,
  systemInstruction,
  signal,
  onText,
}: StreamGeminiOptions): Promise<ProviderStreamResult> {
  if (!apiKey.trim()) throw new Error("Enter a Gemini API key.");
  const normalizedModel = normalizeGeminiModel(model);

  const endpoint = `${GEMINI_ENDPOINT}/v1beta/models/${normalizedModel}:streamGenerateContent?alt=sse`;
  const body: Record<string, unknown> = {
    contents: await geminiContents(messages, apiKey.trim(), signal),
    generationConfig: { temperature: 0.7 },
  };

  if (systemInstruction) {
    body.system_instruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey.trim(),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw await apiError(response, "Gemini");
  }

  if (!response.body) {
    throw new Error("Gemini returned an empty response stream.");
  }

  let completeText = "";
  let blockedReason = "";
  let responseModel = "";
  let usage: ProviderTokenUsage | undefined;

  await consumeSse(response.body, ({ event, data }) => {
    if (!data || data === "[DONE]") return;
    if (event === "error" && !data.trimStart().startsWith("{")) {
      throw new Error(data.trim());
    }
    const chunk = parseJson<GeminiStreamChunk>(data, "Gemini");
    if (chunk.error?.message) throw new Error(chunk.error.message);
    blockedReason = chunk.promptFeedback?.blockReason ?? blockedReason;
    responseModel = chunk.modelVersion?.trim() || responseModel;
    if (chunk.usageMetadata) {
      usage = {
        inputTokens: chunk.usageMetadata.promptTokenCount,
        outputTokens: chunk.usageMetadata.candidatesTokenCount,
        totalTokens: chunk.usageMetadata.totalTokenCount,
      };
    }
    const text = textFromChunk(chunk);
    if (text) {
      completeText += text;
      onText(text);
    }
  });
  if (!completeText) {
    throw new Error(
      blockedReason
        ? `Gemini blocked this request: ${blockedReason}.`
        : "Gemini returned no text.",
    );
  }

  return {
    text: completeText,
    ...(responseModel ? { model: responseModel } : {}),
    ...(usage ? { usage } : {}),
  };
}
