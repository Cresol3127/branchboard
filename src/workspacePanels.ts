import { create } from 'zustand';

export type PanelKind =
  | 'models'
  | 'settings'
  | 'help'
  | 'search'
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
};
type Navigation = { proceed: () => void; cancel: () => void };

export const useWorkspacePanels = create<{
  messageEditor: {
    boardId: string;
    nodeId: string;
    messageId: string;
    mode: 'edit' | 'delete';
  } | null;
  confirmation: { title: string; description: string; run: () => void } | null;
  active: PanelEntry | null;
  navigation: Navigation | null;
  activate: (entry: PanelEntry) => void;
  release: (id: string) => void;
  navigate: (proceed: () => void, cancel?: () => void) => void;
  resolve: (discard: boolean) => void;
}>((set, get) => ({
  messageEditor: null,
  confirmation: null,
  active: null,
  navigation: null,
  activate(entry) {
    const old = get().active;
    if (old?.id === entry.id) return;
    get().navigate(() => {
      old?.close();
      set({ active: entry });
    }, entry.close);
  },
  release(id) {
    if (get().active?.id === id) set({ active: null });
  },
  navigate(proceed, cancel = () => {}) {
    if (get().active?.dirty()) set({ navigation: { proceed, cancel } });
    else proceed();
  },
  resolve(discard) {
    const action = get().navigation;
    set({ navigation: null });
    if (discard) action?.proceed();
    else action?.cancel();
  },
}));

export function closeWorkspacePanel() {
  const state = useWorkspacePanels.getState();
  state.navigate(() => state.active?.close());
}
