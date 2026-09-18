import { useEffect, useRef, type PointerEvent } from 'react';

// Keep the selection anchor stable: Chromium can otherwise collapse it while dragging
// through text inside a fractionally scaled, scrollable canvas card.
export function useCanvasTextSelection() {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  return (event: PointerEvent<HTMLElement>) => {
    const root = event.currentTarget;
    const target = event.target as HTMLElement;
    if (
      event.button !== 0 ||
      event.pointerType !== 'mouse' ||
      !root.closest('.text-selection-mode') ||
      root.closest('.space-panning') ||
      !target.closest('.markdown') ||
      target.closest('button, input, textarea, a, [contenteditable="true"]')
    )
      return;
    const caret = (x: number, y: number) => {
      const doc = document as Document & {
        caretPositionFromPoint?: (
          x: number,
          y: number,
        ) => { offsetNode: Node; offset: number } | null;
      };
      const position = doc.caretPositionFromPoint?.(x, y);
      if (position) return { node: position.offsetNode, offset: position.offset };
      const range = document.caretRangeFromPoint?.(x, y);
      return range ? { node: range.startContainer, offset: range.startOffset } : null;
    };
    const start = caret(event.clientX, event.clientY);
    const selection = window.getSelection();
    if (!start || !selection || !root.contains(start.node)) return;
    event.preventDefault();
    cleanup.current?.();
    const anchor =
      event.shiftKey && selection.anchorNode
        ? { node: selection.anchorNode, offset: selection.anchorOffset }
        : start;
    selection.setBaseAndExtent(anchor.node, anchor.offset, start.node, start.offset);
    const move = (e: globalThis.PointerEvent) => {
      const end = caret(e.clientX, e.clientY);
      if (end && root.contains(end.node) && anchor.node.isConnected)
        selection.setBaseAndExtent(anchor.node, anchor.offset, end.node, end.offset);
    };
    const finish = () => cleanup.current?.();
    cleanup.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      cleanup.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
  };
}
