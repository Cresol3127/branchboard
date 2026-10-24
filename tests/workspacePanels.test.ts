import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMetrics,
  closeWorkspacePanel,
  displayMode,
  frameBounds,
  snappedInset,
  useWorkspacePanels,
  type PanelEntry,
} from '../src/workspacePanels';

const memory = new Map<string, string>();
const metrics = () => buildMetrics({ x: 8, y: 8, width: 1424, height: 900 }, 240, 64, false, false);

function reset() {
  memory.clear();
  useWorkspacePanels.setState({
    activeId: null,
    dockedId: null,
    navigation: null,
    preview: null,
    entries: {},
    messageEditor: null,
    confirmation: null,
    metrics: metrics(),
  });
}

function register(id: string, kind: PanelEntry['kind'], dirty = false) {
  useWorkspacePanels.getState().register({
    id,
    kind,
    title: kind,
    close: () => {},
    dirty: () => dirty,
  });
  return useWorkspacePanels.getState().entries[id];
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  });
  reset();
});

describe('window registry', () => {
  it('docks the first panel, floats the next, and raises an existing panel', () => {
    const models = register('models', 'models');
    expect(models.mode).toBe('docked');
    expect(useWorkspacePanels.getState().dockedId).toBe('models');
    const help = register('help', 'help');
    expect(help.mode).toBe('floating');
    expect(help.bounds).not.toBeNull();
    expect(useWorkspacePanels.getState().activeId).toBe('help');
    useWorkspacePanels.getState().raise('models');
    expect(useWorkspacePanels.getState().activeId).toBe('models');
  });

  it('guards dirty forms and resolves keep or discard without replacing another panel', () => {
    const models = register('models', 'models', true);
    const help = register('help', 'help');
    let proceeded = 0;
    useWorkspacePanels.getState().navigate(
      () => proceeded++,
      () => {},
      models.id,
    );
    expect(useWorkspacePanels.getState().navigation?.id).toBe('models');
    useWorkspacePanels.getState().resolve(false);
    expect(proceeded).toBe(0);
    expect(useWorkspacePanels.getState().entries[help.id]).toBeTruthy();
    useWorkspacePanels.getState().navigate(
      () => proceeded++,
      () => {},
      models.id,
    );
    useWorkspacePanels.getState().resolve(true);
    expect(proceeded).toBe(1);
  });

  it('closes through the dirty guard', () => {
    let closed = 0;
    useWorkspacePanels.setState({ metrics: metrics() });
    useWorkspacePanels.getState().register({
      id: 'models',
      kind: 'models',
      title: 'Models',
      close: () => closed++,
      dirty: () => true,
    });
    closeWorkspacePanel('models');
    expect(closed).toBe(0);
    expect(useWorkspacePanels.getState().navigation).not.toBeNull();
    useWorkspacePanels.getState().resolve(true);
    expect(closed).toBe(1);
  });

  it('swaps docked panels without unmounting the previous panel', () => {
    register('models', 'models');
    const help = register('help', 'help');
    useWorkspacePanels.getState().dock(help.id);
    expect(help.id).toBe(useWorkspacePanels.getState().dockedId);
    expect(useWorkspacePanels.getState().entries.models.mode).toBe('floating');
    expect(useWorkspacePanels.getState().entries[help.id].mode).toBe('docked');
  });

  it('snaps one half at a time and insets the canvas', () => {
    const models = register('models', 'models');
    const help = register('help', 'help');
    expect(useWorkspacePanels.getState().snap(help.id, 'left')).toBe(true);
    expect(useWorkspacePanels.getState().entries[help.id].mode).toBe('snap-left');
    const inset = snappedInset(useWorkspacePanels.getState().entries, metrics());
    expect(inset.left).toBeGreaterThan(0);
    expect(inset.right).toBe(0);
    expect(useWorkspacePanels.getState().snap(models.id, 'right')).toBe(true);
    expect(useWorkspacePanels.getState().entries[help.id].mode).toBe('floating');
    expect(useWorkspacePanels.getState().entries.models.mode).toBe('snap-right');
  });

  it('reopens stored snapped panels one at a time and persists the resolved mode', () => {
    const models = register('models', 'models');
    expect(useWorkspacePanels.getState().snap(models.id, 'left')).toBe(true);
    useWorkspacePanels.getState().markClosing(models.id);
    useWorkspacePanels.getState().unregister(models.id);

    const help = register('help', 'help');
    expect(useWorkspacePanels.getState().snap(help.id, 'left')).toBe(true);
    useWorkspacePanels.getState().markClosing(help.id);
    useWorkspacePanels.getState().unregister(help.id);

    const stored = JSON.parse(memory.get('branchboard.windows.v1')!) as {
      panels: Record<string, { mode: string }>;
    };
    expect(stored.panels.models.mode).toBe('snap-left');
    expect(stored.panels.help.mode).toBe('snap-left');

    expect(register('models', 'models').mode).toBe('snap-left');
    expect(register('help', 'help').mode).toBe('floating');
    expect(
      (
        JSON.parse(memory.get('branchboard.windows.v1')!) as {
          panels: Record<string, { mode: string }>;
        }
      ).panels.help.mode,
    ).toBe('floating');
  });

  it('snaps a docked window using the expanded desk after releasing its dock', () => {
    useWorkspacePanels.setState({
      metrics: buildMetrics({ x: 8, y: 8, width: 1024, height: 900 }, 240, 64, true, false),
    });
    const models = register('models', 'models');
    expect(models.mode).toBe('docked');
    expect(useWorkspacePanels.getState().snap(models.id, 'left')).toBe(true);
    expect(useWorkspacePanels.getState().dockedId).toBeNull();
    expect(useWorkspacePanels.getState().entries[models.id].mode).toBe('snap-left');
  });
  it('maximizes into the desk, releases the dock, and restores the prior mode', () => {
    const models = register('models', 'models');
    useWorkspacePanels.getState().maximize(models.id);
    const maximized = useWorkspacePanels.getState().entries[models.id];
    expect(maximized.maximized).toBe(true);
    expect(useWorkspacePanels.getState().dockedId).toBeNull();
    expect(displayMode(maximized, metrics())).toBe('maximized');
    const bounds = frameBounds(maximized, metrics());
    expect(bounds).toEqual(metrics().desk);
    useWorkspacePanels.getState().restore(models.id);
    expect(useWorkspacePanels.getState().entries[models.id].maximized).toBe(false);
    expect(useWorkspacePanels.getState().entries[models.id].mode).toBe('docked');
    expect(useWorkspacePanels.getState().dockedId).toBe(models.id);
  });

  it('uses a full-stage sheet below the desktop breakpoint', () => {
    const models = register('models', 'models');
    useWorkspacePanels
      .getState()
      .setMetrics(
        buildMetrics(
          { x: 8, y: 8, width: 390, height: 900 },
          64,
          64,
          models.mode === 'docked',
          true,
        ),
      );
    const entry = useWorkspacePanels.getState().entries[models.id];
    expect(displayMode(entry, useWorkspacePanels.getState().metrics)).toBe('sheet');
    expect(frameBounds(entry, useWorkspacePanels.getState().metrics)).toEqual(
      useWorkspacePanels.getState().metrics.sheet,
    );
    expect(useWorkspacePanels.getState().snap(models.id, 'left')).toBe(false);
  });
});
