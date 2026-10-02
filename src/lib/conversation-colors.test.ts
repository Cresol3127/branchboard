import { describe, expect, it } from "vitest";
import type { ConversationNode } from "../types";
import {
  applyConversationColor,
  DEFAULT_CONVERSATION_COLOR_SCOPE,
  getConversationColorAffectedCount,
  getInheritedConversationColor,
  isConversationColor,
} from "./conversation-colors";

function node(
  id: string,
  parentIds: string[] = [],
  overrides: Partial<ConversationNode> = {},
): ConversationNode {
  return {
    id,
    parentIds,
    prompt: id,
    response: "Answer",
    muted: false,
    status: "complete",
    position: { x: 0, y: 0 },
    createdAt: 1,
    ...overrides,
  };
}

describe("conversation colors", () => {
  it("defaults color actions to the downstream family", () => {
    expect(DEFAULT_CONVERSATION_COLOR_SCOPE).toBe("family");
  });

  it("validates only supported semantic colors", () => {
    expect(isConversationColor("cyan")).toBe(true);
    expect(isConversationColor("#00ffff")).toBe(false);
  });

  it("colors only one node without replacing untouched identities", () => {
    const root = node("root");
    const child = node("child", [root.id]);
    const result = applyConversationColor([root, child], root.id, "blue", "node");

    expect(result[0].color).toBe("blue");
    expect(result[1]).toBe(child);
  });

  it("colors a node and every downstream DAG descendant", () => {
    const root = node("root");
    const left = node("left", [root.id]);
    const right = node("right");
    const merge = node("merge", [left.id, right.id]);
    const result = applyConversationColor(
      [root, left, right, merge],
      root.id,
      "violet",
      "family",
    );

    expect(result.map((item) => item.color)).toEqual([
      "violet",
      "violet",
      undefined,
      "violet",
    ]);
    expect(
      getConversationColorAffectedCount(
        [root, left, right, merge],
        root.id,
        "family",
      ),
    ).toBe(3);
    expect(
      getConversationColorAffectedCount(
        [root, left, right, merge],
        root.id,
        "node",
      ),
    ).toBe(1);
  });

  it("clears family colors without adding color properties", () => {
    const root = node("root", [], { color: "amber" });
    const child = node("child", [root.id], { color: "amber" });
    const result = applyConversationColor(
      [root, child],
      root.id,
      undefined,
      "family",
    );

    expect(result.every((item) => !("color" in item))).toBe(true);
  });

  it("inherits one parent color and matching merge-parent colors", () => {
    const blue = node("blue", [], { color: "blue" });
    const alsoBlue = node("also-blue", [], { color: "blue" });

    expect(getInheritedConversationColor([blue], [blue.id])).toBe("blue");
    expect(
      getInheritedConversationColor([blue, alsoBlue], [blue.id, alsoBlue.id]),
    ).toBe("blue");
  });

  it("does not inherit from roots, missing parents, or mixed-color merges", () => {
    const blue = node("blue", [], { color: "blue" });
    const pink = node("pink", [], { color: "pink" });

    expect(getInheritedConversationColor([blue], [])).toBeUndefined();
    expect(getInheritedConversationColor([blue], ["missing"])).toBeUndefined();
    expect(
      getInheritedConversationColor([blue, pink], [blue.id, pink.id]),
    ).toBeUndefined();
  });
});
