export type ShortcutCategory = "Global" | "Workspace" | "Canvas" | "Selected conversation" | "Editor";

export type ShortcutCommandId =
  | "help"
  | "dismiss"
  | "composer.focus"
  | "settings.open"
  | "workspace.new"
  | "workspace.previous"
  | "workspace.next"
  | "workspace.newRoot"
  | "theme.toggle"
  | "canvas.select"
  | "canvas.compare"
  | "canvas.note"
  | "canvas.pen"
  | "canvas.eraser"
  | "canvas.fit"
  | "canvas.zoomIn"
  | "canvas.zoomOut"
  | "canvas.undoInk"
  | "canvas.redoInk"
  | "selection.branch"
  | "selection.mute"
  | "selection.merge"
  | "selection.stop"
  | "selection.resetSize"
  | "selection.delete"
  | "selection.nudgeUp"
  | "selection.nudgeDown"
  | "selection.nudgeLeft"
  | "selection.nudgeRight"
  | "editor.send"
  | "editor.newline"
  | "editor.finishSticky";

export type ShortcutBinding = {
  key: string;
  shift?: boolean;
  mod?: boolean;
  label?: string;
};

export type ShortcutDefinition = {
  id: ShortcutCommandId;
  label: string;
  category: ShortcutCategory;
  bindings: ShortcutBinding[];
  description?: string;
};

export type EscapeLayer =
  | "help"
  | "settings"
  | "route-picker"
  | "attachment-menu"
  | "sticky-editor"
  | "merge"
  | null;

export function resolveEscapeLayer(state: {
  help: boolean;
  settings: boolean;
  routePicker: boolean;
  attachmentMenu: boolean;
  stickyEditor: boolean;
  merge: boolean;
}): EscapeLayer {
  if (state.help) return "help";
  if (state.settings) return "settings";
  if (state.routePicker) return "route-picker";
  if (state.attachmentMenu) return "attachment-menu";
  if (state.stickyEditor) return "sticky-editor";
  if (state.merge) return "merge";
  return null;
}

