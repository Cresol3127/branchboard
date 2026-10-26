import { create } from 'zustand';
import {
  boundsEqual,
  canSnap,
  clampDockWidth,
  clampWindowBounds,
  defaultFloatingBounds,
  deskWindowRect,
  dockWindowRect,
  isLayoutMode,
  isSnapMode,
  maximizedWindowBounds,
  modeFromSnapTarget,
  PANEL_DOCK_WIDTH,
  restoreUnderPointer,
  sheetWindowRect,
  snapTargetFromMode,
  snapWindowBounds,
  validateStoredBounds,
  type PanelDisplayMode,
  type PanelLayoutMode,
  type Rect,
  type SnapTarget,
} from './windowGeometry';

export type PanelKind =
  | 'models'
  | 'settings'
  | 'help'
  | 'search'
  | 'history'
  | 'library'
  | 'backups'
  | 'import'
  | 'export'
  | 'message'
  | 'layers'
  | 'confirmation';

export type PanelEntry = {
  id: string;
  kind: PanelKind;
  title: string;
  close: () => void;
  dirty: () => boolean;
  mode: PanelLayoutMode;
  /** Desk-relative floating bounds. Snap modes keep their last floating bounds. */
  bounds: Rect | null;
  restoreMode: PanelLayoutMode;
  maximized: boolean;
  z: number;
  closing: boolean;
};

export type WindowMetrics = {
  ready: boolean;
  narrow: boolean;
  workspace: Rect;
  sidebarWidth: number;
  headerHeight: number;
  dockWidth: number;
  dock: Rect;
  sheet: Rect;
  desk: Rect;
};

type Navigation = { id: string; proceed: () => void; cancel: () => void };
type StoredPanel = { mode: PanelLayoutMode; bounds?: Rect };
type StoredLayout = { panels: Record<string, StoredPanel>; dockWidth: number };
type RegisterEntry = {
  id: string;
  kind: PanelKind;
  title: string;
  close: () => void;
  dirty: () => boolean;
};

const LAYOUT_KEY = 'branchboard.windows.v1';
const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };
const INITIAL_METRICS: WindowMetrics = {
  ready: false,
  narrow: false,
  workspace: EMPTY_RECT,
  sidebarWidth: 0,
  headerHeight: 0,
  dockWidth: 0,
  dock: EMPTY_RECT,
  sheet: EMPTY_RECT,
  desk: EMPTY_RECT,
};

function readStoredLayout(): StoredLayout {
  const fallback: StoredLayout = { panels: {}, dockWidth: PANEL_DOCK_WIDTH };
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return fallback;
    const value = parsed as { version?: unknown; panels?: unknown; dockWidth?: unknown };
    if (value.version !== 1 || !value.panels || typeof value.panels !== 'object') return fallback;
    const panels: Record<string, StoredPanel> = {};
    for (const [kind, candidate] of Object.entries(value.panels)) {
      if (!candidate || typeof candidate !== 'object') continue;
      const panel = candidate as { mode?: unknown; bounds?: unknown };
      if (!isLayoutMode(panel.mode)) continue;
      const bounds = validateStoredBounds(panel.bounds);
      panels[kind] = bounds ? { mode: panel.mode, bounds } : { mode: panel.mode };
    }
    const dockWidth =
      typeof value.dockWidth === 'number' && Number.isFinite(value.dockWidth)
        ? value.dockWidth
        : PANEL_DOCK_WIDTH;
    return { panels, dockWidth };
  } catch {
    return fallback;
  }
}

function writeStoredLayout(panels: Record<string, StoredPanel>, dockWidth: number) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ version: 1, panels, dockWidth }));
  } catch {
    // Layout is presentation-only; workspace storage failures remain the visible error path.
  }
}

function persistEntry(entry: PanelEntry) {
  const stored = readStoredLayout();
  stored.panels[entry.kind] = {
    mode: entry.mode,
    ...(entry.bounds ? { bounds: entry.bounds } : {}),
  };
  writeStoredLayout(stored.panels, useWorkspacePanels.getState().dockWidth);
}

function persistDockWidth(dockWidth: number) {
  const stored = readStoredLayout();
  writeStoredLayout(stored.panels, dockWidth);
}

function topEntry(entries: Record<string, PanelEntry>, exclude?: string) {
  return Object.values(entries)
    .filter((entry) => !entry.closing && entry.id !== exclude)
    .sort((a, b) => b.z - a.z)[0];
}

