import { readFileSync } from 'node:fs';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  isProviderId,
  providerDefinitions,
  providerIds,
  type ProviderId,
  type AIConfig,
} from '../src/providers';
import { sseData, jsonLines } from './stream';
import { reportedUsage } from '../src/tokenUsage';
import type { TokenUsage } from '../src/types';

export type ProviderConfig = { apiKey: string; baseURL: string; model: string; models: string[] };
export type ProviderOptions = {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  providers?: Partial<Record<ProviderId, Partial<ProviderConfig>>>;
  configPath?: string;
  timeoutMs?: number;
};

function validatePatch(value: unknown): Partial<ProviderConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid provider settings.');
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some((key) => !['apiKey', 'baseURL', 'model', 'models'].includes(key)))
    throw new Error('Unknown provider setting.');
  const result: Partial<ProviderConfig> = {};
  for (const key of ['apiKey', 'baseURL', 'model'] as const) {
    if (p[key] === undefined) continue;
    if (
      typeof p[key] !== 'string' ||
      p[key].length > (key === 'baseURL' ? 2048 : 512) ||
      /[\r\n]/.test(p[key])
    )
      throw new Error(`Invalid ${key}.`);
    result[key] = p[key].trim();
  }
  if (result.baseURL) {
    const url = new URL(result.baseURL);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Base URL must be HTTP(S), without credentials, query, or fragment.');
    result.baseURL = result.baseURL.replace(/\/+$/, '');
  }
  if (p.models !== undefined) {
    if (
      !Array.isArray(p.models) ||
      p.models.length > 500 ||
      !p.models.every(
        (m) => typeof m === 'string' && m.trim() && m.length <= 512 && !/[\r\n]/.test(m),
      )
    )
      throw new Error('Use up to 500 model names, each at most 512 characters.');
    result.models = [...new Set(p.models.map((m: string) => m.trim()))];
  }
  return result;
}