export const SHORTCUTS: ShortcutDefinition[] = [
  { id: "help", label: "Keyboard shortcuts", category: "Global", bindings: [{ key: "?" }] },
  { id: "dismiss", label: "Close the topmost layer", category: "Global", bindings: [{ key: "Escape", label: "Esc" }] },
  { id: "composer.focus", label: "Focus prompt composer", category: "Global", bindings: [{ key: "/" }] },
  { id: "settings.open", label: "Open settings", category: "Global", bindings: [{ key: "s", shift: true }] },
  { id: "theme.toggle", label: "Toggle light or dark theme", category: "Global", bindings: [{ key: "t" }] },
  { id: "workspace.new", label: "Create whiteboard", category: "Workspace", bindings: [{ key: "n", shift: true }] },
  { id: "workspace.previous", label: "Previous whiteboard", category: "Workspace", bindings: [{ key: "[" }] },
  { id: "workspace.next", label: "Next whiteboard", category: "Workspace", bindings: [{ key: "]" }] },
  { id: "workspace.newRoot", label: "Start a new root", category: "Workspace", bindings: [{ key: "r", shift: true }] },
  { id: "canvas.select", label: "Select and pan tool", category: "Canvas", bindings: [{ key: "v" }] },
  { id: "canvas.compare", label: "Box-select token comparison", category: "Canvas", bindings: [{ key: "x" }] },
  { id: "canvas.note", label: "Sticky note tool", category: "Canvas", bindings: [{ key: "n" }] },
  { id: "canvas.pen", label: "Pen tool", category: "Canvas", bindings: [{ key: "p" }] },
  { id: "canvas.eraser", label: "Stroke eraser", category: "Canvas", bindings: [{ key: "e" }] },
  { id: "canvas.fit", label: "Fit all board content", category: "Canvas", bindings: [{ key: "f" }] },
  { id: "canvas.zoomIn", label: "Zoom in", category: "Canvas", bindings: [{ key: "+" }] },
  { id: "canvas.zoomOut", label: "Zoom out", category: "Canvas", bindings: [{ key: "-" }] },
  { id: "canvas.undoInk", label: "Undo ink change", category: "Canvas", bindings: [{ key: "z", mod: true }] },
  { id: "canvas.redoInk", label: "Redo ink change", category: "Canvas", bindings: [{ key: "z", mod: true, shift: true }, { key: "y", mod: true }] },
  { id: "selection.branch", label: "Create empty branch", category: "Selected conversation", bindings: [{ key: "b" }] },
  { id: "selection.mute", label: "Mute or unmute context", category: "Selected conversation", bindings: [{ key: "m" }] },
  { id: "selection.merge", label: "Start or cancel draft merge", category: "Selected conversation", bindings: [{ key: "g" }] },
  { id: "selection.stop", label: "Stop generation", category: "Selected conversation", bindings: [{ key: "s" }] },
  { id: "selection.resetSize", label: "Return to automatic size", category: "Selected conversation", bindings: [{ key: "r" }] },
  { id: "selection.delete", label: "Delete selection safely", category: "Selected conversation", bindings: [{ key: "Delete", label: "Del" }, { key: "Backspace", label: "Backspace" }] },
  { id: "selection.nudgeUp", label: "Nudge selection up", category: "Selected conversation", bindings: [{ key: "ArrowUp", label: "↑" }], description: "Hold Shift for 32 px" },
  { id: "selection.nudgeDown", label: "Nudge selection down", category: "Selected conversation", bindings: [{ key: "ArrowDown", label: "↓" }], description: "Hold Shift for 32 px" },
  { id: "selection.nudgeLeft", label: "Nudge selection left", category: "Selected conversation", bindings: [{ key: "ArrowLeft", label: "←" }], description: "Hold Shift for 32 px" },
  { id: "selection.nudgeRight", label: "Nudge selection right", category: "Selected conversation", bindings: [{ key: "ArrowRight", label: "→" }], description: "Hold Shift for 32 px" },
  { id: "editor.send", label: "Send prompt", category: "Editor", bindings: [{ key: "Enter" }] },
  { id: "editor.newline", label: "Insert new line", category: "Editor", bindings: [{ key: "Enter", shift: true }] },
  { id: "editor.finishSticky", label: "Finish sticky-note editing", category: "Editor", bindings: [{ key: "Enter", mod: true }] },
];

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable ||
    Boolean(target.closest(".cm-editor"))
  );
}

export function matchesShortcut(
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">,
  binding: ShortcutBinding,
): boolean {
  if (event.altKey) return false;
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const bindingKey = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key;
  if (eventKey !== bindingKey) return false;
  if (Boolean(binding.mod) !== Boolean(event.ctrlKey || event.metaKey)) return false;
  return binding.key === "?" ||
    binding.key === "+" ||
    binding.key.startsWith("Arrow") ||
    Boolean(binding.shift) === event.shiftKey;
}

export function findShortcutCommand(
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">,
): ShortcutCommandId | null {
  return SHORTCUTS.find((shortcut) =>
    shortcut.bindings.some((binding) => matchesShortcut(event, binding)))?.id ?? null;
}

export function formatShortcutBinding(
  binding: ShortcutBinding,
  isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform),
): string {
  if (binding.label) return [binding.mod ? isMac ? "⌘" : "Ctrl" : "", binding.shift ? "Shift" : "", binding.label]
    .filter(Boolean)
    .join(isMac ? "" : "+");
  const key = binding.key.length === 1 ? binding.key.toUpperCase() : binding.key;
  return [binding.mod ? isMac ? "⌘" : "Ctrl" : "", binding.shift ? "Shift" : "", key]
    .filter(Boolean)
    .join(isMac ? "" : "+");
}

export function ariaShortcut(id: ShortcutCommandId): string | undefined {
  const binding = SHORTCUTS.find((shortcut) => shortcut.id === id)?.bindings[0];
  if (!binding) return undefined;
  return [binding.mod ? "Control" : "", binding.shift ? "Shift" : "", binding.key]
    .filter(Boolean)
    .join("+");
}