function nextZ(entries: Record<string, PanelEntry>) {
  return Math.max(0, ...Object.values(entries).map((entry) => entry.z)) + 1;
}

export const useWorkspacePanels = create<{
  messageEditor: {
    boardId: string;
    nodeId: string;
    messageId: string;
    mode: 'edit' | 'delete';
  } | null;
  confirmation: { title: string; description: string; run: () => void } | null;
  entries: Record<string, PanelEntry>;
  activeId: string | null;
  dockedId: string | null;
  navigation: Navigation | null;
  preview: SnapTarget | null;
  metrics: WindowMetrics;
  register: (entry: RegisterEntry) => void;
  updateEntry: (id: string, patch: Partial<Pick<PanelEntry, 'title' | 'close' | 'dirty'>>) => void;
  unregister: (id: string) => void;
  markClosing: (id: string) => void;
  raise: (id: string) => void;
  raiseKind: (kind: PanelKind) => boolean;
  navigate: (proceed: () => void, cancel?: () => void, id?: string | null) => void;
  resolve: (discard: boolean) => void;
  setPreview: (target: SnapTarget | null) => void;
  setMetrics: (metrics: WindowMetrics) => void;
  setBounds: (id: string, bounds: Rect) => void;
  popOut: (id: string) => void;
  dock: (id: string) => void;
  snap: (id: string, target: SnapTarget) => boolean;
  maximize: (id: string) => void;
  restore: (id: string) => void;
  resetLayout: () => void;
}>((set, get) => ({
  messageEditor: null,
  confirmation: null,
  entries: {},
  activeId: null,
  dockedId: null,
  navigation: null,
  preview: null,
  metrics: INITIAL_METRICS,

  register(entry) {
    const state = get();
    const existing = state.entries[entry.id];
    if (existing) {
      get().updateEntry(entry.id, entry);
      get().raise(entry.id);
      return;
    }
    const metrics = state.metrics;
    const stored = readStoredLayout()[entry.kind];
    const openEntries = Object.values(state.entries).filter((item) => !item.closing);
    const dockOccupied = Boolean(
      state.dockedId && state.entries[state.dockedId] && !state.entries[state.dockedId].closing,
    );
    const snappedOccupied = openEntries.some((item) => isSnapMode(item.mode));
    let mode: PanelLayoutMode = stored?.mode ?? (dockOccupied ? 'floating' : 'docked');
    let bounds = stored?.bounds ? { ...stored.bounds } : null;

    if (mode === 'docked' && dockOccupied) mode = 'floating';
    if (mode === 'floating' && !bounds)
      bounds = defaultFloatingBounds(metrics.desk, openEntries.length);
    if (isSnapMode(mode)) {
      const target = snapTargetFromMode(mode);
      if (!metrics.ready || !target || !canSnap(metrics.desk, target) || snappedOccupied)
        mode = 'floating';
    }
    if (mode === 'floating') {
      bounds = clampWindowBounds(
        bounds ?? defaultFloatingBounds(metrics.desk, openEntries.length),
        metrics.desk,
      );
    }

    const z = nextZ(state.entries);
    const created: PanelEntry = {
      ...entry,
      mode,
      bounds,
      restoreMode: mode,
      maximized: false,
      z,
      closing: false,
    };
    set((current) => ({
      entries: { ...current.entries, [entry.id]: created },
      activeId: entry.id,
      dockedId: mode === 'docked' ? entry.id : current.dockedId,
    }));
    persistEntry(created);
  },

  updateEntry(id, patch) {
    set((state) => {
      const entry = state.entries[id];
      if (!entry) return state;
      if (
        (patch.title === undefined || patch.title === entry.title) &&
        (patch.close === undefined || patch.close === entry.close) &&
        (patch.dirty === undefined || patch.dirty === entry.dirty)
      )
        return state;
      return { entries: { ...state.entries, [id]: { ...entry, ...patch } } };
    });
  },

  unregister(id) {
    set((state) => {
      if (!state.entries[id]) return state;
      const entries = { ...state.entries };
      delete entries[id];
      const next = topEntry(entries);
      return {
        entries,
        activeId: state.activeId === id ? (next?.id ?? null) : state.activeId,
        dockedId: state.dockedId === id ? null : state.dockedId,
        navigation: state.navigation?.id === id ? null : state.navigation,
        preview: null,
      };
    });
  },

  markClosing(id) {
    const state = get();
    const entry = state.entries[id];
    if (!entry || entry.closing) return;
    persistEntry(entry);
    const entries = { ...state.entries, [id]: { ...entry, closing: true } };
    const next = topEntry(entries);
    set({
      entries,
      activeId: state.activeId === id ? (next?.id ?? null) : state.activeId,
      dockedId: state.dockedId === id ? null : state.dockedId,
      navigation: state.navigation?.id === id ? null : state.navigation,
      preview: null,
    });
  },

  raise(id) {
    set((state) => {
      const entry = state.entries[id];
      if (!entry || entry.closing || state.activeId === id) return state;
      return {
        entries: { ...state.entries, [id]: { ...entry, z: nextZ(state.entries) } },
        activeId: id,
      };
    });
  },

  raiseKind(kind) {
    const entry = Object.values(get().entries)
      .filter((item) => !item.closing && item.kind === kind)
      .sort((a, b) => b.z - a.z)[0];
    if (!entry) return false;
    get().raise(entry.id);
    return true;
  },

  navigate(proceed, cancel = () => {}, id = get().activeId) {
    const entry = id ? get().entries[id] : null;
    if (entry && !entry.closing && entry.dirty())
      set({ navigation: { id: entry.id, proceed, cancel } });
    else proceed();
  },

  resolve(discard) {
    const action = get().navigation;
    set({ navigation: null });
    if (discard) action?.proceed();
    else action?.cancel();
  },

  setPreview(target) {
    if (get().preview !== target) set({ preview: target });
  },

  setMetrics(metrics) {
    set((state) => {
      const current = state.metrics;
      if (
        current.ready === metrics.ready &&
        current.narrow === metrics.narrow &&
        current.sidebarWidth === metrics.sidebarWidth &&
        current.headerHeight === metrics.headerHeight &&
        current.dockWidth === metrics.dockWidth &&
        boundsEqual(current.workspace, metrics.workspace) &&
        boundsEqual(current.desk, metrics.desk) &&
        boundsEqual(current.dock, metrics.dock) &&
        boundsEqual(current.sheet, metrics.sheet)
      )
        return state;
      let changed = false;
      const entries = { ...state.entries };
      for (const [id, entry] of Object.entries(entries)) {
        if (entry.closing) continue;
        if (entry.mode === 'floating' && entry.bounds) {
          const bounds = clampWindowBounds(entry.bounds, metrics.desk);
          if (!boundsEqual(bounds, entry.bounds)) {
            entries[id] = { ...entry, bounds };
            changed = true;
          }
        } else if (isSnapMode(entry.mode)) {
          const target = snapTargetFromMode(entry.mode);
          if (target && (!metrics.ready || !canSnap(metrics.desk, target))) {
            const fallback =
              entry.bounds ?? defaultFloatingBounds(metrics.desk, Object.keys(entries).length);
            entries[id] = {
              ...entry,
              mode: 'floating',
              bounds: clampWindowBounds(fallback, metrics.desk),
              restoreMode: 'floating',
            };
            changed = true;
          }
        }
      }
      return { metrics, ...(changed ? { entries } : {}) };
    });
  },

  setBounds(id, bounds) {
    const state = get();
    const entry = state.entries[id];
    if (!entry || entry.closing || entry.mode !== 'floating' || entry.maximized) return;
    const next = clampWindowBounds(bounds, state.metrics.desk);
    if (boundsEqual(entry.bounds, next)) return;
    const updated = { ...entry, bounds: next };
    set({ entries: { ...state.entries, [id]: updated } });
    persistEntry(updated);
  },

  popOut(id) {
    const state = get();
    const entry = state.entries[id];
    if (!entry || entry.closing) return;
    if (entry.mode === 'floating' && !entry.maximized) return;
    const bounds = clampWindowBounds(
      entry.bounds ??
        defaultFloatingBounds(
          state.metrics.desk,
          Object.values(state.entries).filter((item) => !item.closing).length,
        ),
      state.metrics.desk,
    );
    const updated: PanelEntry = {
      ...entry,
      mode: 'floating',
      bounds,
      restoreMode: 'floating',
      maximized: false,
      z: nextZ(state.entries),
    };
    set({
      entries: { ...state.entries, [id]: updated },
      activeId: id,
      dockedId: state.dockedId === id ? null : state.dockedId,
    });
    persistEntry(updated);
  },

  dock(id) {
    const state = get();
    const entry = state.entries[id];
    if (!entry || entry.closing || (entry.mode === 'docked' && !entry.maximized)) return;
    const entries = { ...state.entries };
    const previous = state.dockedId ? state.entries[state.dockedId] : null;
    if (previous && previous.id !== id && !previous.closing) {
      const previousBounds = clampWindowBounds(
        previous.bounds ??
          defaultFloatingBounds(
            state.metrics.desk,
            Object.values(state.entries).filter((item) => !item.closing).length,
          ),
        state.metrics.desk,
      );
      const floatingPrevious: PanelEntry = {
        ...previous,
        mode: 'floating',
        bounds: previousBounds,
        restoreMode: 'floating',
        maximized: false,
      };
      entries[previous.id] = floatingPrevious;
      persistEntry(floatingPrevious);
    }
    const docked: PanelEntry = {
      ...entry,
      mode: 'docked',
      restoreMode: entry.mode,
      maximized: false,
      z: nextZ(state.entries),
    };
    entries[id] = docked;
    set({ entries, activeId: id, dockedId: id, preview: null });
    persistEntry(docked);
  },

  snap(id, target) {
    const state = get();
    const entry = state.entries[id];
    if (!entry || entry.closing || state.metrics.narrow) return false;
    // A docked window must be judged against the wider desk it will occupy once
    // snapping releases its dock reservation.
    const desk =
      state.dockedId === id
        ? deskWindowRect(
            state.metrics.workspace,
            state.metrics.sidebarWidth,
            state.metrics.headerHeight,
            0,
          )
        : state.metrics.desk;
    if (!canSnap(desk, target)) return false;
    const entries = { ...state.entries };
    for (const [otherId, other] of Object.entries(entries)) {
      if (otherId === id || other.closing || !isSnapMode(other.mode)) continue;
      const fallback =
        other.bounds ?? defaultFloatingBounds(state.metrics.desk, Object.keys(entries).length);
      const floating: PanelEntry = {
        ...other,
        mode: 'floating',
        bounds: clampWindowBounds(fallback, state.metrics.desk),
        restoreMode: 'floating',
        maximized: false,
      };
      entries[otherId] = floating;
      persistEntry(floating);
    }
    const bounds = clampWindowBounds(
      entry.bounds ?? defaultFloatingBounds(desk, Object.keys(entries).length),
      desk,
    );
    const snapped: PanelEntry = {
      ...entry,
      mode: modeFromSnapTarget(target),
      bounds,
      restoreMode: modeFromSnapTarget(target),
      maximized: false,
      z: nextZ(state.entries),
    };
    entries[id] = snapped;
    set({
      entries,
      activeId: id,
      preview: null,
      dockedId: state.dockedId === id ? null : state.dockedId,
    });
    persistEntry(snapped);
    return true;
  },

  maximize(id) {
    const state = get();
    const entry = state.entries[id];
    if (!entry || entry.closing) return;
    if (entry.maximized) {
      get().restore(id);
      return;
    }
    const updated: PanelEntry = {
      ...entry,
      maximized: true,
      restoreMode: entry.mode,
      bounds:
        entry.bounds ??
        clampWindowBounds(
          defaultFloatingBounds(state.metrics.desk, Object.keys(state.entries).length),
          state.metrics.desk,
        ),
      z: nextZ(state.entries),
    };
    set({
      entries: { ...state.entries, [id]: updated },
      activeId: id,
      dockedId: state.dockedId === id ? null : state.dockedId,
    });
  },

  restore(id) {
    const state = get();
    const entry = state.entries[id];
    if (!entry || entry.closing || !entry.maximized) return;
    let mode = entry.restoreMode;
    if (mode === 'docked' && state.dockedId && state.dockedId !== id) mode = 'floating';
    const bounds = clampWindowBounds(
      entry.bounds ?? defaultFloatingBounds(state.metrics.desk, Object.keys(state.entries).length),
      state.metrics.desk,
    );
    set({
      entries: {
        ...state.entries,
        [id]: { ...entry, mode, bounds, restoreMode: mode, maximized: false },
      },
      activeId: id,
      dockedId: mode === 'docked' ? id : state.dockedId,
    });
  },

  resetLayout() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(LAYOUT_KEY);
      } catch {
        // Presentation-only reset.
      }
    }
    set((state) => {
      const entries = { ...state.entries };
      const open = Object.values(entries)
        .filter((entry) => !entry.closing)
        .sort((a, b) => b.z - a.z);
      let index = 0;
      for (const entry of open) {
        if (index === 0) {
          entries[entry.id] = {
            ...entry,
            mode: 'docked',
            restoreMode: 'docked',
            maximized: false,
          };
        } else {
          entries[entry.id] = {
            ...entry,
            mode: 'floating',
            bounds: defaultFloatingBounds(state.metrics.desk, index),
            restoreMode: 'floating',
            maximized: false,
          };
        }
        index++;
      }
      return {
        entries,
        dockedId: open[0]?.id ?? null,
        preview: null,
        navigation: null,
      };
    });
  },
}));

