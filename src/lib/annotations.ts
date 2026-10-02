import type { XYPosition } from "@xyflow/react";
import type {
  BoardViewport,
  InkPoint,
  InkStroke,
  PenColor,
  StickyColor,
  StickyNote,
} from "../types";
import {
  findCollisionFreePosition,
  type NodeBounds,
  type NodeSize,
} from "./node-collision";

export const STICKY_NOTE_SIZE = { width: 240, height: 190 } as const;
export const STICKY_NOTE_MIN_SIZE = { width: 180, height: 140 } as const;
export const STICKY_NOTE_MAX_SIZE = { width: 600, height: 600 } as const;
export const MAX_STICKY_NOTES = 200;
export const MAX_INK_STROKES = 1000;
export const MAX_STROKE_POINTS = 4000;
export const MAX_STICKY_TEXT_LENGTH = 4000;

const STICKY_COLORS = new Set<StickyColor>([
  "yellow",
  "pink",
  "blue",
  "green",
  "neutral",
]);
const PEN_COLORS = new Set<PenColor>([
  "ink",
  "acid",
  "red",
  "blue",
  "violet",
]);

export type AxisAlignedRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeStickyNote(value: unknown): StickyNote | null {
  if (!value || typeof value !== "object") return null;
  const note = value as Partial<StickyNote>;
  if (
    typeof note.id !== "string" ||
    typeof note.text !== "string" ||
    !note.position ||
    !finite(note.position.x) ||
    !finite(note.position.y) ||
    !note.size ||
    !finite(note.size.width) ||
    !finite(note.size.height) ||
    !note.color ||
    !STICKY_COLORS.has(note.color)
  ) {
    return null;
  }

  const createdAt = finite(note.createdAt) ? note.createdAt : Date.now();
  return {
    id: note.id,
    text: note.text.slice(0, MAX_STICKY_TEXT_LENGTH),
    position: { x: note.position.x, y: note.position.y },
    size: {
      width: clamp(
        note.size.width,
        STICKY_NOTE_MIN_SIZE.width,
        STICKY_NOTE_MAX_SIZE.width,
      ),
      height: clamp(
        note.size.height,
        STICKY_NOTE_MIN_SIZE.height,
        STICKY_NOTE_MAX_SIZE.height,
      ),
    },
    color: note.color,
    createdAt,
    updatedAt: finite(note.updatedAt) ? note.updatedAt : createdAt,
  };
}

export function normalizeInkStroke(value: unknown): InkStroke | null {
  if (!value || typeof value !== "object") return null;
  const stroke = value as Partial<InkStroke>;
  if (
    typeof stroke.id !== "string" ||
    !stroke.color ||
    !PEN_COLORS.has(stroke.color) ||
    !finite(stroke.width) ||
    !Array.isArray(stroke.points)
  ) {
    return null;
  }

  const points = stroke.points
    .slice(0, MAX_STROKE_POINTS)
    .filter(
      (point): point is InkPoint =>
        Boolean(point && finite(point.x) && finite(point.y)),
    )
    .map((point) => ({
      x: point.x,
      y: point.y,
      ...(finite(point.pressure)
        ? { pressure: clamp(point.pressure, 0, 1) }
        : {}),
    }));
  if (points.length < 2) return null;

  return {
    id: stroke.id,
    points,
    color: stroke.color,
    width: clamp(stroke.width, 1, 24),
    createdAt: finite(stroke.createdAt) ? stroke.createdAt : Date.now(),
  };
}

export function normalizeViewport(value: unknown): BoardViewport | undefined {
  if (!value || typeof value !== "object") return undefined;
  const viewport = value as Partial<BoardViewport>;
  if (!finite(viewport.x) || !finite(viewport.y) || !finite(viewport.zoom)) {
    return undefined;
  }
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: clamp(viewport.zoom, 0.2, 1.5),
  };
}

export function getStickyNoteBounds(notes: readonly StickyNote[]): NodeBounds[] {
  return notes.map((note) => ({
    id: note.id,
    ...note.position,
    ...note.size,
  }));
}

export function findPositionForStickyNote(
  preferred: XYPosition,
  size: NodeSize,
  notes: readonly StickyNote[],
): XYPosition {
  return findCollisionFreePosition(
    preferred,
    size,
    getStickyNoteBounds(notes),
  );
}

function distanceToSegment(point: InkPoint, start: InkPoint, end: InkPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) /
      (dx * dx + dy * dy),
    0,
    1,
  );
  return Math.hypot(
    point.x - (start.x + ratio * dx),
    point.y - (start.y + ratio * dy),
  );
}

function pointIsOnSegment(point: InkPoint, start: InkPoint, end: InkPoint): boolean {
  return (
    point.x >= Math.min(start.x, end.x) &&
    point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) &&
    point.y <= Math.max(start.y, end.y)
  );
}

function segmentCrossProduct(start: InkPoint, end: InkPoint, point: InkPoint): number {
  return (
    (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x)
  );
}

