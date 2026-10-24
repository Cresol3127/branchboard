import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  buildMetrics,
  snappedInset,
  snapPreviewBounds,
  useWorkspacePanels,
} from '../workspacePanels';
import { motion } from '../motion';
import { useMotionPresence } from './Motion';

export function WorkspacePanelHost() {
  const entries = useWorkspacePanels((s) => s.entries);
  const dockedId = useWorkspacePanels((s) => s.dockedId);
  const activeId = useWorkspacePanels((s) => s.activeId);
  const preview = useWorkspacePanels((s) => s.preview);
  const metrics = useWorkspacePanels((s) => s.metrics);
  const ref = useRef<HTMLElement>(null);
  const measureRef = useRef<() => void>(() => {});
  const openEntries = Object.values(entries).filter((entry) => !entry.closing);
  const hasOpen = openEntries.length > 0;
  const rendered = useMotionPresence(hasOpen, motion.spatial.fast.duration);
  const docked = Boolean(dockedId && entries[dockedId] && !entries[dockedId].closing);

  useLayoutEffect(() => {
    const host = ref.current;
    const root = host?.closest<HTMLElement>('.workspace');
    const sidebar = root?.querySelector<HTMLElement>('.sidebar-shell');
    const main = root?.querySelector<HTMLElement>('.workspace-main');
    const header = root?.querySelector<HTMLElement>('.workspace-header');
    if (!host || !root || !sidebar || !main) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const workspace = root.getBoundingClientRect();
      const sidebarWidth = sidebar.getBoundingClientRect().width;
      const headerHeight = header?.getBoundingClientRect().height || 64;
      const narrow = workspace.width - sidebarWidth < 820;
      const state = useWorkspacePanels.getState();
      const dockedNow = Boolean(
        state.dockedId && state.entries[state.dockedId] && !state.entries[state.dockedId].closing,
      );
      const next = buildMetrics(workspace, sidebarWidth, headerHeight, dockedNow, narrow);
      root.style.setProperty('--panel-sidebar-width', `${sidebarWidth}px`);
      root.style.setProperty('--panel-dock-width', `${next.dockWidth}px`);
      state.setMetrics(next);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };
    measureRef.current = measure;
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    observer.observe(sidebar);
    if (header) observer.observe(header);
    measure();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    measureRef.current();
  }, [docked, openEntries.length]);

  useEffect(() => {
    const root = ref.current?.closest<HTMLElement>('.workspace');
    const main = root?.querySelector<HTMLElement>('.workspace-main');
    if (!root || !main) return;
    const full = metrics.narrow && hasOpen;
    root.dataset.panelFullView = String(full);
    root.dataset.panelOverlay = String(metrics.narrow);
    main.inert = full;
    if (!full) main.removeAttribute('inert');
  }, [hasOpen, metrics.narrow]);

  useEffect(() => {
    const root = ref.current?.closest<HTMLElement>('.workspace');
    if (!root || !metrics.ready) return;
    const inset = snappedInset(entries, metrics);
    root.style.setProperty('--canvas-inset-left', `${inset.left}px`);
    root.style.setProperty('--canvas-inset-right', `${inset.right}px`);
    root.style.setProperty('--canvas-inset-top', `${inset.top}px`);
    root.style.setProperty('--canvas-inset-bottom', `${inset.bottom}px`);
    root.dataset.canvasSplit = String(inset.left + inset.right + inset.top + inset.bottom > 0);
  }, [entries, metrics]);

  const previewBounds = preview ? snapPreviewBounds(preview, metrics) : null;

  return (
    <aside
      ref={ref}
      id="workspace-panel-host"
      className="workspace-panel-host"
      data-open={hasOpen}
      data-present={rendered}
      data-docked={docked && !metrics.narrow}
      data-active={activeId || undefined}
    >
      {previewBounds && (
        <div
          className="window-snap-preview"
          aria-hidden
          style={{
            left: previewBounds.x,
            top: previewBounds.y,
            width: previewBounds.width,
            height: previewBounds.height,
          }}
        />
      )}
    </aside>
  );
}
