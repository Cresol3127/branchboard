import { describe, expect, it } from "vitest";
import {
  findShortcutCommand,
  formatShortcutBinding,
  matchesShortcut,
  resolveEscapeLayer,
} from "./shortcuts";

function key(
  value: string,
  modifiers: Partial<Pick<KeyboardEvent, "shiftKey" | "ctrlKey" | "metaKey" | "altKey">> = {},
) {
  return {
    key: value,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...modifiers,
  };
}

describe("shortcuts", () => {
  it("distinguishes shifted workspace commands from canvas tools", () => {
    expect(findShortcutCommand(key("N", { shiftKey: true }))).toBe("workspace.new");
    expect(findShortcutCommand(key("n"))).toBe("canvas.note");
    expect(findShortcutCommand(key("R", { shiftKey: true }))).toBe("workspace.newRoot");
    expect(findShortcutCommand(key("r"))).toBe("selection.resetSize");
    expect(findShortcutCommand(key("x"))).toBe("canvas.compare");
    expect(findShortcutCommand(key("h"))).toBeNull();
  });

  it("matches question mark and platform modifiers without accepting Alt", () => {
    expect(findShortcutCommand(key("?", { shiftKey: true }))).toBe("help");
    expect(matchesShortcut(key("z", { ctrlKey: true }), { key: "z", mod: true })).toBe(true);
    expect(matchesShortcut(key("z", { ctrlKey: true, altKey: true }), { key: "z", mod: true })).toBe(false);
  });

  it("finds arrows, deletion, zoom, and ink redo", () => {
    expect(findShortcutCommand(key("ArrowLeft", { shiftKey: true }))).toBe("selection.nudgeLeft");
    expect(findShortcutCommand(key("Delete"))).toBe("selection.delete");
    expect(findShortcutCommand(key("+", { shiftKey: true }))).toBe("canvas.zoomIn");
    expect(findShortcutCommand(key("Z", { shiftKey: true, metaKey: true }))).toBe("canvas.redoInk");
  });

  it("formats platform-aware labels", () => {
    expect(formatShortcutBinding({ key: "z", mod: true, shift: true }, true)).toBe("⌘ShiftZ");
    expect(formatShortcutBinding({ key: "z", mod: true }, false)).toBe("Ctrl+Z");
  });

  it("resolves only the highest-priority Escape layer", () => {
    expect(resolveEscapeLayer({
      help: true,
      settings: true,
      routePicker: true,
      attachmentMenu: true,
      stickyEditor: true,
      merge: true,
    })).toBe("help");
    expect(resolveEscapeLayer({
      help: false,
      settings: false,
      routePicker: false,
      attachmentMenu: false,
      stickyEditor: true,
      merge: true,
    })).toBe("sticky-editor");
    expect(resolveEscapeLayer({
      help: false,
      settings: false,
      routePicker: false,
      attachmentMenu: false,
      stickyEditor: false,
      merge: true,
    })).toBe("merge");
  });
});
