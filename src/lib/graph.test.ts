import { describe, expect, it } from "vitest";
import type { ConversationNode } from "../types";
import {
  canAddDraftToMerge,
  getContextNodes,
  getDescendantIds,
  getMergedDraftParentIds,
  getNodeDepths,
  migrateConversationNode,
} from "./graph";

function node(
  id: string,
  parentIds: string[] = [],
  overrides: Partial<ConversationNode> = {},
): ConversationNode {
  return {
    id,
    parentIds,
    prompt: `prompt-${id}`,
    response: `response-${id}`,
    muted: false,
    status: "complete",
    position: { x: 0, y: 0 },
    createdAt: 1,
    ...overrides,
  };
}

describe("getContextNodes", () => {
  it("returns the ancestor union for two parents and deduplicates shared ancestors", () => {
    const nodes = [
      node("root", [], { createdAt: 1 }),
      node("shared", ["root"], { createdAt: 2 }),
      node("left", ["shared"], { createdAt: 3 }),
      node("right", ["shared"], { createdAt: 4 }),
      node("unrelated", ["root"], { createdAt: 5 }),
    ];

    expect(getContextNodes(nodes, ["left", "right"]).map(({ id }) => id)).toEqual([
      "root",
      "shared",
      "left",
      "right",
    ]);
  });

  it("is stably topological regardless of input and target order", () => {
    const root = node("root", [], { createdAt: 10 });
    const alpha = node("alpha", ["root"], { createdAt: 2 });
    const beta = node("beta", ["root"], { createdAt: 2 });
    const merge = node("merge", ["alpha", "beta"], { createdAt: 1 });
    const expected = ["root", "alpha", "beta", "merge"];

    expect(getContextNodes([merge, beta, root, alpha], ["merge"]).map(({ id }) => id)).toEqual(
      expected,
    );
    expect(
      getContextNodes([alpha, root, merge, beta], ["beta", "alpha"]).map(({ id }) => id),
    ).toEqual(["root", "alpha", "beta"]);
    expect(
      getContextNodes([beta, merge, alpha, root], ["alpha", "beta"]).map(({ id }) => id),
    ).toEqual(["root", "alpha", "beta"]);
  });

  it("rejects cycles", () => {
    expect(() =>
      getContextNodes([node("one", ["two"]), node("two", ["one"])], ["one"]),
    ).toThrow(/cycle/i);
  });

  it("rejects missing parents", () => {
    expect(() => getContextNodes([node("child", ["missing"])], ["child"])).toThrow(
      /missing parent/i,
    );
  });
});

describe("getNodeDepths", () => {
  it("uses the maximum parent depth for multi-parent nodes", () => {
    const nodes = [
      node("root"),
      node("shallow", ["root"]),
      node("middle", ["root"]),
      node("deep", ["middle"]),
      node("merge", ["shallow", "deep"]),
    ];

    expect(Object.fromEntries(getNodeDepths(nodes))).toEqual({
      root: 1,
      shallow: 2,
      middle: 2,
      deep: 3,
      merge: 4,
    });
  });
});

describe("getDescendantIds", () => {
  it("includes shared merge descendants and their descendants", () => {
    const nodes = [
      node("root"),
      node("left", ["root"]),
      node("right", ["root"]),
      node("merge", ["left", "right"]),
      node("after", ["merge"]),
      node("unrelated"),
    ];

    expect(getDescendantIds(nodes, "left")).toEqual(
      new Set(["left", "merge", "after"]),
    );
    expect(getDescendantIds(nodes, "right")).toEqual(
      new Set(["right", "merge", "after"]),
    );
  });
});

describe("getMergedDraftParentIds", () => {
  it("combines any number of draft parent sets in stable order", () => {
    expect(
      getMergedDraftParentIds([
        node("left", ["left-parent"], { status: "draft" }),
        node("middle", ["right-parent", "shared"], { status: "draft" }),
        node("right", ["shared", "third-parent"], { status: "draft" }),
      ]),
    ).toEqual(["left-parent", "right-parent", "shared", "third-parent"]);
  });

  it.each([
    [[node("only", ["one"], { status: "draft" })]],
    [[
      node("left", ["same"], { status: "draft" }),
      node("right", ["same"], { status: "draft" }),
    ]],
    [[
      node("left", ["one"], { status: "complete" }),
      node("right", ["two"], { status: "draft" }),
    ]],
    [[
      node("same", ["one"], { status: "draft" }),
      node("same", ["two"], { status: "draft" }),
    ]],
  ])("rejects an ineligible draft basket", (drafts) => {
    expect(getMergedDraftParentIds(drafts)).toBeNull();
  });

  it("accepts only candidates that contribute a new direct parent", () => {
    const selected = [node("selected", ["one", "two"], { status: "draft" })];
    expect(
      canAddDraftToMerge(
        selected,
        node("new", ["two", "three"], { status: "draft" }),
      ),
    ).toBe(true);
    expect(
      canAddDraftToMerge(
        selected,
        node("duplicate", ["one", "two"], { status: "draft" }),
      ),
    ).toBe(false);
    expect(
      canAddDraftToMerge(
        selected,
        node("complete", ["three"], { status: "complete" }),
      ),
    ).toBe(false);
  });
});

describe("migrateConversationNode", () => {
  it("migrates legacy parentId and removes the legacy property", () => {
    const legacy = {
      id: "child",
      parentId: "root",
      prompt: "Prompt",
      response: "Response",
      muted: false,
      status: "complete" as const,
      position: { x: 0, y: 0 },
      createdAt: 1,
    };

    const migrated = migrateConversationNode(legacy);

    expect(migrated.parentIds).toEqual(["root"]);
    expect(migrated).not.toHaveProperty("parentId");
  });

  it("migrates a legacy root to an empty parent list", () => {
    const migrated = migrateConversationNode({
      id: "root",
      parentId: null,
      prompt: "Prompt",
      response: "Response",
      muted: false,
      status: "complete",
      position: { x: 0, y: 0 },
      createdAt: 1,
    });

    expect(migrated.parentIds).toEqual([]);
    expect(migrated).not.toHaveProperty("parentId");
  });
});