export function providerRegistry(options: ProviderOptions) {
  let configs = Object.fromEntries(
    providerIds.map((id) => [
      id,
      {
        apiKey: '',
        baseURL: providerDefinitions[id].baseURL,
        model: providerDefinitions[id].models[0] || '',
        models: [],
        ...validatePatch(options.providers?.[id] || {}),
        ...(id === 'openai'
          ? validatePatch({
              apiKey: options.apiKey,
              model: options.model,
              baseURL: options.baseURL,
            })
          : {}),
      },
    ]),
  ) as Record<ProviderId, ProviderConfig>;
  if (options.configPath) {
    try {
      const saved = JSON.parse(readFileSync(options.configPath, 'utf8'));
      if (
        !saved ||
        saved.version !== 1 ||
        !saved.providers ||
        typeof saved.providers !== 'object' ||
        Array.isArray(saved.providers)
      )
        throw new Error('Invalid provider config format.');
      for (const [id, settings] of Object.entries(saved.providers)) {
        if (!isProviderId(id)) throw new Error('Unknown provider in config.');
        configs[id] = { ...configs[id], ...validatePatch(settings) };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error(
          'Provider config could not be read. Fix or back up branchboard.providers.json before restarting.',
        );
    }
  }
  const discovered = new Map<ProviderId, string[]>();
  const ready = (id: ProviderId, p = configs[id]) =>
    Boolean(p.baseURL && (id === 'ollama' || p.apiKey) && (id !== 'custom' || p.model));
  const publicConfig = (): AIConfig => ({
    configured: providerIds.some((id) => id !== 'ollama' && ready(id)),
    model: configs.openai.model,
    providers: providerIds.map((id) => ({
      id,
      name: providerDefinitions[id].name,
      configured: ready(id),
      hasKey: Boolean(configs[id].apiKey),
      baseURL: configs[id].baseURL,
      models: [
        ...new Set([
          ...(discovered.get(id) ?? providerDefinitions[id].models),
          ...configs[id].models,
          ...(configs[id].model ? [configs[id].model] : []),
        ]),
      ],
      extraModels: configs[id].models,
      defaultModel: configs[id].model,
    })),
  });
  // Serialize updates so parallel settings saves cannot overwrite one another.
  let pending = Promise.resolve();
  const update = (id: ProviderId, value: unknown) => {
    const patch = validatePatch(value);
    const task = pending.then(async () => {
      const next = { ...configs, [id]: { ...configs[id], ...patch } };
      if (options.configPath) {
        const temporary = `${options.configPath}.${randomUUID()}.tmp`;
        try {
          await writeFile(
            temporary,
            JSON.stringify({ version: 1, providers: next }, null, 2) + '\n',
            { mode: 0o600, flag: 'wx' },
          );
          await rename(temporary, options.configPath);
        } catch {
          await unlink(temporary).catch(() => {});
          throw new Error('Unable to save provider config. Check project directory permissions.');
        }
      }
      configs = next;
      discovered.delete(id);
    });
    pending = task.catch(() => {});
    return task;
  };
  return {
    publicConfig,
    update,
    ready,
    get: (id: ProviderId) => ({ ...configs[id] }),
    discover: (id: ProviderId, models: string[]) => discovered.set(id, models),
  };
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
const isOllama = (id: ProviderId) => id === 'ollama' || id === 'ollama_cloud';
function headers(id: ProviderId, config: ProviderConfig): Record<string, string> {
  if (id === 'anthropic') return { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' };
  if (id === 'google') return { 'x-goog-api-key': config.apiKey };
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}
export function safeProviderError(error: unknown, config: ProviderConfig) {
  let text = error instanceof Error ? error.message : 'Unable to contact AI provider.';
  if (config.apiKey) {
    text = text
      .split(config.apiKey)
      .join('[redacted]')
      .split(encodeURIComponent(config.apiKey))
      .join('[redacted]');
  }
  return text.slice(0, 2000);
}
async function checked(response: Response) {
  if (!response.ok || !response.body) {
    const details = await response.json().catch(() => ({}));
    throw Object.assign(
      new Error(
        typeof details.error === 'string'
          ? details.error
          : details.error?.message || `AI provider returned ${response.status}.`,
      ),
      { status: response.status >= 400 ? response.status : 502 },
    );
  }
  return response;
}

export async function fetchModels(
  id: ProviderId,
  config: ProviderConfig,
  signal: AbortSignal,
  baseURL = config.baseURL,
): Promise<string[]> {
  const models: string[] = [];
  let page = '';
  for (let i = 0; i < 50; i++) {
    const endpoint = isOllama(id) ? '/api/tags' : `/models${page}`;
    const response = await checked(
      await fetch(`${baseURL}${endpoint}`, { headers: headers(id, config), signal }),
    );
    const data = await response.json();
    const list = isOllama(id) || id === 'google' ? data.models : data.data;
    if (!Array.isArray(list)) throw new Error('Provider returned an invalid model list.');
    for (const entry of list) {
      if (id === 'google' && !entry.supportedGenerationMethods?.includes('generateContent'))
        continue;
      const name = isOllama(id)
        ? entry.name
        : id === 'google'
          ? entry.name?.replace(/^models\//, '')
          : entry.id;
      if (typeof name === 'string' && name.length <= 512) models.push(name);
    }
    if (id === 'google' && data.nextPageToken)
      page = `?pageToken=${encodeURIComponent(data.nextPageToken)}`;
    else if (id === 'anthropic' && data.has_more && data.last_id)
      page = `?after_id=${encodeURIComponent(data.last_id)}`;
    else break;
  }
  return [...new Set(models)].sort();
}

/** Adapt native provider streams to the browser's common token/done SSE protocol. */
export async function* streamChat(
  id: ProviderId,
  config: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  options: { maxOutputTokens?: number; onUsage?: (usage: TokenUsage) => void } = {},
) {
  let endpoint = '/chat/completions';
  let body: object = { model, messages, stream: true };
  const usageTrailer = Boolean(options.onUsage && (id === 'openai' || id === 'openrouter'));
  if (usageTrailer) body = { ...body, stream_options: { include_usage: true } };
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  if (id === 'anthropic') {
    endpoint = '/messages';
    body = {
      model,
      max_tokens: options.maxOutputTokens ?? 8192,
      stream: true,
      ...(system ? { system } : {}),
      messages: messages.filter((m) => m.role !== 'system'),
    };
  } else if (id === 'google') {
    endpoint = `/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    body = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
    };
  } else if (isOllama(id)) {
    endpoint = '/api/chat';
  }
  if (options.maxOutputTokens !== undefined) {
    const cap = options.maxOutputTokens;
    if (!Number.isInteger(cap) || cap < 1 || cap > 8192) throw new Error('Invalid output limit.');
    if (id === 'google') body = { ...body, generationConfig: { maxOutputTokens: cap } };
    else if (isOllama(id)) body = { ...body, options: { num_predict: cap } };
    else if (id !== 'anthropic')
      body = {
        ...body,
        [id === 'openai' && /^(o[134](?:-|$)|gpt-5)/.test(model)
          ? 'max_completion_tokens'
          : 'max_tokens']: cap,
      };
  }
  const response = await checked(
    await fetch(`${config.baseURL}${endpoint}`, {
      method: 'POST',
      signal,
      headers: { ...headers(id, config), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  let finished = false;
  let anthropicInput: unknown;
  const chunks = isOllama(id) ? jsonLines(response.body!) : sseData(response.body!);
  for await (const raw of chunks) {
    if (raw === '[DONE]') {
      finished = true;
      break;
    }
    const chunk = JSON.parse(raw);
    if (chunk.error)
      throw new Error(
        typeof chunk.error === 'string'
          ? chunk.error
          : chunk.error.message || 'Provider stream failed.',
      );
    let token: unknown;
    let usage: TokenUsage | null = null;
    if (id === 'anthropic') {
      if (chunk.type === 'message_start') {
        const initial = chunk.message?.usage;
        // Anthropic reports cached input separately from uncached input.
        if (initial && Number.isSafeInteger(initial.input_tokens) && initial.input_tokens >= 0) {
          const read = initial.cache_read_input_tokens ?? 0;
          const write = initial.cache_creation_input_tokens ?? 0;
          if (Number.isSafeInteger(read) && read >= 0 && Number.isSafeInteger(write) && write >= 0)
            anthropicInput = initial.input_tokens + read + write;
        }
      }
      if (chunk.type === 'message_delta')
        usage = reportedUsage(anthropicInput, chunk.usage?.output_tokens);
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta')
        token = chunk.delta.text;
      if (chunk.type === 'message_stop') finished = true;
    } else if (id === 'google') {
      const counters = chunk.usageMetadata;
      if (counters) {
        const thoughts = counters.thoughtsTokenCount ?? 0;
        usage = reportedUsage(
          counters.promptTokenCount,
          Number.isSafeInteger(thoughts) &&
            thoughts >= 0 &&
            Number.isSafeInteger(counters.candidatesTokenCount)
            ? counters.candidatesTokenCount + thoughts
            : undefined,
          counters.totalTokenCount,
        );
      }
      const candidate = chunk.candidates?.[0];
      if (chunk.promptFeedback?.blockReason)
        throw new Error(`Google blocked the prompt: ${chunk.promptFeedback.blockReason}.`);
      if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason))
        throw new Error(`Google stopped the response: ${candidate.finishReason}.`);
      token = candidate?.content?.parts
        ?.filter((p: { text?: string; thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text || '')
        .join('');
      if (candidate?.finishReason) finished = true;
    } else if (isOllama(id)) {
      if (chunk.done) usage = reportedUsage(chunk.prompt_eval_count, chunk.eval_count);
      token = chunk.message?.content;
      if (chunk.done) finished = true;
    } else {
      if (chunk.usage)
        usage = reportedUsage(
          chunk.usage.prompt_tokens,
          chunk.usage.completion_tokens,
          chunk.usage.total_tokens,
        );
      token = chunk.choices?.[0]?.delta?.content;
      if (chunk.choices?.[0]?.finish_reason) finished = true;
    }
    if (typeof token === 'string' && token) yield token;
    if (usage) options.onUsage?.(usage);
    // OpenAI-compatible usage arrives after the finish_reason chunk, before [DONE].
    if (finished && !usageTrailer) break;
  }
  if (!finished)
    throw new Error('The provider disconnected before finishing. You can retry this response.');
}
