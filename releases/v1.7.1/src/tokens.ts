import type { Budget, BudgetPeriod, GenerationRecord, ModelPrice, TokenUsage } from './types';
import type { Message } from './types';
import type { ProviderId } from './providers';

export type TokenCount = {
  tokens: number;
  exact: boolean;
  label: string;
  framing: 'model' | 'heuristic';
};

/** Deterministic offline fallback. Never present this as billed or model-exact usage. */
export function heuristicInputTokens(messages: Pick<Message, 'content'>[]) {
  const nonempty = messages.filter((m) => m.content);
  if (!nonempty.length) return 0;
  const encoder = new TextEncoder();
  return (
    3 +
    nonempty.reduce((total, m) => total + Math.ceil(encoder.encode(m.content).length / 4) + 4, 0)
  );
}

let exactTokenizer: Promise<{
  countChatCompletionTokens?: (request: {
    model: string;
    messages: { role: string; content: string }[];
  }) => number;
}> | null = null;
const exactCache = new Map<string, number>();

function usesOpenAiTokenizer(provider: ProviderId, model: string) {
  if (provider === 'openai') return true;
  return provider === 'openrouter' && /^openai\//i.test(model);
}

/** Model tokenization where a redistributable tokenizer is available; labeled estimate otherwise. */
export async function countInputTokens(
  messages: Pick<Message, 'role' | 'content'>[],
  provider: ProviderId,
  model: string,
): Promise<TokenCount> {
  const nonempty = messages.filter((m) => m.content);
  if (!nonempty.length)
    return { tokens: 0, exact: false, label: 'No text to count', framing: 'heuristic' };
  if (!usesOpenAiTokenizer(provider, model))
    return {
      tokens: heuristicInputTokens(nonempty),
      exact: false,
      label: 'Estimated with UTF-8 bytes ÷ 4; this provider has no bundled public tokenizer',
      framing: 'heuristic',
    };
  const key = `${model}\u0000${nonempty.map((m) => `${m.role}\u0001${m.content}`).join('\u0002')}`;
  const cached = exactCache.get(key);
  if (cached !== undefined)
    return {
      tokens: cached,
      exact: true,
      label: 'OpenAI o200k tokenizer; chat framing included',
      framing: 'model',
    };
  try {
    if (!exactTokenizer)
      exactTokenizer = import('gpt-tokenizer/model/gpt-4o').then((module) => module.default);
    const tokenizer = await exactTokenizer;
    const tokens =
      tokenizer.countChatCompletionTokens?.({
        model,
        messages: nonempty.map(({ role, content }) => ({ role, content })),
      }) ?? heuristicInputTokens(nonempty);
    if (exactCache.size > 200) exactCache.clear();
    exactCache.set(key, tokens);
    return {
      tokens,
      exact: Boolean(tokenizer.countChatCompletionTokens),
      label: tokenizer.countChatCompletionTokens
        ? 'OpenAI o200k tokenizer; chat framing included'
        : 'Estimated with UTF-8 bytes ÷ 4',
      framing: tokenizer.countChatCompletionTokens ? 'model' : 'heuristic',
    };
  } catch {
    return {
      tokens: heuristicInputTokens(nonempty),
      exact: false,
      label: 'Exact tokenizer unavailable; estimated with UTF-8 bytes ÷ 4',
      framing: 'heuristic',
    };
  }
}

export function estimatedOutputTokens(text: string) {
  return text ? Math.max(1, Math.ceil(new TextEncoder().encode(text).length / 4)) : 0;
}

export function normalizeProviderUsage(input: {
  inputTokens?: unknown;
  outputTokens?: unknown;
  totalTokens?: unknown;
  cacheReadTokens?: unknown;
  cacheWriteTokens?: unknown;
  reasoningTokens?: unknown;
  detail?: string;
}): TokenUsage | null {
  const integer = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const inputTokens = integer(input.inputTokens);
  const outputTokens = integer(input.outputTokens);
  if (inputTokens === undefined && outputTokens === undefined) return null;
  const normalizedInput = inputTokens ?? 0;
  const normalizedOutput = outputTokens ?? 0;
  return {
    inputTokens: normalizedInput,
    outputTokens: normalizedOutput,
    totalTokens:
      integer(input.totalTokens) ?? Math.max(normalizedInput + normalizedOutput, normalizedOutput),
    ...(integer(input.cacheReadTokens) !== undefined
      ? { cacheReadTokens: integer(input.cacheReadTokens) }
      : {}),
    ...(integer(input.cacheWriteTokens) !== undefined
      ? { cacheWriteTokens: integer(input.cacheWriteTokens) }
      : {}),
    ...(integer(input.reasoningTokens) !== undefined
      ? { reasoningTokens: integer(input.reasoningTokens) }
      : {}),
    source: 'provider',
    detail: input.detail,
  };
}

