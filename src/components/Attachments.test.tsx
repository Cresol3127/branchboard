// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { attachmentRefForFile, storeAttachments } from "../lib/assets";
import type { AttachmentRef } from "../types";
import { AttachmentTray, StoredAttachments } from "./Attachments";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let objectUrlIndex = 0;

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => `blob:branchboard-${objectUrlIndex += 1}`,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

function mount(element: React.ReactNode): void {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function reference(overrides: Partial<AttachmentRef> = {}): AttachmentRef {
  return {
    id: crypto.randomUUID(),
    kind: "text",
    name: "notes.txt",
    mimeType: "text/plain",
    size: 5,
    createdAt: 1,
    ...overrides,
  };
}

describe("attachments", () => {
  it("renders removable pending files with local-only previews", () => {
    const onRemove = vi.fn();
    const file = new File(["image"], "photo.png", { type: "image/png" });
    const ref = attachmentRefForFile(file);
    mount(<AttachmentTray attachments={[{ ref, file }]} onRemove={onRemove} />);

    const image = host?.querySelector<HTMLImageElement>("img");
    expect(image?.src).toContain("blob:branchboard-");
    expect(host?.textContent).toContain("photo.png");
    act(() =>
      host
        ?.querySelector<HTMLButtonElement>(`button[aria-label="Remove photo.png"]`)
        ?.click(),
    );
    expect(onRemove).toHaveBeenCalledWith(ref.id);
  });

  it("loads persisted images from IndexedDB rather than remote URLs", async () => {
    const file = new File(["image"], "stored.png", { type: "image/png" });
    const ref = attachmentRefForFile(file, `stored-${crypto.randomUUID()}`);
    await storeAttachments([{ ref, file }]);
    mount(<StoredAttachments attachments={[ref]} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const image = host?.querySelector<HTMLImageElement>("img");
    expect(image?.src).toContain("blob:branchboard-");
    const mediaUrls = [
      ...Array.from(host?.querySelectorAll<HTMLImageElement>("img[src]") ?? []).map(
        (element) => element.src,
      ),
      ...Array.from(host?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? []).map(
        (element) => element.href,
      ),
    ];
    expect(mediaUrls.every((url) => url.startsWith("blob:"))).toBe(true);
  });

  it("shows a local missing-file state without making a network request", async () => {
    mount(<StoredAttachments attachments={[reference({ id: `missing-${crypto.randomUUID()}` })]} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.textContent).toContain("Missing locally");
    expect(host?.querySelector("a")).toBeNull();
  });
});
