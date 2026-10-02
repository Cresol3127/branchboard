import type { ChatContext, ChatMessage } from "./context";
import { streamGemini } from "./gemini";
import { getAttachmentBlob, getAttachmentText } from "./assets";
import type { ProviderStreamResult, ProviderTokenUsage } from "./metrics";
import { apiError, consumeNdjson, consumeSse, parseJson } from "./streaming";
import type { AttachmentRef, ProviderConfig, ProviderId, Settings } from "../types";

export type ProviderModel = { id: string; name?: string };

export type StreamProviderOptions = {
  settings: Settings;
  context: ChatContext;
  signal?: AbortSignal;
  onText: (text: string) => void;
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
  "ollama-cloud": "Ollama Cloud",
  local: "Local",
};

const OPENAI_ENDPOINT = "https://api.openai.com/v1";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com";
const OLLAMA_CLOUD_ENDPOINT = "https://ollama.com";

const OPENAI_FILE_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "odt",
  "ppt",
  "pptx",
  "rtf",
  "xls",
  "xlsx",
]);

const GEMINI_FILE_MIME_TYPES = new Set([
  "audio/aac",
  "audio/flac",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/ogg",
  "audio/opus",
  "audio/pcm",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

export function getProviderLabel(provider: ProviderId): string {
  return PROVIDER_LABELS[provider];
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function validateAttachmentsForProvider(
  settings: Settings,
  attachments: readonly AttachmentRef[],
): void {
  const provider = settings.provider;
  const label = getProviderLabel(provider);

  for (const attachment of attachments) {
    let supported = attachment.kind === "text";
    if (attachment.kind === "image") supported = true;
    if (attachment.kind === "pdf") {
      supported = provider === "gemini" || provider === "openai" || provider === "anthropic";
    }
    if (attachment.kind === "video") supported = provider === "gemini";
    if (attachment.kind === "file") {
      supported =
        (provider === "openai" && OPENAI_FILE_EXTENSIONS.has(extensionOf(attachment.name))) ||
        (provider === "gemini" && GEMINI_FILE_MIME_TYPES.has(attachment.mimeType.toLowerCase()));
    }
    if (!supported) {
      throw new Error(`${attachment.name} is not supported by ${label}.`);
    }
  }
}

export function getActiveProviderConfig(
  settings: Settings,
): Settings["providers"][ProviderId] {
  return settings.providers[settings.provider];
}

export function getActiveModel(settings: Settings): string {
  return getActiveProviderConfig(settings).model.trim();
}

export function getProviderConfigError(
  settings: Settings,
  requireModel = true,
): string | null {
  const config = getActiveProviderConfig(settings);
  const label = getProviderLabel(settings.provider);

  if (settings.provider !== "local" && !config.apiKey.trim()) {
    return `Enter an API key for ${label}.`;
  }
  if (settings.provider === "local") {
    try {
      normalizeEndpoint(settings.providers.local.endpoint);
    } catch (error) {
      return error instanceof Error ? error.message : "Enter a valid local endpoint.";
    }
  }
  if (requireModel && !config.model.trim()) {
    return `Select a model for ${label}.`;
  }
  return null;
}

export function validateProviderConfig(
  settings: Settings,
  requireModel = true,
): void {
  const error = getProviderConfigError(settings, requireModel);
  if (error) throw new Error(error);
}

export function normalizeEndpoint(endpoint: string): string {
  const value = endpoint.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid HTTP(S) local endpoint.");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Enter a valid HTTP(S) local endpoint.");
  }
  return `${url.origin}${url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")}`;
}

export function joinEndpoint(endpoint: string, path: string): string {
  return `${normalizeEndpoint(endpoint)}/${path.replace(/^\/+/, "")}`;
}

export function getSelectedProviderEndpoint(settings: Settings): string {
  switch (settings.provider) {
    case "gemini":
      return "https://generativelanguage.googleapis.com";
    case "openai":
      return OPENAI_ENDPOINT;
    case "anthropic":
      return ANTHROPIC_ENDPOINT;
    case "ollama-cloud":
      return OLLAMA_CLOUD_ENDPOINT;
    case "local":
      return normalizeEndpoint(settings.providers.local.endpoint);
  }
}

export function getSelectedEndpointOrigin(settings: Settings): string {
  return new URL(getSelectedProviderEndpoint(settings)).origin;
}

export async function ensureEndpointPermission(settings: Settings): Promise<boolean> {
  if (settings.provider === "gemini" || typeof chrome === "undefined" || !chrome.permissions) {
    return true;
  }

  const origins = [`${getSelectedEndpointOrigin(settings)}/*`];
  return chrome.permissions.request({ origins });
}

function authHeaders(apiKey: string): Record<string, string> {
  return apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {};
}

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey.trim(),
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  label: string,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await apiError(response, label);
  const text = await response.text();
  if (!text.trim()) throw new Error(`${label} returned an empty response.`);
  return parseJson<T>(text, label);
}

