import { describe, expect, it } from "vitest";
import type { ConversationNode } from "../types";
import {
  aggregateBoardTokenUsage,
  aggregateSelectedTokenUsage,
  createGenerationMetrics,
  estimateContextTokens,
  formatDuration,
  formatTokenCount,
  formatTokenRate,
} from "./metrics";

const context = {
  systemInstruction: "Be concise.",
  messages: [{ role: "user" as const, content: "Explain this." }],
};

function node(id: string, metrics?: ConversationNode["metrics"]): ConversationNode {
  return {
    id,
    parentIds: [],
    prompt: "Prompt",
    response: "Response",
    muted: false,
    status: "complete",
    position: { x: 0, y: 0 },
    createdAt: 1,
    metrics,
  };
}

describe("generation metrics", () => {
  it("preserves complete provider usage as exact", () => {
    expect(
      createGenerationMetrics(context, "Done", 1234.4, {
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
      durationMs: 1234,
      tokensEstimated: false,
    });
  });

  it("estimates missing usage from the actual request context and response", () => {
    const metrics = createGenerationMetrics(context, "A generated response", 2000);
    expect(metrics.inputTokens).toBe(estimateContextTokens(context));
    expect(metrics.outputTokens).toBeGreaterThan(0);
    expect(metrics.totalTokens).toBe(metrics.inputTokens! + metrics.outputTokens!);
    expect(metrics.tokensEstimated).toBe(true);
    expect(formatTokenRate(metrics)).toMatch(/^~/);
  });

  it("records duration without inventing usage for rejected requests", () => {
    expect(createGenerationMetrics(context, "", 87)).toEqual({ durationMs: 87 });
  });

  it("aggregates only recorded nodes and carries the estimate marker", () => {
    const usage = aggregateBoardTokenUsage([
      node("legacy"),
      node("exact", { totalTokens: 120, durationMs: 1000 }),
      node("estimated", {
        totalTokens: 30,
        durationMs: 500,
        tokensEstimated: true,
      }),
    ]);
    expect(usage).toEqual({ totalTokens: 150, estimated: true, recordedNodes: 2 });
  });

  it("aggregates an exact deduplicated node selection and reports untracked nodes", () => {
    const nodes = [
      node("legacy"),
      node("exact", { totalTokens: 120, durationMs: 1000 }),
      node("estimated", {
        totalTokens: 30,
        durationMs: 500,
        tokensEstimated: true,
      }),
      node("outside", { totalTokens: 900, durationMs: 1000 }),
    ];

    expect(
      aggregateSelectedTokenUsage(nodes, ["legacy", "exact", "estimated", "exact"]),
    ).toEqual({
      totalTokens: 150,
      estimated: true,
      recordedNodes: 2,
      selectedNodes: 3,
      untrackedNodes: 1,
      totalDurationMs: 1500,
      timedNodes: 2,
      outputTokensPerSecond: null,
      rateNodes: 0,
      rateEstimated: false,
    });
  });

  it("aggregates exact output throughput as a duration-weighted rate", () => {
    const usage = aggregateSelectedTokenUsage(
      [
        node("fast", {
          outputTokens: 20,
          totalTokens: 30,
          durationMs: 1000,
        }),
        node("slow", {
          outputTokens: 20,
          totalTokens: 40,
          durationMs: 3000,
        }),
      ],
      ["fast", "slow"],
    );

    expect(usage).toMatchObject({
      totalDurationMs: 4000,
      timedNodes: 2,
      outputTokensPerSecond: 10,
      rateNodes: 2,
      rateEstimated: false,
    });
    expect(usage.outputTokensPerSecond).not.toBeCloseTo((20 + 20 / 3) / 2);
  });

  it("marks a combined rate estimated only when an eligible node is estimated", () => {
    expect(
      aggregateSelectedTokenUsage(
        [
          node("exact", {
            outputTokens: 10,
            totalTokens: 20,
            durationMs: 1000,
          }),
          node("estimated", {
            outputTokens: 30,
            totalTokens: 50,
            durationMs: 3000,
            tokensEstimated: true,
          }),
        ],
        ["exact", "estimated"],
      ),
    ).toMatchObject({
      outputTokensPerSecond: 10,
      rateNodes: 2,
      rateEstimated: true,
    });
  });

  it("counts duration-only and zero-duration nodes without using them for rate", () => {
    const usage = aggregateSelectedTokenUsage(
      [
        node("legacy"),
        node("failed", { durationMs: 500 }),
        node("zero", {
          outputTokens: 999,
          totalTokens: 999,
          durationMs: 0,
          tokensEstimated: true,
        }),
        node("exact", {
          outputTokens: 10,
          totalTokens: 10,
          durationMs: 1000,
        }),
      ],
      ["legacy", "failed", "zero", "exact", "exact"],
    );

    expect(usage).toEqual({
      totalTokens: 1009,
      estimated: true,
      recordedNodes: 2,
      selectedNodes: 4,
      untrackedNodes: 2,
      totalDurationMs: 1500,
      timedNodes: 3,
      outputTokensPerSecond: 10,
      rateNodes: 1,
      rateEstimated: false,
    });
  });

  it("ignores non-finite or negative timing and output values", () => {
    const usage = aggregateSelectedTokenUsage(
      [
        node("negative-duration", {
          outputTokens: 10,
          durationMs: -100,
        }),
        node("infinite-duration", {
          outputTokens: 10,
          durationMs: Number.POSITIVE_INFINITY,
        }),
        node("negative-output", {
          outputTokens: -1,
          durationMs: 500,
        }),
        node("infinite-output", {
          outputTokens: Number.POSITIVE_INFINITY,
          durationMs: 500,
        }),
      ],
      [
        "negative-duration",
        "infinite-duration",
        "negative-output",
        "infinite-output",
      ],
    );

    expect(usage).toMatchObject({
      totalDurationMs: 1000,
      timedNodes: 2,
      outputTokensPerSecond: null,
      rateNodes: 0,
      rateEstimated: false,
    });
  });

  it("formats compact counts, duration, and exact throughput", () => {
    expect(formatTokenCount(1250, true)).toBe("1.3K");
    expect(formatTokenCount(12_500, true)).toBe("12.5K");
    expect(formatTokenCount(1_000_000, true)).toBe("1M");
    expect(formatTokenCount(1_250_000_000, true)).toBe("1.3B");
    expect(formatTokenCount(999, true)).toBe("999");
    expect(formatDuration(2500)).toBe("2.5s");
    expect(
      formatTokenRate({ outputTokens: 20, totalTokens: 30, durationMs: 2000 }),
    ).toBe("10.0 tok/s");
  });
});
