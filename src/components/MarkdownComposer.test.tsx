// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  MarkdownComposer,
  type MarkdownComposerHandle,
} from "./MarkdownComposer";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  Object.defineProperty(document, "compatMode", {
    configurable: true,
    value: "CSS1Compat",
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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

describe("MarkdownComposer", () => {
  it("renders inactive Markdown, local math, and inert image placeholders", () => {
    mount(
      <MarkdownComposer
        value="Before **bold** and $x^2$ ![pixel](https://tracker.invalid/pixel.png)"
        placeholder="Write"
        maxLength={12000}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(host?.querySelector(".cm-live-strong")?.textContent).toBe("bold");
    expect(host?.querySelector(".cm-live-math .katex")).not.toBeNull();
    expect(host?.querySelector(".cm-live-image-placeholder")?.textContent).toBe(
      "[Image: pixel]",
    );
    expect(host?.querySelector("img[src]")).toBeNull();
    expect(host?.textContent).not.toContain("tracker.invalid");
  });

  it("reveals equation source when its rendered widget is selected", () => {
    mount(
      <MarkdownComposer
        value="Equation $x^2$"
        placeholder="Write"
        maxLength={12000}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    const math = host?.querySelector<HTMLElement>(".cm-live-math");
    expect(math).not.toBeNull();
    act(() => {
      math?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    });

    expect(host?.querySelector(".cm-live-math")).toBeNull();
    expect(host?.querySelector(".cm-content")?.textContent).toContain("$x^2$");
  });

  it("keeps Shift+Enter as a newline and submits the current document on Enter", () => {
    const submitted = vi.fn();
    let editorHandle: MarkdownComposerHandle | null = null;

    function Harness() {
      const [value, setValue] = useState("Hello");
      return (
        <MarkdownComposer
          ref={(handle) => {
            editorHandle = handle;
          }}
          value={value}
          placeholder="Write"
          maxLength={12000}
          onChange={setValue}
          onSubmit={submitted}
        />
      );
    }

    mount(<Harness />);
    act(() => editorHandle?.focus());
    const content = host?.querySelector<HTMLElement>(".cm-content");
    expect(content).not.toBeNull();

    act(() => {
      content?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(submitted).not.toHaveBeenCalled();

    act(() => {
      content?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(submitted).toHaveBeenCalledWith("\nHello");
  });

  it("applies controlled resets without emitting a duplicate change", () => {
    const onChange = vi.fn();
    const render = (value: string) => (
      <MarkdownComposer
        value={value}
        placeholder="Write"
        maxLength={12000}
        onChange={onChange}
        onSubmit={() => undefined}
      />
    );

    mount(render("Discard me"));
    act(() => root?.render(render("")));

    expect(host?.querySelector(".cm-content")?.textContent).not.toContain("Discard me");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("passes pasted and dropped files to the attachment handler", () => {
    const onFiles = vi.fn();
    mount(
      <MarkdownComposer
        value=""
        placeholder="Write"
        maxLength={12000}
        onChange={() => undefined}
        onFiles={onFiles}
        onSubmit={() => undefined}
      />,
    );
    const content = host?.querySelector<HTMLElement>(".cm-content");
    const image = new File(["image"], "photo.png", { type: "image/png" });
    const notes = new File(["notes"], "notes.txt", { type: "text/plain" });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { files: [image] },
    });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [notes] },
    });

    act(() => {
      content?.dispatchEvent(paste);
      content?.dispatchEvent(drop);
    });

    expect(paste.defaultPrevented).toBe(true);
    expect(drop.defaultPrevented).toBe(true);
    expect(onFiles).toHaveBeenNthCalledWith(1, [image]);
    expect(onFiles).toHaveBeenNthCalledWith(2, [notes]);
  });

  it("leaves ordinary text paste to CodeMirror", () => {
    const onFiles = vi.fn();
    mount(
      <MarkdownComposer
        value=""
        placeholder="Write"
        maxLength={12000}
        onChange={() => undefined}
        onFiles={onFiles}
        onSubmit={() => undefined}
      />,
    );
    const content = host?.querySelector<HTMLElement>(".cm-content");
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { files: [], getData: () => "plain text" },
    });

    act(() => content?.dispatchEvent(paste));

    expect(onFiles).not.toHaveBeenCalled();
  });
});