export function estimatedUsage(inputTokens: number, outputText: string): TokenUsage {
  const outputTokens = estimatedOutputTokens(outputText);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    source: 'estimated',
    detail: 'Output count estimated from UTF-8 bytes; input count is shown in the token panel.',
  };
}

export function findPrice(
  prices: ModelPrice[],
  provider: ProviderId,
  model: string,
): ModelPrice | undefined {
  return (
    prices.find((price) => price.provider === provider && price.model === model) ||
    prices.find((price) => price.provider === provider && price.model === '*')
  );
}

export function calculateCost(usage: TokenUsage, price: ModelPrice): number {
  const input = (usage.inputTokens / 1_000_000) * price.inputPerMillion;
  const output = (usage.outputTokens / 1_000_000) * price.outputPerMillion;
  return Math.round((input + output) * 1e8) / 1e8;
}

export function reservationCost(inputTokens: number, maxOutputTokens: number, price: ModelPrice) {
  return (
    Math.round(
      ((inputTokens / 1_000_000) * price.inputPerMillion +
        (maxOutputTokens / 1_000_000) * price.outputPerMillion) *
        1e8,
    ) / 1e8
  );
}

export function periodStart(period: BudgetPeriod, now = Date.now()) {
  if (period === 'total') return 0;
  const date = new Date(now);
  if (period === 'month') date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function budgetMatches(record: GenerationRecord, budget: Budget) {
  if (record.startedAt < periodStart(budget.period)) return false;
  if (record.currency !== budget.currency) return false;
  if (budget.scope === 'workspace') return true;
  if (budget.scope === 'provider') return record.provider === budget.targetId;
  if (budget.scope === 'board') return record.boardId === budget.targetId;
  return record.nodeId === budget.targetId;
}

export function spentForBudget(records: GenerationRecord[], budget: Budget) {
  return (
    Math.round(
      records
        .filter((record) => record.status !== 'cancelled' && budgetMatches(record, budget))
        .reduce((sum, record) => sum + (record.cost || 0), 0) * 1e8,
    ) / 1e8
  );
}

export function budgetCheck(
  budgets: Budget[],
  records: GenerationRecord[],
  pending: { boardId: string; nodeId: string; provider: ProviderId; cost: number; currency: string }[],
  request: {
    boardId: string;
    nodeId: string;
    provider: ProviderId;
    cost: number | null;
    currency: string;
  },
) {
  for (const budget of budgets) {
    const candidate: GenerationRecord = {
      id: 'candidate',
      boardId: request.boardId,
      nodeId: request.nodeId,
      provider: request.provider,
      model: '',
      kind: 'chat',
      startedAt: Date.now(),
      endedAt: Date.now(),
      status: 'completed',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, source: 'estimated' },
      cost: request.cost,
      currency: request.currency,
    };
    if (!budgetMatches(candidate, budget)) continue;
    if (request.cost === null) {
      if (budget.strict)
        return {
          ok: false as const,
          budget,
          message: `“${budget.name}” is a strict budget, but this model has no configured price. Add an exact price in Usage & budgets or disable strict enforcement. Nothing was sent.`,
        };
      continue;
    }
    if (request.currency !== budget.currency)
      return {
        ok: false as const,
        budget,
        message: `“${budget.name}” uses ${budget.currency}, but this model's configured price uses ${request.currency}. Nothing was sent.`,
      };
    const pendingCost = pending
      .filter((item) => {
        const pendingRecord: GenerationRecord = {
          ...candidate,
          boardId: item.boardId,
          nodeId: item.nodeId,
          provider: item.provider,
          currency: item.currency,
          cost: item.cost,
        };
        return budgetMatches(pendingRecord, budget);
      })
      .reduce((sum, item) => sum + item.cost, 0);
    const spent = spentForBudget(records, budget) + pendingCost;
    if (Math.round((spent + request.cost) * 1e8) / 1e8 > budget.limit)
      return {
        ok: false as const,
        budget,
        message: `“${budget.name}” would be exceeded: ${spent.toFixed(4)} spent, ${request.cost.toFixed(4)} reserved, ${budget.limit.toFixed(2)} ${budget.currency} limit. Nothing was sent.`,
      };
  }
  return { ok: true as const };
}

export function formatCost(cost: number | null, currency = 'USD') {
  if (cost === null) return 'Unknown';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: cost < 0.01 ? 6 : 4,
    }).format(cost);
  } catch {
    return `${cost.toFixed(4)} ${currency}`;
  }
}
