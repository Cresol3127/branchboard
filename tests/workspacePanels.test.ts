import { beforeEach, describe, expect, it } from 'vitest';
import { closeWorkspacePanel, useWorkspacePanels } from '../src/workspacePanels';
describe('docked panel transitions', () => {
  beforeEach(() =>
    useWorkspacePanels.setState({
      active: null,
      navigation: null,
      messageEditor: null,
      confirmation: null,
    }),
  );
  it('guards unsaved fields, lets the user keep editing, and never closes the old panel on cancellation', () => {
    let oldClosed = 0,
      newClosed = 0;
    const state = () => useWorkspacePanels.getState();
    state().activate({
      id: 'old',
      kind: 'models',
      title: 'Models',
      close: () => oldClosed++,
      dirty: () => true,
    });
    state().activate({
      id: 'new',
      kind: 'help',
      title: 'Help',
      close: () => newClosed++,
      dirty: () => false,
    });
    expect(state().active?.id).toBe('old');
    state().resolve(false);
    expect(oldClosed).toBe(0);
    expect(newClosed).toBe(1);
    expect(state().active?.id).toBe('old');
    closeWorkspacePanel();
    expect(state().navigation).not.toBeNull();
    state().resolve(true);
    expect(oldClosed).toBe(1);
  });
  it('replaces only after confirmation and ignores release from an inactive component', () => {
    const state = () => useWorkspacePanels.getState();
    state().activate({
      id: 'old',
      kind: 'models',
      title: 'Models',
      close: () => {},
      dirty: () => true,
    });
    state().activate({
      id: 'new',
      kind: 'help',
      title: 'Help',
      close: () => {},
      dirty: () => false,
    });
    state().resolve(true);
    state().release('old');
    expect(state().active?.id).toBe('new');
    state().release('new');
    expect(state().active).toBeNull();
  });
});