function sortedModels(models: ProviderModel[]): ProviderModel[] {
  return models.sort((left, right) => left.id.localeCompare(right.id));
}

export async function listProviderModels(
  settings: Settings,
  signal?: AbortSignal,
): Promise<ProviderModel[]> {
  if (settings.provider !== "ollama-cloud") {
    validateProviderConfig(settings, false);
  }
  const config = getActiveProviderConfig(settings);
  const label = getProviderLabel(settings.provider);

  switch (settings.provider) {
    case "gemini": {
      type GeminiModels = {
        models?: Array<{
          name?: string;
          displayName?: string;
          supportedGenerationMethods?: string[];
        }>;
      };
      const result = await fetchJson<GeminiModels>(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
        { headers: { "x-goog-api-key": config.apiKey.trim() }, signal },
        label,
      );
      return sortedModels(
        (result.models ?? [])
          .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
          .flatMap((model) => {
            const id = model.name?.replace(/^models\//, "").trim();
            if (!id) return [];
            return [model.displayName ? { id, name: model.displayName } : { id }];
          }),
      );
    }
    case "openai": {
      const result = await fetchJson<{ data?: Array<{ id?: string }> }>(
        joinEndpoint(OPENAI_ENDPOINT, "models"),
        { headers: authHeaders(config.apiKey), signal },
        label,
      );
      return sortedModels(
        (result.data ?? []).flatMap((model) => model.id ? [{ id: model.id }] : []),
      );
    }
    case "anthropic": {
      const result = await fetchJson<{
        data?: Array<{ id?: string; display_name?: string }>;
      }>(
        `${joinEndpoint(ANTHROPIC_ENDPOINT, "v1/models")}?limit=1000`,
        { headers: anthropicHeaders(config.apiKey), signal },
        label,
      );
      return (result.data ?? []).flatMap((model) =>
        model.id ? [{ id: model.id, name: model.display_name }] : [],
      );
    }
    case "ollama-cloud":
    case "local": {
      const local = settings.providers.local;
      const native = settings.provider === "ollama-cloud" || local.apiFormat === "ollama";
      const endpoint = settings.provider === "ollama-cloud" ? OLLAMA_CLOUD_ENDPOINT : local.endpoint;
      const path = native ? "api/tags" : "models";
      const result = await fetchJson<{
        models?: Array<{ name?: string; model?: string }>;
        data?: Array<{ id?: string }>;
      }>(
        joinEndpoint(endpoint, path),
        { headers: authHeaders(config.apiKey), signal },
        label,
      );
      return sortedModels(
        native
          ? (result.models ?? []).flatMap((model) => {
              const id = model.model ?? model.name;
              if (!id) return [];
              return [model.name ? { id, name: model.name } : { id }];
            })
          : (result.data ?? []).flatMap((model) => model.id ? [{ id: model.id }] : []),
      );
    }
  }
}

type OpenAiStreamChunk = {
  choices?: Array<{ delta?: { content?: string } }>;
  error?: string | { message?: string };
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
};

function contextAttachments(context: ChatContext): AttachmentRef[] {
  return context.messages.flatMap((message) => message.attachments ?? []);
}

async function materializeMessageText(message: ChatMessage): Promise<string> {
  const textAttachments = message.attachments?.filter((attachment) => attachment.kind === "text");
  if (!textAttachments?.length) return message.content;
  const sections = await Promise.all(
    textAttachments.map(async (attachment) => {
      const text = await getAttachmentText(attachment);
      return `[Attached text file: ${attachment.name}]\n${text}\n[End attached text file: ${attachment.name}]`;
    }),
  );
  return [message.content, ...sections].filter(Boolean).join("\n\n");
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

async function attachmentBase64(attachment: AttachmentRef): Promise<string> {
  return blobBase64(await getAttachmentBlob(attachment.id));
}

async function attachmentDataUrl(attachment: AttachmentRef): Promise<string> {
  return `data:${attachment.mimeType};base64,${await attachmentBase64(attachment)}`;
}

function streamErrorMessage(error: string | { message?: string } | undefined): string | null {
  if (typeof error === "string") return error;
  return error?.message ?? null;
}

async function streamOpenAiResponses(
  config: ProviderConfig,
  context: ChatContext,
  signal: AbortSignal | undefined,
  onText: (text: string) => void,
): Promise<ProviderStreamResult> {
  const input = await Promise.all(
    context.messages.map(async (message) => {
      const content: Array<Record<string, unknown>> = [];
      const text = await materializeMessageText(message);
      if (text) content.push({ type: "input_text", text });
      for (const attachment of message.attachments ?? []) {
        if (attachment.kind === "text") continue;
        if (attachment.kind === "image") {
          content.push({ type: "input_image", image_url: await attachmentDataUrl(attachment) });
        } else {
          content.push({
            type: "input_file",
            filename: attachment.name,
            file_data: await attachmentDataUrl(attachment),
          });
        }
      }
      return { role: message.role, content };
    }),
  );
  const response = await fetch(joinEndpoint(OPENAI_ENDPOINT, "responses"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(config.apiKey) },
    body: JSON.stringify({
      model: config.model.trim(),
      input,
      stream: true,
      ...(context.systemInstruction ? { instructions: context.systemInstruction } : {}),
    }),
    signal,
  });
  if (!response.ok) throw await apiError(response, "OpenAI");
  if (!response.body) throw new Error("OpenAI returned an empty response stream.");

  type OpenAiResponseEvent = {
    type?: string;
    delta?: string;
    error?: string | { message?: string };
    response?: {
      model?: string;
      error?: { message?: string };
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    };
  };
  let completeText = "";
  let responseModel = "";
  let usage: ProviderTokenUsage | undefined;
  await consumeSse(response.body, ({ event, data }) => {
    if (!data || data === "[DONE]") return;
    if (event === "error" && !data.trimStart().startsWith("{")) {
      throw new Error(data.trim());
    }
    const chunk = parseJson<OpenAiResponseEvent>(data, "OpenAI");
    const error = streamErrorMessage(chunk.error) ?? chunk.response?.error?.message ?? null;
    if (error) throw new Error(error);
    const type = chunk.type || event;
    if (type === "response.output_text.delta" && chunk.delta) {
      completeText += chunk.delta;
      onText(chunk.delta);
    }
    if (type === "response.completed" && chunk.response) {
      responseModel = chunk.response.model?.trim() || responseModel;
      if (chunk.response.usage) {
        usage = {
          inputTokens: chunk.response.usage.input_tokens,
          outputTokens: chunk.response.usage.output_tokens,
          totalTokens: chunk.response.usage.total_tokens,
        };
      }
    }
  });
  if (!completeText) throw new Error("OpenAI returned no text.");
  return {
    text: completeText,
    ...(responseModel ? { model: responseModel } : {}),
    ...(usage ? { usage } : {}),
  };
}

async function streamOpenAi(
  endpoint: string,
  config: ProviderConfig,
  label: string,
  context: ChatContext,
  signal: AbortSignal | undefined,
  onText: (text: string) => void,
  requestUsage: boolean,
): Promise<ProviderStreamResult> {
  if (endpoint === OPENAI_ENDPOINT && contextAttachments(context).some((item) => item.kind !== "text")) {
    return streamOpenAiResponses(config, context, signal, onText);
  }

  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | Array<Record<string, unknown>>;
  }> = [];
  if (context.systemInstruction) {
    messages.push({ role: "system", content: context.systemInstruction });
  }
  for (const message of context.messages) {
    const text = await materializeMessageText(message);
    const images = message.attachments?.filter((attachment) => attachment.kind === "image") ?? [];
    if (!images.length) {
      messages.push({ role: message.role, content: text });
      continue;
    }
    const content: Array<Record<string, unknown>> = [];
    if (text) content.push({ type: "text", text });
    for (const image of images) {
      content.push({ type: "image_url", image_url: { url: await attachmentDataUrl(image) } });
    }
    messages.push({ role: message.role, content });
  }
  const response = await fetch(joinEndpoint(endpoint, "chat/completions"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(config.apiKey) },
    body: JSON.stringify({
      model: config.model.trim(),
      messages,
      stream: true,
      ...(requestUsage ? { stream_options: { include_usage: true } } : {}),
    }),
    signal,
  });
  if (!response.ok) throw await apiError(response, label);
  if (!response.body) throw new Error(`${label} returned an empty response stream.`);

  let completeText = "";
  let responseModel = "";
  let usage: ProviderTokenUsage | undefined;
  await consumeSse(response.body, ({ event, data }) => {
    if (!data || data === "[DONE]") return;
    if (event === "error" && !data.trimStart().startsWith("{")) {
      throw new Error(data.trim());
    }
    const chunk = parseJson<OpenAiStreamChunk>(data, label);
    const error = streamErrorMessage(chunk.error);
    if (error) throw new Error(error);
    responseModel = chunk.model?.trim() || responseModel;
    if (chunk.usage) {
      usage = {
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens,
        totalTokens: chunk.usage.total_tokens,
      };
    }
    const text = chunk.choices?.[0]?.delta?.content ?? "";
    if (text) {
      completeText += text;
      onText(text);
    }
  });
  if (!completeText) throw new Error(`${label} returned no text.`);
  return {
    text: completeText,
    ...(responseModel ? { model: responseModel } : {}),
    ...(usage ? { usage } : {}),
  };
}

