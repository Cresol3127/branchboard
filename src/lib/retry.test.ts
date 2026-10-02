import { describe, expect, it } from "vitest";
import type { ConversationNode } from "../types";
import { buildChatContext } from "./context";
import {
  canRetryConversation,
  createSiblingRetryInput,
} from "./retry";

function conversation(
  overrides: Partial<ConversationNode> = {},
): ConversationNode {
  return {
    id: "source",
    parentIds: [],
    prompt: "Try this",
    response: "Original answer",
    muted: false,
    status: "complete",
    position: { x: 0, y: 0 },
    createdAt: 1,
    ...overrides,
  };
}

describe("sibling retry", () => {
  it("accepts completed and failed nodes but not drafts or streams", () => {
    expect(canRetryConversation(conversation())).toBe(true);
    expect(canRetryConversation(conversation({ status: "error" }))).toBe(true);
    expect(canRetryConversation(conversation({ status: "draft" }))).toBe(false);
    expect(canRetryConversation(conversation({ status: "streaming" }))).toBe(false);
  });

  it("copies the exact prompt, parent set, attachments, and color", () => {
    const attachment = {
      id: "asset",
      kind: "image" as const,
      name: "diagram.png",
      mimeType: "image/png",
      size: 42,
      createdAt: 1,
    };
    const source = conversation({
      parentIds: ["left", "right"],
      attachments: [attachment],
      color: "violet",
    });

    const retry = createSiblingRetryInput(source);

    expect(retry).toEqual({
      sourceId: source.id,
      parentIds: ["left", "right"],
      prompt: source.prompt,
      attachments: [attachment],
      color: "violet",
    });
    expect(retry.parentIds).not.toBe(source.parentIds);
    expect(retry.attachments).not.toBe(source.attachments);
  });

  it("builds sibling context without the source answer or unrelated siblings", () => {
    const root = conversation({ id: "root", prompt: "Root", response: "Root answer" });
    const source = conversation({ parentIds: [root.id] });
    const unrelated = conversation({
      id: "other",
      parentIds: [root.id],
      prompt: "Other path",
      response: "Other answer",
    });
    const retry = createSiblingRetryInput(source);

    const context = buildChatContext(
      [root, source, unrelated],
      retry.parentIds,
      retry.prompt,
      retry.attachments,
    );

    expect(context.messages).toEqual([
      { role: "user", content: root.prompt },
      { role: "assistant", content: root.response },
      { role: "user", content: source.prompt },
    ]);
  });

  it("retries a root as another independent root", () => {
    const source = conversation();
    const retry = createSiblingRetryInput(source);

    expect(
      buildChatContext([source], retry.parentIds, retry.prompt).messages,
    ).toEqual([{ role: "user", content: source.prompt }]);
  });
});
