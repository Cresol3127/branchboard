import { describe, expect, it } from 'vitest';
import {
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  boundsEqual,
  canSnap,
  clampWindowBounds,
  defaultFloatingBounds,
  deskWindowRect,
  dockWindowRect,
  isLayoutMode,
  maximizedWindowBounds,
  moveWindowBounds,
  resizeWindowBounds,
  sheetWindowRect,
  snapTargetForPointer,
  snapWindowBounds,
  validateStoredBounds,
} from '../src/windowGeometry';

const desk = { width: 1200, height: 800 };

describe('window geometry', () => {
  it('clamps floating windows inside the desk and enforces minimums', () => {
    expect(clampWindowBounds({ x: -40, y: 900, width: 100, height: 100 }, desk)).toEqual({
      x: 0,
      y: desk.height - MIN_PANEL_HEIGHT,
      width: MIN_PANEL_WIDTH,
      height: MIN_PANEL_HEIGHT,
    });
    expect(clampWindowBounds({ x: 5000, y: 20, width: 2000, height: 2000 }, desk)).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
    });
  });

  it('cascades default floating windows and keeps them on screen', () => {
    const first = defaultFloatingBounds(desk, 0);
    const second = defaultFloatingBounds(desk, 2);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
    expect(first.x + first.width).toBeLessThanOrEqual(desk.width);
    expect(first.y + first.height).toBeLessThanOrEqual(desk.height);
  });

  it('computes the four half-workspace snap regions and rejects tiny desks', () => {
    expect(snapWindowBounds(desk, 'left')).toEqual({
      x: 0,
      y: 0,
      width: 600,
      height: 800,
    });
    expect(snapWindowBounds(desk, 'bottom')).toEqual({
      x: 0,
      y: 400,
      width: 1200,
      height: 400,
    });
    expect(canSnap(desk, 'left')).toBe(true);
    expect(canSnap(desk, 'top')).toBe(true);
    expect(canSnap({ width: 500, height: 800 }, 'left')).toBe(false);
    expect(canSnap({ width: 1200, height: 500 }, 'top')).toBe(false);
  });

  it('detects a snap edge under the pointer, preferring sides at corners', () => {
    const rect = { x: 100, y: 100, width: 1000, height: 700 };
    expect(snapTargetForPointer(rect, 102, 400)).toBe('left');
    expect(snapTargetForPointer(rect, 1098, 400)).toBe('right');
    expect(snapTargetForPointer(rect, 600, 102)).toBe('top');
    expect(snapTargetForPointer(rect, 600, 798)).toBe('bottom');
    expect(snapTargetForPointer(rect, 600, 400)).toBeNull();
    expect(snapTargetForPointer(rect, 102, 102)).toBe('left');
  });

  it('moves and resizes from every edge without crossing the desk or minimum size', () => {
    const start = { x: 200, y: 100, width: 500, height: 400 };
    expect(moveWindowBounds(start, -9999, -9999, desk)).toMatchObject({ x: 0, y: 0 });
    expect(moveWindowBounds(start, 9999, 9999, desk)).toMatchObject({
      x: 700,
      y: 400,
    });
    expect(resizeWindowBounds(start, 'w', 400, 0, desk)).toMatchObject({
      x: 380,
      width: 320,
    });
    expect(resizeWindowBounds(start, 'w', -300, 0, desk)).toMatchObject({
      x: 0,
      width: 700,
    });
    const shrunk = resizeWindowBounds(start, 'se', -9999, -9999, desk);
    expect(shrunk.width).toBe(MIN_PANEL_WIDTH);
    expect(shrunk.height).toBe(MIN_PANEL_HEIGHT);
    const grown = resizeWindowBounds(start, 'se', 9999, 9999, desk);
    expect(grown.width).toBe(1000);
    expect(grown.height).toBe(700);
  });

  it('derives dock, sheet, desk and maximized rectangles from the workspace', () => {
    const workspace = { x: 8, y: 8, width: 1424, height: 900 };
    expect(dockWindowRect(workspace, 240)).toEqual({
      x: 248,
      y: 8,
      width: 360,
      height: 900,
    });
    expect(sheetWindowRect(workspace, 64)).toEqual({
      x: 72,
      y: 8,
      width: 1360,
      height: 900,
    });
    expect(deskWindowRect(workspace, 240, 64, 360)).toEqual({
      x: 608,
      y: 72,
      width: 824,
      height: 836,
    });
    expect(maximizedWindowBounds({ width: 824, height: 836 })).toEqual({
      x: 0,
      y: 0,
      width: 824,
      height: 836,
    });
  });

  it('validates persisted layout modes and bounds', () => {
    expect(isLayoutMode('snap-left')).toBe(true);
    expect(isLayoutMode('maximized')).toBe(false);
    expect(validateStoredBounds({ x: 1, y: 2, width: 400, height: 500 })).toEqual({
      x: 1,
      y: 2,
      width: 400,
      height: 500,
    });
    expect(validateStoredBounds({ x: 1, y: 2, width: 10, height: 500 })).toBeNull();
    expect(validateStoredBounds({ x: NaN, y: 2, width: 400, height: 500 })).toBeNull();
    expect(
      boundsEqual({ x: 1, y: 2, width: 3, height: 4 }, { x: 1, y: 2, width: 3, height: 4 }),
    ).toBe(true);
  });
});