async function streamAnthropic(
  config: ProviderConfig,
  context: ChatContext,
  signal: AbortSignal | undefined,
  onText: (text: string) => void,
): Promise<ProviderStreamResult> {
  const hasAttachments = contextAttachments(context).length > 0;
  const messages = hasAttachments
    ? await Promise.all(
        context.messages.map(async (message) => {
          const text = await materializeMessageText(message);
          const binary = message.attachments?.filter((item) => item.kind !== "text") ?? [];
          if (!binary.length) return { role: message.role, content: text };
          const content: Array<Record<string, unknown>> = [];
          if (text) content.push({ type: "text", text });
          for (const attachment of binary) {
            const source = {
              type: "base64",
              media_type: attachment.mimeType,
              data: await attachmentBase64(attachment),
            };
            content.push({
              type: attachment.kind === "pdf" ? "document" : "image",
              source,
            });
          }
          return { role: message.role, content };
        }),
      )
    : context.messages;
  const body: Record<string, unknown> = {
    model: config.model.trim(),
    messages,
    max_tokens: 4096,
    stream: true,
  };
  if (context.systemInstruction) body.system = context.systemInstruction;
  const response = await fetch(joinEndpoint(ANTHROPIC_ENDPOINT, "v1/messages"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...anthropicHeaders(config.apiKey) },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await apiError(response, "Anthropic");
  if (!response.body) throw new Error("Anthropic returned an empty response stream.");

  type AnthropicChunk = {
    type?: string;
    delta?: { type?: string; text?: string };
    error?: { message?: string };
    message?: {
      model?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  let completeText = "";
  let responseModel = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  await consumeSse(response.body, ({ event, data }) => {
    if (!data || event === "ping") return;
    if (event === "error" && !data.trimStart().startsWith("{")) {
      throw new Error(data.trim());
    }
    const chunk = parseJson<AnthropicChunk>(data, "Anthropic");
    if (chunk.error?.message) throw new Error(chunk.error.message);
    responseModel = chunk.message?.model?.trim() || responseModel;
    inputTokens = chunk.usage?.input_tokens ?? chunk.message?.usage?.input_tokens ?? inputTokens;
    outputTokens = chunk.usage?.output_tokens ?? chunk.message?.usage?.output_tokens ?? outputTokens;
    if (
      (event === "content_block_delta" || chunk.type === "content_block_delta") &&
      chunk.delta?.type === "text_delta" &&
      chunk.delta.text
    ) {
      completeText += chunk.delta.text;
      onText(chunk.delta.text);
    }
  });
  if (!completeText) throw new Error("Anthropic returned no text.");
  const usage =
    inputTokens !== undefined || outputTokens !== undefined
      ? {
          inputTokens,
          outputTokens,
          totalTokens:
            inputTokens !== undefined && outputTokens !== undefined
              ? inputTokens + outputTokens
              : undefined,
        }
      : undefined;
  return {
    text: completeText,
    ...(responseModel ? { model: responseModel } : {}),
    ...(usage ? { usage } : {}),
  };
}

async function streamOllama(
  endpoint: string,
  config: ProviderConfig,
  label: string,
  context: ChatContext,
  signal: AbortSignal | undefined,
  onText: (text: string) => void,
): Promise<ProviderStreamResult> {
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
    images?: string[];
  }> = [];
  if (context.systemInstruction) {
    messages.push({ role: "system", content: context.systemInstruction });
  }
  for (const message of context.messages) {
    const content = await materializeMessageText(message);
    const imageAttachments =
      message.attachments?.filter((attachment) => attachment.kind === "image") ?? [];
    messages.push({
      role: message.role,
      content,
      ...(imageAttachments.length
        ? { images: await Promise.all(imageAttachments.map(attachmentBase64)) }
        : {}),
    });
  }
  const response = await fetch(joinEndpoint(endpoint, "api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(config.apiKey) },
    body: JSON.stringify({ model: config.model.trim(), messages, stream: true }),
    signal,
  });
  if (!response.ok) throw await apiError(response, label);
  if (!response.body) throw new Error(`${label} returned an empty response stream.`);

  type OllamaChunk = {
    message?: { content?: string };
    error?: string;
    model?: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };
  let completeText = "";
  let responseModel = "";
  let usage: ProviderTokenUsage | undefined;
  await consumeNdjson(response.body, (line) => {
    const chunk = parseJson<OllamaChunk>(line, label);
    if (chunk.error) throw new Error(chunk.error);
    responseModel = chunk.model?.trim() || responseModel;
    if (chunk.prompt_eval_count !== undefined || chunk.eval_count !== undefined) {
      const inputTokens = chunk.prompt_eval_count;
      const outputTokens = chunk.eval_count;
      usage = {
        inputTokens,
        outputTokens,
        totalTokens:
          inputTokens !== undefined && outputTokens !== undefined
            ? inputTokens + outputTokens
            : undefined,
      };
    }
    const text = chunk.message?.content ?? "";
    if (text) {
      completeText += text;
      onText(text);
    }
  });
  if (!completeText) throw new Error(`${label} returned no text.`);
  return {
    text: completeText,
    ...(responseModel ? { model: responseModel } : {}),
    ...(usage ? { usage } : {}),
  };
}

export async function streamProvider({
  settings,
  context,
  signal,
  onText,
}: StreamProviderOptions): Promise<ProviderStreamResult> {
  validateProviderConfig(settings);
  validateAttachmentsForProvider(settings, contextAttachments(context));
  const config = getActiveProviderConfig(settings);
  const label = getProviderLabel(settings.provider);

  switch (settings.provider) {
    case "gemini":
      return streamGemini({ ...context, ...config, signal, onText });
    case "openai":
      return streamOpenAi(OPENAI_ENDPOINT, config, label, context, signal, onText, true);
    case "anthropic":
      return streamAnthropic(config, context, signal, onText);
    case "ollama-cloud":
      return streamOllama(OLLAMA_CLOUD_ENDPOINT, config, label, context, signal, onText);
    case "local":
      return settings.providers.local.apiFormat === "ollama"
        ? streamOllama(settings.providers.local.endpoint, config, label, context, signal, onText)
        : streamOpenAi(
            settings.providers.local.endpoint,
            config,
            label,
            context,
            signal,
            onText,
            false,
          );
  }
}

export function testSelectedModel(
  settings: Settings,
  signal?: AbortSignal,
): Promise<string> {
  return streamProvider({
    settings,
    context: { messages: [{ role: "user", content: "Reply with OK." }] },
    signal,
    onText: () => undefined,
  }).then((result) => result.text);
}
