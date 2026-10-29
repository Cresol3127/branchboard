import { isProviderId } from './providers';
import type { Message, TokenUsage } from './types';

const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Only complete, nonnegative provider counters qualify as reported usage. */
export function reportedUsage(input: unknown, output: unknown, total?: unknown): TokenUsage | null {
  if (!count(input) || !count(output) || !count(input + output)) return null;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: count(total) && total >= input + output ? total : input + output,
    source: 'provider',
  };
}

export function readGeneration(value: unknown): Message['generation'] {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as NonNullable<Message['generation']>;
  if (
    !isProviderId(candidate.provider) ||
    typeof candidate.model !== 'string' ||
    !candidate.model.trim() ||
    candidate.model.length > 512 ||
    /[\r\n]/.test(candidate.model) ||
    !['completed', 'cancelled', 'failed'].includes(candidate.status) ||
    !candidate.usage ||
    !['provider', 'estimated'].includes(candidate.usage.source)
  )
    return undefined;
  const usage = reportedUsage(
    candidate.usage.inputTokens,
    candidate.usage.outputTokens,
    candidate.usage.totalTokens,
  );
  if (
    !usage ||
    !count(candidate.usage.totalTokens) ||
    candidate.usage.totalTokens < usage.inputTokens + usage.outputTokens
  )
    return undefined;
  return {
    provider: candidate.provider,
    model: candidate.model,
    status: candidate.status,
    usage: { ...usage, source: candidate.usage.source },
  };
}
