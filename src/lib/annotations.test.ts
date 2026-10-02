import { describe, expect, it } from "vitest";
import type { InkStroke, StickyNote } from "../types";
import {
  findPositionForStickyNote,
  getInkStrokeBounds,
  inkStrokePath,
  normalizeInkStroke,
  normalizeStickyNote,
  simplifyInkPoints,
  strokeIntersectsPoint,
  strokeIntersectsRectangle,
  translateInkStroke,
} from "./annotations";

function note(overrides: Partial<StickyNote> = {}): StickyNote {
  return {
    id: "note-1",
    text: "Note",
    position: { x: 0, y: 0 },
    size: { width: 240, height: 190 },
    color: "yellow",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function stroke(overrides: Partial<InkStroke> = {}): InkStroke {
  return {
    id: "stroke-1",
    points: [{ x: 10, y: 10 }, { x: 30, y: 30 }],
    color: "ink",
    width: 4,
    createdAt: 1,
    ...overrides,
  };
}

describe("annotation normalization", () => {
  it("clamps sticky dimensions and rejects malformed notes", () => {
    expect(
      normalizeStickyNote(note({ size: { width: 40, height: 1000 } }))?.size,
    ).toEqual({ width: 180, height: 600 });
    expect(normalizeStickyNote({ id: "bad" })).toBeNull();
  });

  it("clamps stroke width and rejects strokes without two valid points", () => {
    expect(normalizeInkStroke(stroke({ width: 80 }))?.width).toBe(24);
    expect(normalizeInkStroke(stroke({ points: [{ x: 1, y: 2 }] }))).toBeNull();
  });
});

describe("sticky placement", () => {
  it("moves a new sticky outside existing sticky notes", () => {
    expect(
      findPositionForStickyNote(
        { x: 0, y: 0 },
        { width: 240, height: 190 },
        [note()],
      ),
    ).toEqual({ x: 272, y: 0 });
  });
});

describe("ink geometry", () => {
  it("simplifies and quantizes a nearly straight stroke", () => {
    expect(
      simplifyInkPoints([
        { x: 0.04, y: 0.04 },
        { x: 5, y: 0.1 },
        { x: 10.06, y: 0.06 },
      ]),
    ).toEqual([{ x: 0, y: 0 }, { x: 10.1, y: 0.1 }]);
  });

  it("builds a smooth path and bounded geometry", () => {
    const value = stroke({
      points: [{ x: 10, y: 10 }, { x: 20, y: 30 }, { x: 40, y: 20 }],
    });
    expect(inkStrokePath(value.points)).toBe("M 10 10 Q 20 30 30 25 L 40 20");
    expect(getInkStrokeBounds(value)).toEqual({
      id: "stroke-1",
      x: 8,
      y: 8,
      width: 34,
      height: 24,
    });
  });

  it("hit-tests the full stroke rather than only sampled points", () => {
    const value = stroke({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
    expect(strokeIntersectsPoint(value, { x: 50, y: 5 }, 4)).toBe(true);
    expect(strokeIntersectsPoint(value, { x: 50, y: 20 }, 4)).toBe(false);
  });

  it("finds a stroke endpoint inside a rectangle", () => {
    const value = stroke({ points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] });
    expect(
      strokeIntersectsRectangle(value, { x: 9, y: 9, width: 4, height: 4 }),
    ).toBe(true);
  });

  it("finds a segment crossing a rectangle with both endpoints outside", () => {
    const value = stroke({ points: [{ x: 0, y: 10 }, { x: 100, y: 10 }] });
    expect(
      strokeIntersectsRectangle(value, { x: 45, y: 5, width: 10, height: 10 }),
    ).toBe(true);
  });

  it("rejects a near miss even when the rectangle overlaps the stroke bounds", () => {
    const value = stroke({ points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] });
    expect(
      strokeIntersectsRectangle(value, { x: 40, y: 54, width: 10, height: 2 }),
    ).toBe(false);
  });

  it("includes contact exactly at the stroke-width edge", () => {
    const value = stroke({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
    expect(
      strokeIntersectsRectangle(value, { x: 40, y: 2, width: 10, height: 5 }),
    ).toBe(true);
  });

  it("translates a stroke without mutation and preserves its metadata", () => {
    const value = stroke({
      points: [{ x: 1, y: 2, pressure: 0.25 }, { x: 4, y: 8, pressure: 0.75 }],
      color: "violet",
      width: 9,
      createdAt: 123,
    });
    const original = structuredClone(value);

    const translated = translateInkStroke(value, { x: 5, y: -3 });

    expect(translated).toEqual({
      id: "stroke-1",
      points: [{ x: 6, y: -1, pressure: 0.25 }, { x: 9, y: 5, pressure: 0.75 }],
      color: "violet",
      width: 9,
      createdAt: 123,
    });
    expect(value).toEqual(original);
    expect(translated).not.toBe(value);
    expect(translated.points[0]).not.toBe(value.points[0]);
  });
});
