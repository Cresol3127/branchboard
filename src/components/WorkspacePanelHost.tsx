import { useLayoutEffect, useRef } from 'react';
import { useWorkspacePanels } from '../workspacePanels';
import { useMotionPresence } from './Motion';
import { motion } from '../motion';

export function WorkspacePanelHost() {
  const active = useWorkspacePanels((s) => s.active);
  const rendered = useMotionPresence(Boolean(active), motion.duration.panel);
  const navigation = useWorkspacePanels((s) => s.navigation);
  const ref = useRef<HTMLElement>(null);
  const lastControl = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('.workspace-panel-content').forEach((content) => {
      content.inert = Boolean(navigation) || content.dataset.motionState === 'closing';
    });
  }, [navigation, active]);
  useLayoutEffect(() => {
    const root = ref.current?.closest<HTMLElement>('.workspace');
    const sidebar = root?.querySelector<HTMLElement>('.sidebar-shell');
    const main = root?.querySelector<HTMLElement>('.workspace-main');
    if (!root || !sidebar || !main) return;
    const measure = () => {
      const sidebarWidth = sidebar.getBoundingClientRect().width;
      const narrow = root.clientWidth - sidebarWidth < 820;
      const full = Boolean(active) && narrow;
      root.dataset.panelFullView = String(full);
      root.dataset.panelOverlay = String(narrow);
      root.style.setProperty('--panel-sidebar-width', `${sidebarWidth}px`);
      main.inert = full;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(sidebar);
    measure();
    return () => {
      observer.disconnect();
      main.inert = false;
    };
  }, [active]);
  return (
    <aside
      ref={ref}
      id="workspace-panel-host"
      className="workspace-panel-host"
      data-open={Boolean(active)}
      data-present={rendered}
      aria-hidden={!active}
      aria-label="Workspace panel"
      onFocusCapture={(event) => {
        if ((event.target as HTMLElement).closest('.workspace-panel-content'))
          lastControl.current = event.target as HTMLElement;
      }}
    >
      {navigation && (
        <div className="panel-leave-confirmation" role="alert" aria-label="Unsaved changes">
          <h3>Keep your changes?</h3>
          <p>
            Save before leaving, or discard this form and its unsaved preview. API keys are never
            stored in the browser.
          </p>
          <button
            autoFocus
            onClick={() => {
              useWorkspacePanels.getState().resolve(false);
              requestAnimationFrame(
                () => lastControl.current?.isConnected && lastControl.current.focus(),
              );
            }}
          >
            Keep editing
          </button>
          <button className="danger" onClick={() => useWorkspacePanels.getState().resolve(true)}>
            Discard changes
          </button>
        </div>
      )}
    </aside>
  );
}
