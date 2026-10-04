/** Public provider metadata only. Credentials must never enter workspace state. */
export const providerIds = [
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'groq',
  'ollama',
  'ollama_cloud',
  'custom',
] as const;
export type ProviderId = (typeof providerIds)[number];
export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === 'string' && providerIds.includes(value as ProviderId);

export const providerDefinitions: Record<
  ProviderId,
  { name: string; baseURL: string; models: string[] }
> = {
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-6.1-sol'],
  },
  anthropic: {
    name: 'Anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
  },
  google: {
    name: 'Google',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-pro'],
  },
  groq: {
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  ollama: { name: 'Ollama', baseURL: 'http://localhost:11434', models: [] },
  ollama_cloud: {
    name: 'Ollama Cloud',
    baseURL: 'https://ollama.com',
    models: ['gpt-oss:120b', 'gpt-oss:20b', 'gemma4:31b'],
  },
  custom: { name: 'Custom endpoint', baseURL: '', models: [] },
};

export type PublicProvider = {
  id: ProviderId;
  name: string;
  configured: boolean;
  hasKey: boolean;
  baseURL: string;
  models: string[];
  extraModels: string[];
  defaultModel: string;
};
export type AIConfig = { configured: boolean; model: string; providers: PublicProvider[] };
