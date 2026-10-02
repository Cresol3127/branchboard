import { memo } from "react";
import { ViewportPortal } from "@xyflow/react";
import {
  getInkStrokeBounds,
  inkStrokePath,
} from "../lib/annotations";
import type { InkStroke } from "../types";

type InkLayerProps = {
  strokes: InkStroke[];
  currentStroke: InkStroke | null;
  hiddenStrokeIds: ReadonlySet<string>;
  selectedStrokeIds: ReadonlySet<string>;
  selectionOffset: { x: number; y: number };
};

function StrokePath({
  stroke,
  preview = false,
  selected = false,
  selectionOffset,
}: {
  stroke: InkStroke;
  preview?: boolean;
  selected?: boolean;
  selectionOffset?: { x: number; y: number };
}) {
  const bounds = getInkStrokeBounds(stroke);
  const localPoints = stroke.points.map((point) => ({
    ...point,
    x: point.x - bounds.x,
    y: point.y - bounds.y,
  }));
  return (
    <svg
      className={`ink-stroke ink-${stroke.color}${preview ? " is-preview" : ""}${selected ? " is-selected" : ""}`}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        ...(selected && selectionOffset
          ? { transform: `translate(${selectionOffset.x}px, ${selectionOffset.y}px)` }
          : {}),
      }}
      viewBox={`0 0 ${bounds.width} ${bounds.height}`}
      aria-hidden="true"
    >
      <path
        d={inkStrokePath(localPoints)}
        strokeWidth={stroke.width}
      />
    </svg>
  );
}

function InkLayerView({
  strokes,
  currentStroke,
  hiddenStrokeIds,
  selectedStrokeIds,
  selectionOffset,
}: InkLayerProps) {
  return (
    <ViewportPortal>
      <div className="ink-layer" aria-hidden="true">
        {strokes.map((stroke) =>
          hiddenStrokeIds.has(stroke.id) ? null : (
            <StrokePath
              key={stroke.id}
              stroke={stroke}
              selected={selectedStrokeIds.has(stroke.id)}
              selectionOffset={selectionOffset}
            />
          ),
        )}
        {currentStroke && <StrokePath stroke={currentStroke} preview />}
      </div>
    </ViewportPortal>
  );
}

export const InkLayer = memo(InkLayerView);