function segmentsIntersect(
  firstStart: InkPoint,
  firstEnd: InkPoint,
  secondStart: InkPoint,
  secondEnd: InkPoint,
): boolean {
  const firstToSecondStart = segmentCrossProduct(firstStart, firstEnd, secondStart);
  const firstToSecondEnd = segmentCrossProduct(firstStart, firstEnd, secondEnd);
  const secondToFirstStart = segmentCrossProduct(secondStart, secondEnd, firstStart);
  const secondToFirstEnd = segmentCrossProduct(secondStart, secondEnd, firstEnd);

  if (
    ((firstToSecondStart > 0 && firstToSecondEnd < 0) ||
      (firstToSecondStart < 0 && firstToSecondEnd > 0)) &&
    ((secondToFirstStart > 0 && secondToFirstEnd < 0) ||
      (secondToFirstStart < 0 && secondToFirstEnd > 0))
  ) {
    return true;
  }

  return (
    (firstToSecondStart === 0 && pointIsOnSegment(secondStart, firstStart, firstEnd)) ||
    (firstToSecondEnd === 0 && pointIsOnSegment(secondEnd, firstStart, firstEnd)) ||
    (secondToFirstStart === 0 && pointIsOnSegment(firstStart, secondStart, secondEnd)) ||
    (secondToFirstEnd === 0 && pointIsOnSegment(firstEnd, secondStart, secondEnd))
  );
}

function distanceBetweenSegments(
  firstStart: InkPoint,
  firstEnd: InkPoint,
  secondStart: InkPoint,
  secondEnd: InkPoint,
): number {
  if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return 0;
  return Math.min(
    distanceToSegment(firstStart, secondStart, secondEnd),
    distanceToSegment(firstEnd, secondStart, secondEnd),
    distanceToSegment(secondStart, firstStart, firstEnd),
    distanceToSegment(secondEnd, firstStart, firstEnd),
  );
}

function simplifySection(
  points: readonly InkPoint[],
  start: number,
  end: number,
  tolerance: number,
  keep: Set<number>,
): void {
  let farthest = 0;
  let farthestIndex = -1;
  for (let index = start + 1; index < end; index += 1) {
    const distance = distanceToSegment(points[index], points[start], points[end]);
    if (distance > farthest) {
      farthest = distance;
      farthestIndex = index;
    }
  }
  if (farthestIndex < 0 || farthest <= tolerance) return;
  keep.add(farthestIndex);
  simplifySection(points, start, farthestIndex, tolerance, keep);
  simplifySection(points, farthestIndex, end, tolerance, keep);
}

export function simplifyInkPoints(
  points: readonly InkPoint[],
  tolerance = 0.7,
): InkPoint[] {
  if (points.length <= 2) return points.map(quantizeInkPoint);
  const keep = new Set([0, points.length - 1]);
  simplifySection(points, 0, points.length - 1, tolerance, keep);
  return [...keep]
    .sort((first, second) => first - second)
    .slice(0, MAX_STROKE_POINTS)
    .map((index) => quantizeInkPoint(points[index]));
}

export function quantizeInkPoint(point: InkPoint): InkPoint {
  return {
    x: Math.round(point.x * 10) / 10,
    y: Math.round(point.y * 10) / 10,
    ...(finite(point.pressure)
      ? { pressure: Math.round(clamp(point.pressure, 0, 1) * 100) / 100 }
      : {}),
  };
}

export function inkStrokePath(points: readonly InkPoint[]): string {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const midpoint = {
      x: (points[index].x + points[index + 1].x) / 2,
      y: (points[index].y + points[index + 1].y) / 2,
    };
    path += ` Q ${points[index].x} ${points[index].y} ${midpoint.x} ${midpoint.y}`;
  }
  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
}

export function getInkStrokeBounds(stroke: InkStroke): NodeBounds {
  const xs = stroke.points.map((point) => point.x);
  const ys = stroke.points.map((point) => point.y);
  const padding = stroke.width / 2;
  const left = Math.min(...xs) - padding;
  const top = Math.min(...ys) - padding;
  return {
    id: stroke.id,
    x: left,
    y: top,
    width: Math.max(stroke.width, Math.max(...xs) - Math.min(...xs) + stroke.width),
    height: Math.max(stroke.width, Math.max(...ys) - Math.min(...ys) + stroke.width),
  };
}

export function strokeIntersectsRectangle(
  stroke: InkStroke,
  rectangle: AxisAlignedRectangle,
): boolean {
  const left = Math.min(rectangle.x, rectangle.x + rectangle.width);
  const right = Math.max(rectangle.x, rectangle.x + rectangle.width);
  const top = Math.min(rectangle.y, rectangle.y + rectangle.height);
  const bottom = Math.max(rectangle.y, rectangle.y + rectangle.height);
  const corners: InkPoint[] = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
  const radius = stroke.width / 2;

  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = stroke.points[index - 1];
    const end = stroke.points[index];
    if (
      (start.x >= left && start.x <= right && start.y >= top && start.y <= bottom) ||
      (end.x >= left && end.x <= right && end.y >= top && end.y <= bottom)
    ) {
      return true;
    }

    for (let edge = 0; edge < corners.length; edge += 1) {
      if (
        distanceBetweenSegments(
          start,
          end,
          corners[edge],
          corners[(edge + 1) % corners.length],
        ) <= radius
      ) {
        return true;
      }
    }
  }

  return false;
}

export function translateInkStroke(stroke: InkStroke, delta: XYPosition): InkStroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({
      ...point,
      x: point.x + delta.x,
      y: point.y + delta.y,
    })),
  };
}

export function strokeIntersectsPoint(
  stroke: InkStroke,
  point: InkPoint,
  radius: number,
): boolean {
  const threshold = radius + stroke.width / 2;
  for (let index = 1; index < stroke.points.length; index += 1) {
    if (
      distanceToSegment(point, stroke.points[index - 1], stroke.points[index]) <=
      threshold
    ) {
      return true;
    }
  }
  return false;
}
