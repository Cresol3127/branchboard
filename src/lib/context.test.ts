import { describe, expect, it } from "vitest";
import type { ConversationNode } from "../types";
import { buildChatContext } from "./context";

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

function userContents(context: ReturnType<typeof buildChatContext>): string[] {
  return context.messages
    .filter(({ role }) => role === "user")
    .map(({ content }) => content);
}

describe("buildChatContext", () => {
  it("preserves plain messages for a single-parent branch", () => {
    const nodes = [node("root"), node("leaf", ["root"])];

    expect(buildChatContext(nodes, ["leaf"], "next prompt").messages).toEqual([
      { role: "user", content: "prompt-root" },
      { role: "assistant", content: "response-root" },
      { role: "user", content: "prompt-leaf" },
      { role: "assistant", content: "response-leaf" },
      { role: "user", content: "next prompt" },
    ]);
  });

  it("includes the equal ancestor union of two parent branches once", () => {
    const nodes = [
      node("root", [], { createdAt: 1 }),
      node("left", ["root"], { createdAt: 2 }),
      node("right", ["root"], { createdAt: 3 }),
    ];

    const context = buildChatContext(nodes, ["left", "right"], "combine");
    const prompts = userContents(context);

    expect(prompts).toHaveLength(4);
    expect(prompts.filter((message) => message.includes("prompt-root"))).toHaveLength(1);
    expect(prompts.some((message) => message.includes("prompt-left"))).toBe(true);
    expect(prompts.some((message) => message.includes("prompt-right"))).toBe(true);
    expect(prompts.at(-1)).toBe("[Current request | parents: N2, N3]\ncombine");
  });

  it("labels a merge node with both of its parents", () => {
    const nodes = [
      node("root", [], { createdAt: 1 }),
      node("left", ["root"], { createdAt: 2 }),
      node("right", ["root"], { createdAt: 3 }),
      node("merge", ["left", "right"], { createdAt: 4 }),
    ];

    const context = buildChatContext(nodes, ["merge"], "continue");

    expect(userContents(context)).toContain(
      "[Context node N4 | parents: N2, N3]\nprompt-merge",
    );
    expect(userContents(context).at(-1)).toBe(
      "[Current request | parents: N4]\ncontinue",
    );
  });

  it("excludes unrelated sibling branches", () => {
    const nodes = [
      node("root"),
      node("selected", ["root"]),
      node("sibling", ["root"]),
    ];

    const context = buildChatContext(nodes, ["selected"], "continue");
    expect(context.messages).toEqual([
      { role: "user", content: "prompt-root" },
      { role: "assistant", content: "response-root" },
      { role: "user", content: "prompt-selected" },
      { role: "assistant", content: "response-selected" },
      { role: "user", content: "continue" },
    ]);
  });

  it("omits muted nodes and connects their children to the nearest included ancestors", () => {
    const nodes = [
      node("root", [], { createdAt: 1 }),
      node("muted", ["root"], { muted: true, createdAt: 2 }),
      node("left", ["muted"], { createdAt: 3 }),
      node("right", ["root"], { createdAt: 4 }),
    ];

    const context = buildChatContext(nodes, ["left", "right"], "continue");
    const prompts = userContents(context);

    expect(context.messages.some(({ content }) => content.includes("prompt-muted"))).toBe(false);
    expect(prompts).toContain("[Context node N2 | parents: N1]\nprompt-left");
    expect(prompts.at(-1)).toBe("[Current request | parents: N2, N3]\ncontinue");
  });

  it("removes incomplete exchanges", () => {
    const nodes = [
      node("root"),
      node("draft", ["root"], { status: "draft" }),
      node("failed", ["draft"], { status: "error" }),
    ];

    expect(buildChatContext(nodes, ["failed"], "next prompt").messages).toEqual([
      { role: "user", content: "prompt-root" },
      { role: "assistant", content: "response-root" },
      { role: "user", content: "next prompt" },
    ]);
  });

  it("carries ancestor and current attachments through selected context", () => {
    const rootAttachment = {
      id: "root-file",
      kind: "pdf" as const,
      name: "root.pdf",
      mimeType: "application/pdf",
      size: 120,
      createdAt: 1,
    };
    const currentAttachment = {
      id: "current-file",
      kind: "image" as const,
      name: "current.png",
      mimeType: "image/png",
      size: 80,
      createdAt: 2,
    };
    const nodes = [node("root", [], { attachments: [rootAttachment] })];

    const context = buildChatContext(nodes, ["root"], "compare", [currentAttachment]);

    expect(context.messages[0].attachments).toEqual([rootAttachment]);
    expect(context.messages.at(-1)?.attachments).toEqual([currentAttachment]);
  });

  it("excludes attachments belonging to muted nodes", () => {
    const attachment = {
      id: "muted-file",
      kind: "image" as const,
      name: "muted.png",
      mimeType: "image/png",
      size: 80,
      createdAt: 1,
    };
    const nodes = [
      node("root"),
      node("muted", ["root"], { muted: true, attachments: [attachment] }),
      node("leaf", ["muted"]),
    ];

    const context = buildChatContext(nodes, ["leaf"], "continue");

    expect(context.messages.flatMap((message) => message.attachments ?? [])).toEqual([]);
  });

  it("allows an attachment-only current request", () => {
    const attachment = {
      id: "photo",
      kind: "image" as const,
      name: "photo.png",
      mimeType: "image/png",
      size: 80,
      createdAt: 1,
    };

    expect(buildChatContext([], [], "", [attachment]).messages).toEqual([
      { role: "user", content: "", attachments: [attachment] },
    ]);
  });
});
