import { Position, type XYPosition } from "@xyflow/react";

export type FloatingNodeRect = XYPosition & {
  width: number;
  height: number;
};

export type FloatingEndpoint = XYPosition & {
  position: Position;
};

export type FloatingConnection = {
  source: FloatingEndpoint;
  target: FloatingEndpoint;
};

function isUsableRect(rect: FloatingNodeRect): boolean {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function centerOf(rect: FloatingNodeRect): XYPosition {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function endpointToward(
  rect: FloatingNodeRect,
  toward: XYPosition,
  coincidentPosition: Position,
): FloatingEndpoint {
  const center = centerOf(rect);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;

  if (dx === 0 && dy === 0) {
    return coincidentPosition === Position.Right
      ? { x: rect.x + rect.width, y: center.y, position: Position.Right }
      : { x: rect.x, y: center.y, position: Position.Left };
  }

  const horizontalRatio = Math.abs(dx) / (rect.width / 2);
  const verticalRatio = Math.abs(dy) / (rect.height / 2);
  const scale = 1 / Math.max(horizontalRatio, verticalRatio);

  let position: Position;
  if (horizontalRatio >= verticalRatio) {
    position = dx >= 0 ? Position.Right : Position.Left;
  } else {
    position = dy >= 0 ? Position.Bottom : Position.Top;
  }

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
    position,
  };
}

export function getFloatingConnection(
  sourceRect: FloatingNodeRect,
  targetRect: FloatingNodeRect,
): FloatingConnection | null {
  if (!isUsableRect(sourceRect) || !isUsableRect(targetRect)) return null;

  const sourceCenter = centerOf(sourceRect);
  const targetCenter = centerOf(targetRect);

  if (sourceCenter.x === targetCenter.x && sourceCenter.y === targetCenter.y) {
    return {
      source: endpointToward(sourceRect, targetCenter, Position.Right),
      target: endpointToward(targetRect, sourceCenter, Position.Left),
    };
  }

  return {
    source: endpointToward(sourceRect, targetCenter, Position.Right),
    target: endpointToward(targetRect, sourceCenter, Position.Left),
  };
}
