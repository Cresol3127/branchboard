/** Pure geometry for docked, floating, snapped and maximized workspace windows. */

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type SnapTarget = 'left' | 'right' | 'top' | 'bottom';
export type PanelLayoutMode =
  'docked' | 'floating' | 'snap-left' | 'snap-right' | 'snap-top' | 'snap-bottom';
export type PanelDisplayMode = PanelLayoutMode | 'maximized';
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const PANEL_DOCK_WIDTH = 360;
export const MIN_PANEL_WIDTH = 320;
export const MIN_PANEL_HEIGHT = 280;
export const MIN_CANVAS_WIDTH = 320;
export const MIN_CANVAS_HEIGHT = 280;

/** Keep the dock usable while reserving enough room for the canvas. */
export function maxDockWidth(availableWidth: number) {
  return Math.max(MIN_PANEL_WIDTH, availableWidth - MIN_CANVAS_WIDTH);
}

export function clampDockWidth(width: number, availableWidth: number) {
  return Math.min(Math.max(width, MIN_PANEL_WIDTH), maxDockWidth(availableWidth));
}
export const SNAP_EDGE = 28;
export const WINDOW_MARGIN = 24;
export const WINDOW_STEP = 24;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function boundsEqual(a: Rect | null | undefined, b: Rect | null | undefined) {
  return (
    a === b ||
    (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)
  );
}

/** Keep a desk-relative window fully inside the usable desk. */
export function clampWindowBounds(bounds: Rect, desk: Size): Rect {
  const width = Math.min(
    Math.max(bounds.width, MIN_PANEL_WIDTH),
    Math.max(MIN_PANEL_WIDTH, desk.width),
  );
  const height = Math.min(
    Math.max(bounds.height, MIN_PANEL_HEIGHT),
    Math.max(MIN_PANEL_HEIGHT, desk.height),
  );
  return {
    x: Math.min(Math.max(bounds.x, 0), Math.max(0, desk.width - width)),
    y: Math.min(Math.max(bounds.y, 0), Math.max(0, desk.height - height)),
    width,
    height,
  };
}

/** A comfortable floating size, cascaded so several windows remain readable. */
export function defaultFloatingBounds(desk: Size, index = 0): Rect {
  const width = Math.min(560, Math.max(MIN_PANEL_WIDTH, desk.width - WINDOW_MARGIN * 2));
  const height = Math.min(720, Math.max(MIN_PANEL_HEIGHT, desk.height - WINDOW_MARGIN * 2));
  const step = Math.max(0, index) * WINDOW_STEP;
  return clampWindowBounds(
    {
      x: WINDOW_MARGIN + step,
      y: WINDOW_MARGIN + step,
      width,
      height,
    },
    desk,
  );
}

/** Snapped bounds are expressed relative to the desk origin. */
export function snapWindowBounds(desk: Size, target: SnapTarget): Rect {
  const halfWidth = desk.width / 2;
  const halfHeight = desk.height / 2;
  switch (target) {
    case 'left':
      return { x: 0, y: 0, width: halfWidth, height: desk.height };
    case 'right':
      return { x: halfWidth, y: 0, width: halfWidth, height: desk.height };
    case 'top':
      return { x: 0, y: 0, width: desk.width, height: halfHeight };
    case 'bottom':
      return { x: 0, y: halfHeight, width: desk.width, height: halfHeight };
  }
}

export function canSnap(desk: Size, target: SnapTarget) {
  if (desk.width <= 0 || desk.height <= 0) return false;
  if (target === 'left' || target === 'right') {
    const half = desk.width / 2;
    return half >= MIN_PANEL_WIDTH && half >= MIN_CANVAS_WIDTH && desk.height >= MIN_PANEL_HEIGHT;
  }
  const half = desk.height / 2;
  return half >= MIN_PANEL_HEIGHT && half >= MIN_CANVAS_HEIGHT && desk.width >= MIN_PANEL_WIDTH;
}

