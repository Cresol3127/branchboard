import type { ChatContext } from "./context";
import type { ConversationNode, GenerationMetrics } from "../types";

export type ProviderTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ProviderStreamResult = {
  text: string;
  model?: string;
  usage?: ProviderTokenUsage;
};

export type BoardTokenUsage = {
  totalTokens: number;
  estimated: boolean;
  recordedNodes: number;
};

export type SelectedTokenUsage = BoardTokenUsage & {
  selectedNodes: number;
  untrackedNodes: number;
  totalDurationMs: number;
  timedNodes: number;
  outputTokensPerSecond: number | null;
  rateNodes: number;
  rateEstimated: boolean;
};

function validTokenCount(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

export function estimateTokenCount(text: string): number {
  const characters = Array.from(text.trim());
  if (!characters.length) return 0;

  let ascii = 0;
  let nonAscii = 0;
  for (const character of characters) {
    if (character.codePointAt(0)! <= 0x7f) ascii += 1;
    else nonAscii += 1;
  }
  return Math.max(1, Math.ceil(ascii / 4 + nonAscii / 2));
}

export function estimateContextTokens(context: ChatContext): number {
  const systemTokens = context.systemInstruction
    ? estimateTokenCount(context.systemInstruction) + 4
    : 0;
  return context.messages.reduce(
    (total, message) => total + estimateTokenCount(message.content) + 4,
    systemTokens,
  );
}

export function createGenerationMetrics(
  context: ChatContext,
  responseText: string,
  durationMs: number,
  usage?: ProviderTokenUsage,
): GenerationMetrics {
  const providerInput = validTokenCount(usage?.inputTokens);
  const providerOutput = validTokenCount(usage?.outputTokens);
  const providerTotal = validTokenCount(usage?.totalTokens);
  const hasProviderUsage =
    providerInput !== undefined ||
    providerOutput !== undefined ||
    providerTotal !== undefined;

  if (!hasProviderUsage && !responseText.trim()) {
    return { durationMs: Math.max(0, Math.round(durationMs)) };
  }

  const inputTokens = providerInput ?? estimateContextTokens(context);
  const outputTokens = providerOutput ?? estimateTokenCount(responseText);
  const totalTokens = providerTotal ?? inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    durationMs: Math.max(0, Math.round(durationMs)),
    tokensEstimated:
      !hasProviderUsage ||
      providerInput === undefined ||
      providerOutput === undefined,
  };
}

export function aggregateBoardTokenUsage(
  nodes: ConversationNode[],
): BoardTokenUsage {
  let totalTokens = 0;
  let estimated = false;
  let recordedNodes = 0;

  for (const node of nodes) {
    if (node.metrics?.totalTokens === undefined) continue;
    totalTokens += node.metrics.totalTokens;
    estimated ||= Boolean(node.metrics.tokensEstimated);
    recordedNodes += 1;
  }

  return { totalTokens, estimated, recordedNodes };
}

export function aggregateSelectedTokenUsage(
  nodes: ConversationNode[],
  selectedIds: Iterable<string>,
): SelectedTokenUsage {
  const selected = new Set(selectedIds);
  let totalTokens = 0;
  let estimated = false;
  let recordedNodes = 0;
  let selectedNodes = 0;
  let totalDurationMs = 0;
  let timedNodes = 0;
  let rateOutputTokens = 0;
  let rateDurationMs = 0;
  let rateNodes = 0;
  let rateEstimated = false;

  for (const node of nodes) {
    if (!selected.has(node.id)) continue;
    selectedNodes += 1;
    const metrics = node.metrics;
    if (!metrics) continue;

    const durationIsValid =
      Number.isFinite(metrics.durationMs) && metrics.durationMs >= 0;
    if (durationIsValid) {
      totalDurationMs += metrics.durationMs;
      timedNodes += 1;
    }

    if (
      durationIsValid &&
      metrics.durationMs > 0 &&
      metrics.outputTokens !== undefined &&
      Number.isFinite(metrics.outputTokens) &&
      metrics.outputTokens >= 0
    ) {
      rateOutputTokens += metrics.outputTokens;
      rateDurationMs += metrics.durationMs;
      rateNodes += 1;
      rateEstimated ||= Boolean(metrics.tokensEstimated);
    }

    if (metrics.totalTokens !== undefined) {
      totalTokens += metrics.totalTokens;
      estimated ||= Boolean(metrics.tokensEstimated);
      recordedNodes += 1;
    }
  }

  return {
    totalTokens,
    estimated,
    recordedNodes,
    selectedNodes,
    untrackedNodes: selectedNodes - recordedNodes,
    totalDurationMs,
    timedNodes,
    outputTokensPerSecond:
      rateNodes > 0 ? rateOutputTokens / (rateDurationMs / 1000) : null,
    rateNodes,
    rateEstimated,
  };
}

export function formatTokenCount(tokens: number, compact = false): string {
  if (!compact || tokens < 1000) return tokens.toLocaleString("en-US");

  const units = ["K", "M", "B", "T"];
  const unitIndex = Math.min(
    Math.floor(Math.log10(tokens) / 3) - 1,
    units.length - 1,
  );
  const divisor = 1000 ** (unitIndex + 1);
  const value = (tokens / divisor).toFixed(1).replace(/\.0$/, "");
  return `${value}${units[unitIndex]}`;
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))}ms`;
  const totalSeconds = durationMs / 1000;
  if (totalSeconds < 59.95) return `${totalSeconds.toFixed(1)}s`;
  const roundedSeconds = Math.round(totalSeconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function formatTokenRate(metrics: GenerationMetrics): string | null {
  if (metrics.outputTokens === undefined || metrics.durationMs <= 0) return null;
  const rate = metrics.outputTokens / (metrics.durationMs / 1000);
  if (!Number.isFinite(rate)) return null;
  return `${metrics.tokensEstimated ? "~" : ""}${rate.toFixed(1)} tok/s`;
}

export function describeMetrics(metrics: GenerationMetrics): string {
  const parts: string[] = [`Duration: ${formatDuration(metrics.durationMs)}`];
  const prefix = metrics.tokensEstimated ? "Estimated " : "";
  if (metrics.inputTokens !== undefined) {
    parts.push(`${prefix}input: ${formatTokenCount(metrics.inputTokens)} tokens`);
  }
  if (metrics.outputTokens !== undefined) {
    parts.push(`${prefix}output: ${formatTokenCount(metrics.outputTokens)} tokens`);
  }
  if (metrics.totalTokens !== undefined) {
    parts.push(`${prefix}total: ${formatTokenCount(metrics.totalTokens)} tokens`);
  }
  return parts.join(" · ");
}
