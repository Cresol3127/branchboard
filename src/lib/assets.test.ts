import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { AttachmentRef, WhiteboardCollection } from "../types";
import {
  attachmentRefForFile,
  classifyAttachment,
  formatFileSize,
  garbageCollectAttachments,
  getAttachmentBlob,
  getAttachmentText,
  storeAttachments,
  validateFiles,
} from "./assets";

function collectionWith(attachments: AttachmentRef[]): WhiteboardCollection {
  return {
    version: 1,
    activeBoardId: "board",
    boards: [
      {
        id: "board",
        name: "Board",
        selectedNodeId: "node",
        createdAt: 1,
        updatedAt: 1,
        notes: [],
        strokes: [],
        nodes: [
          {
            id: "node",
            parentIds: [],
            prompt: "Read these",
            response: "Done",
            attachments,
            muted: false,
            status: "complete",
            position: { x: 0, y: 0 },
            createdAt: 1,
          },
        ],
      },
    ],
  };
}

describe("attachment assets", () => {
  it("classifies safe preview types and treats SVG as text", () => {
    expect(classifyAttachment({ name: "photo.png", type: "image/png" })).toBe("image");
    expect(classifyAttachment({ name: "clip.mp4", type: "video/mp4" })).toBe("video");
    expect(classifyAttachment({ name: "paper.pdf", type: "" })).toBe("pdf");
    expect(classifyAttachment({ name: "vector.svg", type: "image/svg+xml" })).toBe("text");
    expect(classifyAttachment({ name: "archive.zip", type: "application/zip" })).toBe("file");
  });

  it("validates per-file, count, and combined limits", () => {
    expect(() => validateFiles([new File([], "empty.txt")])).toThrow("is empty");
    expect(() =>
      validateFiles([new File(["ok"], "extra.txt")], 10),
    ).toThrow("Attach up to 10 files");
  });

  it("stores blobs separately and garbage collects only unreferenced assets", async () => {
    const keepFile = new File(["kept text"], "keep.txt", { type: "text/plain" });
    const removeFile = new File(["remove"], "remove.txt", { type: "text/plain" });
    const keep = attachmentRefForFile(keepFile, `keep-${crypto.randomUUID()}`);
    const remove = attachmentRefForFile(removeFile, `remove-${crypto.randomUUID()}`);
    await storeAttachments([
      { ref: keep, file: keepFile },
      { ref: remove, file: removeFile },
    ]);

    expect(await getAttachmentText(keep)).toBe("kept text");
    await garbageCollectAttachments(collectionWith([keep]));
    expect(await (await getAttachmentBlob(keep.id)).text()).toBe("kept text");
    await expect(getAttachmentBlob(remove.id)).rejects.toThrow("missing");
  });

  it("preserves staged assets during collection", async () => {
    const file = new File(["staged"], "staged.txt", { type: "text/plain" });
    const ref = attachmentRefForFile(file, `staged-${crypto.randomUUID()}`);
    await storeAttachments([{ ref, file }]);

    await garbageCollectAttachments(collectionWith([]), [ref.id]);

    expect(await getAttachmentText(ref)).toBe("staged");
  });

  it("formats local file sizes", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(12 * 1024 * 1024)).toBe("12 MB");
  });
});