export function closeWorkspacePanel(id = useWorkspacePanels.getState().activeId) {
  const state = useWorkspacePanels.getState();
  const entry = id ? state.entries[id] : null;
  if (!entry) return;
  state.navigate(
    () => entry.close(),
    () => {},
    entry.id,
  );
}

export function displayMode(entry: PanelEntry, metrics: WindowMetrics): PanelDisplayMode | 'sheet' {
  if (metrics.narrow) return 'sheet';
  if (entry.maximized) return 'maximized';
  return entry.mode;
}

/** Fixed viewport bounds for a panel frame. */
export function frameBounds(entry: PanelEntry, metrics: WindowMetrics): Rect {
  if (!metrics.ready) {
    return {
      x: metrics.workspace.x + metrics.sidebarWidth,
      y: metrics.workspace.y,
      width: Math.min(360, Math.max(320, metrics.workspace.width)),
      height: Math.max(280, metrics.workspace.height),
    };
  }
  if (metrics.narrow) return metrics.sheet;
  if (entry.maximized) return metrics.desk;
  if (entry.mode === 'docked') return metrics.dock;
  if (isSnapMode(entry.mode)) {
    const target = snapTargetFromMode(entry.mode)!;
    const bounds = snapWindowBounds(metrics.desk, target);
    return {
      x: metrics.desk.x + bounds.x,
      y: metrics.desk.y + bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
  }
  const bounds = entry.bounds
    ? clampWindowBounds(entry.bounds, metrics.desk)
    : defaultFloatingBounds(metrics.desk);
  return {
    x: metrics.desk.x + bounds.x,
    y: metrics.desk.y + bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

export function snappedInset(entries: Record<string, PanelEntry>, metrics: WindowMetrics) {
  if (metrics.narrow || !metrics.ready) return { left: 0, right: 0, top: 0, bottom: 0 };
  const snapped = Object.values(entries)
    .filter((entry) => !entry.closing && !entry.maximized && isSnapMode(entry.mode))
    .sort((a, b) => b.z - a.z)[0];
  if (!snapped) return { left: 0, right: 0, top: 0, bottom: 0 };
  const target = snapTargetFromMode(snapped.mode)!;
  const bounds = snapWindowBounds(metrics.desk, target);
  // The canvas moves to the opposite half of the snapped window, never under it.
  if (target === 'left')
    return { left: Math.max(0, metrics.desk.width - bounds.width), right: 0, top: 0, bottom: 0 };
  if (target === 'right')
    return { left: 0, right: Math.max(0, metrics.desk.width - bounds.width), top: 0, bottom: 0 };
  if (target === 'top')
    return { left: 0, right: 0, top: Math.max(0, metrics.desk.height - bounds.height), bottom: 0 };
  return { left: 0, right: 0, top: 0, bottom: Math.max(0, metrics.desk.height - bounds.height) };
}

export function buildMetrics(
  workspace: Rect,
  sidebarWidth: number,
  headerHeight: number,
  docked: boolean,
  narrow: boolean,
): WindowMetrics {
  const dockWidth =
    docked && !narrow ? Math.min(360, Math.max(0, workspace.width - sidebarWidth)) : 0;
  return {
    ready: workspace.width > 0 && workspace.height > 0,
    narrow,
    workspace,
    sidebarWidth,
    headerHeight,
    dockWidth,
    dock: dockWindowRect(workspace, sidebarWidth),
    sheet: sheetWindowRect(workspace, sidebarWidth),
    desk: deskWindowRect(workspace, sidebarWidth, headerHeight, dockWidth),
  };
}

export function snapPreviewBounds(target: SnapTarget, metrics: WindowMetrics): Rect | null {
  if (!metrics.ready || metrics.narrow || !canSnap(metrics.desk, target)) return null;
  const bounds = snapWindowBounds(metrics.desk, target);
  return {
    x: metrics.desk.x + bounds.x,
    y: metrics.desk.y + bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

export function restoreDragBounds(
  entry: PanelEntry,
  pointer: { x: number; y: number },
  metrics: WindowMetrics,
) {
  const bounds = entry.bounds ?? defaultFloatingBounds(metrics.desk);
  return restoreUnderPointer(bounds, metrics.desk, pointer);
}

export { maximizedWindowBounds };
