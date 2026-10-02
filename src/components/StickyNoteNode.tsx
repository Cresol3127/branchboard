import { memo, useEffect, useRef, useState } from "react";
import {
  NodeResizeControl,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  MAX_STICKY_TEXT_LENGTH,
  STICKY_NOTE_MAX_SIZE,
  STICKY_NOTE_MIN_SIZE,
} from "../lib/annotations";
import type { StickyColor, StickyNote } from "../types";
import { IconButton, MaterialSymbol } from "./material";

const COLORS: StickyColor[] = ["yellow", "pink", "blue", "green", "neutral"];

export type StickyNodeData = {
  note: StickyNote;
  autoFocus: boolean;
  groupSelected: boolean;
  onTextCommit: (id: string, text: string) => void;
  onColorCommit: (id: string, color: StickyColor) => void;
  onDelete: (id: string) => void;
  onResizeStart: (id: string) => void;
  onResizeEnd: (id: string, size: { width: number; height: number }) => void;
} & Record<string, unknown>;

export type StickyFlowNode = Node<StickyNodeData, "sticky">;

function StickyNoteNodeView({ data, selected }: NodeProps<StickyFlowNode>) {
  const [text, setText] = useState(data.note.text);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setText(data.note.text), [data.note.text]);
  useEffect(() => {
    if (!data.autoFocus) return;
    editorRef.current?.focus();
  }, [data.autoFocus]);

  const commitText = () => {
    if (text !== data.note.text) data.onTextCommit(data.note.id, text);
  };

  return (
    <article className={`sticky-note sticky-${data.note.color}${selected ? " is-selected" : ""}${data.groupSelected ? " is-group-selected" : ""}`}>
      {selected && !data.groupSelected && (
        <NodeResizeControl
          position="bottom-right"
          minWidth={STICKY_NOTE_MIN_SIZE.width}
          minHeight={STICKY_NOTE_MIN_SIZE.height}
          maxWidth={STICKY_NOTE_MAX_SIZE.width}
          maxHeight={STICKY_NOTE_MAX_SIZE.height}
          className="sticky-resize-control nodrag"
          onResizeStart={() => data.onResizeStart(data.note.id)}
          onResizeEnd={(_, resize) =>
            data.onResizeEnd(data.note.id, {
              width: resize.width,
              height: resize.height,
            })
          }
        />
      )}
      <header className="sticky-drag-handle">
        <span>NOTE</span>
        <IconButton
          className="nodrag"
          label="Delete sticky note"
          icon="delete"
          onClick={(event) => {
            event.stopPropagation();
            data.onDelete(data.note.id);
          }}
        />
      </header>
      <textarea
        ref={editorRef}
        className="nodrag nowheel nopan"
        aria-label="Sticky note text"
        aria-keyshortcuts="Control+Enter Escape"
        value={text}
        maxLength={MAX_STICKY_TEXT_LENGTH}
        placeholder="Write a note..."
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          data.onTextCommit(data.note.id, next);
        }}
        onBlur={commitText}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            commitText();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            commitText();
            event.currentTarget.blur();
            event.currentTarget
              .closest<HTMLElement>(".board-canvas-frame")
              ?.focus();
          }
        }}
      />
      <footer className="nodrag nowheel nopan">
        <MaterialSymbol name="palette" size={20} />
        <div className="sticky-colors" aria-label="Sticky note color">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`sticky-color sticky-color-${color}${data.note.color === color ? " active" : ""}`}
              aria-label={`${color} sticky note`}
              aria-pressed={data.note.color === color}
              onClick={() => data.onColorCommit(data.note.id, color)}
            />
          ))}
        </div>
      </footer>
    </article>
  );
}

export const StickyNoteNode = memo(StickyNoteNodeView, (previous, next) =>
  previous.selected === next.selected &&
  previous.data.note === next.data.note &&
  previous.data.autoFocus === next.data.autoFocus &&
  previous.data.groupSelected === next.data.groupSelected &&
  previous.data.onTextCommit === next.data.onTextCommit &&
  previous.data.onColorCommit === next.data.onColorCommit &&
  previous.data.onDelete === next.data.onDelete &&
  previous.data.onResizeStart === next.data.onResizeStart &&
  previous.data.onResizeEnd === next.data.onResizeEnd
);