/** Nearest edge under the pointer, before committing a drag. */
export function snapTargetForPointer(
  desk: Rect,
  pointerX: number,
  pointerY: number,
  threshold = SNAP_EDGE,
): SnapTarget | null {
  const left = Math.abs(pointerX - desk.x);
  const right = Math.abs(pointerX - (desk.x + desk.width));
  const top = Math.abs(pointerY - desk.y);
  const bottom = Math.abs(pointerY - (desk.y + desk.height));
  const nearest = Math.min(left, right, top, bottom);
  if (nearest > threshold) return null;
  // Side-by-side is the common case; choose it when two edges tie at a corner.
  if (nearest === left) return 'left';
  if (nearest === right) return 'right';
  if (nearest === top) return 'top';
  return 'bottom';
}

export function moveWindowBounds(start: Rect, dx: number, dy: number, desk: Size): Rect {
  return clampWindowBounds({ ...start, x: start.x + dx, y: start.y + dy }, desk);
}

export function resizeWindowBounds(
  start: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  desk: Size,
): Rect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes('w')) left = Math.min(Math.max(0, start.x + dx), right - MIN_PANEL_WIDTH);
  if (handle.includes('e'))
    right = Math.max(Math.min(desk.width, start.x + start.width + dx), left + MIN_PANEL_WIDTH);
  if (handle.includes('n')) top = Math.min(Math.max(0, start.y + dy), bottom - MIN_PANEL_HEIGHT);
  if (handle.includes('s'))
    bottom = Math.max(Math.min(desk.height, start.y + start.height + dy), top + MIN_PANEL_HEIGHT);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Restore a snapped/maximized window under the pointer, ready to drag. */
export function restoreUnderPointer(bounds: Rect, desk: Rect, pointer: { x: number; y: number }) {
  const x = pointer.x - desk.x - bounds.width / 2;
  const y = pointer.y - desk.y - 20;
  return clampWindowBounds({ ...bounds, x, y }, desk);
}

export function dockWindowRect(
  workspace: Rect,
  sidebarWidth: number,
  width = PANEL_DOCK_WIDTH,
): Rect {
  return {
    x: workspace.x + sidebarWidth,
    y: workspace.y,
    width: Math.min(Math.max(0, width), Math.max(0, workspace.width - sidebarWidth)),
    height: workspace.height,
  };
}

/** The full-stage sheet used below the desktop breakpoint. */
export function sheetWindowRect(workspace: Rect, sidebarWidth: number): Rect {
  return {
    x: workspace.x + sidebarWidth,
    y: workspace.y,
    width: Math.max(0, workspace.width - sidebarWidth),
    height: workspace.height,
  };
}

export function deskWindowRect(
  workspace: Rect,
  sidebarWidth: number,
  headerHeight: number,
  dockWidth: number,
): Rect {
  const x = workspace.x + sidebarWidth + dockWidth;
  return {
    x,
    y: workspace.y + headerHeight,
    width: Math.max(0, workspace.x + workspace.width - x),
    height: Math.max(0, workspace.height - headerHeight),
  };
}

export function maximizedWindowBounds(desk: Size): Rect {
  return { x: 0, y: 0, width: Math.max(0, desk.width), height: Math.max(0, desk.height) };
}

export function isSnapMode(
  mode: PanelDisplayMode | null | undefined,
): mode is 'snap-left' | 'snap-right' | 'snap-top' | 'snap-bottom' {
  return (
    mode === 'snap-left' || mode === 'snap-right' || mode === 'snap-top' || mode === 'snap-bottom'
  );
}

export function snapTargetFromMode(mode: PanelDisplayMode | null | undefined): SnapTarget | null {
  if (mode === 'snap-left') return 'left';
  if (mode === 'snap-right') return 'right';
  if (mode === 'snap-top') return 'top';
  if (mode === 'snap-bottom') return 'bottom';
  return null;
}

export function modeFromSnapTarget(target: SnapTarget): PanelLayoutMode {
  return `snap-${target}`;
}

export function isLayoutMode(value: unknown): value is PanelLayoutMode {
  return (
    value === 'docked' ||
    value === 'floating' ||
    value === 'snap-left' ||
    value === 'snap-right' ||
    value === 'snap-top' ||
    value === 'snap-bottom'
  );
}

export function validateStoredBounds(value: unknown): Rect | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Rect>;
  if (
    !finite(candidate.x) ||
    !finite(candidate.y) ||
    !finite(candidate.width) ||
    !finite(candidate.height) ||
    candidate.width < MIN_PANEL_WIDTH ||
    candidate.height < MIN_PANEL_HEIGHT
  )
    return null;
  return {
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
  };
}
