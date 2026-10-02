import { describe, expect, it } from "vitest";
import {
  AUTO_NODE_MAX_WIDTH,
  AUTO_NODE_MIN_WIDTH,
  getAutomaticNodeWidth,
  getConversationNodeWidth,
} from "./node-sizing";

describe("automatic node sizing", () => {
  it("grows through bounded width tiers as content increases", () => {
    expect(getAutomaticNodeWidth({ prompt: "Short", response: "Reply" })).toBe(
      AUTO_NODE_MIN_WIDTH,
    );
    expect(getAutomaticNodeWidth({ prompt: "p", response: "r".repeat(479) })).toBe(430);
    expect(getAutomaticNodeWidth({ prompt: "", response: "r".repeat(1200) })).toBe(520);
    expect(getAutomaticNodeWidth({ prompt: "", response: "r".repeat(2600) })).toBe(
      AUTO_NODE_MAX_WIDTH,
    );
  });

  it("uses a persisted manual width instead of the automatic width", () => {
    expect(
      getConversationNodeWidth({
        prompt: "p",
        response: "r".repeat(3000),
        size: { width: 475, height: 700 },
      }),
    ).toBe(475);
  });

  it("starts file nodes wider without overriding content tiers", () => {
    const attachment = {
      id: "asset",
      kind: "text" as const,
      name: "notes.txt",
      mimeType: "text/plain",
      size: 10,
      createdAt: 1,
    };
    expect(
      getAutomaticNodeWidth({ prompt: "", response: "", attachments: [attachment] }),
    ).toBe(430);
    expect(
      getAutomaticNodeWidth({
        prompt: "",
        response: "",
        attachments: [{ ...attachment, kind: "image", name: "photo.png" }],
      }),
    ).toBe(520);
  });
});
