import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutGrid,
  Maximize2,
  Minimize2,
  Move,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelRightOpen,
  PanelTop,
  PictureInPicture2,
  X,
} from 'lucide-react';
import {
  displayMode,
  frameBounds,
  restoreDragBounds,
  useWorkspacePanels,
  type PanelEntry,
  type PanelKind,
} from '../workspacePanels';
import {
  canSnap,
  isSnapMode,
  moveWindowBounds,
  resizeWindowBounds,
  snapTargetForPointer,
  type Rect,
  type ResizeHandle,
  type SnapTarget,
} from '../windowGeometry';
import { useIsPresent } from './Motion';

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className="icon-button nodrag nopan"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

const snapOptions: Array<{ target: SnapTarget; label: string; icon: ReactNode }> = [
  { target: 'left', label: 'Snap left half', icon: <PanelLeft size={17} /> },
  { target: 'right', label: 'Snap right half', icon: <PanelRight size={17} /> },
  { target: 'top', label: 'Snap top half', icon: <PanelTop size={17} /> },
  { target: 'bottom', label: 'Snap bottom half', icon: <PanelBottom size={17} /> },
];

function LeaveConfirmation({
  returnControl,
}: {
  returnControl: React.RefObject<HTMLElement | null>;
}) {
  return (
    <div
      className="panel-leave-confirmation"
      role="alert"
      aria-label="Unsaved changes"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <h3>Keep your changes?</h3>
      <p>
        Save before leaving, or discard this form and its unsaved preview. API keys are never stored
        in the browser.
      </p>
      <button
        autoFocus
        onClick={() => {
          useWorkspacePanels.getState().resolve(false);
          requestAnimationFrame(
            () => returnControl.current?.isConnected && returnControl.current.focus(),
          );
        }}
      >
        Keep editing
      </button>
      <button className="danger" onClick={() => useWorkspacePanels.getState().resolve(true)}>
        Discard changes
      </button>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  className = '',
  kind = 'settings',
  transient = false,
  placement = 'center',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  kind?: PanelKind;
  transient?: boolean;
  placement?: 'center' | 'top';
}) {
  const id = useId();
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const lastControl = useRef<HTMLElement | null>(null);
  const focusedOnce = useRef(false);
  const restoreFrame = useRef<number | null>(null);
  const [interaction, setInteraction] = useState<{
    bounds: Rect;
    preview: SnapTarget | null;
  } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const entry = useWorkspacePanels((s) => s.entries[id]);
  const active = useWorkspacePanels((s) => (transient ? true : s.activeId === id));
  const metrics = useWorkspacePanels((s) => s.metrics);
  const navigation = useWorkspacePanels((s) =>
    !transient && s.navigation?.id === id ? s.navigation : null,
  );
  const dirty = useCallback(() => Boolean(ref.current?.querySelector('[data-dirty="true"]')), []);
  const requestClose = useCallback(() => {
    if (transient) {
      close.current();
      return;
    }
    useWorkspacePanels.getState().navigate(
      () => close.current(),
      () => {},
      id,
    );
  }, [id, transient]);

  useLayoutEffect(() => {
    // Capture the opener before the host makes a narrow canvas inert.
    returnFocus.current ??= document.activeElement as HTMLElement | null;
    if (transient) return;
    useWorkspacePanels.getState().register({
      id,
      kind,
      title,
      close: () => close.current(),
      dirty,
    });
    return () => useWorkspacePanels.getState().unregister(id);
  }, [dirty, id, kind, transient]);

  useLayoutEffect(() => {
    if (transient) return;
    useWorkspacePanels.getState().updateEntry(id, {
      title,
      close: () => close.current(),
      dirty,
    });
  }, [dirty, id, title, transient]);

  useEffect(() => {
    if (present || transient) return;
    useWorkspacePanels.getState().markClosing(id);
  }, [id, present, transient]);

  useEffect(() => {
    // A re-run while the window is still open (for example React Strict Mode) must
    // cancel the pending focus return instead of stealing focus back from the form.
    if (restoreFrame.current !== null) {
      if (active && present) cancelAnimationFrame(restoreFrame.current);
      restoreFrame.current = null;
    }
    if (!active || !present) return;
    const el = ref.current;
    if (!el) return;
    const focusIsInside = el.contains(document.activeElement);
    if (!focusedOnce.current || !focusIsInside) {
      (el.querySelector<HTMLElement>('[data-autofocus]') || el).focus({ preventScroll: true });
      focusedOnce.current = true;
    }
    return () => {
      restoreFrame.current = requestAnimationFrame(() => {
        restoreFrame.current = null;
        const state = useWorkspacePanels.getState();
        if (!transient && state.activeId && state.activeId !== id) return;
        if (
          returnFocus.current?.isConnected &&
          !returnFocus.current.closest('[inert]') &&
          (document.activeElement === document.body || el.contains(document.activeElement))
        )
          returnFocus.current.focus({ preventScroll: true });
      });
    };
  }, [active, id, present, transient]);

  useEffect(() => {
    if (!active || !present) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const currentNavigation = useWorkspacePanels.getState().navigation;
      if (currentNavigation?.id === id) {
        event.preventDefault();
        event.stopPropagation();
        useWorkspacePanels.getState().resolve(false);
        return;
      }
      if (document.querySelector('[role="dialog"], [role="menu"], [data-model-dropdown]')) return;
      event.stopPropagation();
      requestClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [active, id, present, requestClose]);

  const host = document.getElementById('workspace-panel-host');
  if (!host) return null;

  const mode = transient ? 'transient' : entry ? displayMode(entry, metrics) : 'floating';
  const baseBounds: Rect = transient
    ? metrics.narrow
      ? metrics.sheet
      : metrics.desk
    : entry
      ? frameBounds(entry, metrics)
      : { x: 0, y: 0, width: 0, height: 0 };
  const bounds: Rect = interaction
    ? {
        x: metrics.desk.x + interaction.bounds.x,
        y: metrics.desk.y + interaction.bounds.y,
        width: interaction.bounds.width,
        height: interaction.bounds.height,
      }
    : baseBounds;
  const z = transient ? 500 : entry ? Math.min(400, 10 + entry.z) : 10;
  const style: CSSProperties = {
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    zIndex: z,
  };
  const windowed = !transient && mode !== 'docked' && mode !== 'sheet';
  const canMove = windowed || mode === 'maximized';
  const controls = !transient && mode !== 'sheet';
  const showSnapMenu = controls && Boolean(entry);

  return createPortal(
    <div
      className="workspace-panel-content"
      data-mode={mode}
      data-placement={transient ? placement : undefined}
      data-motion-state={present ? 'open' : 'closing'}
      data-active={active}
      data-interacting={Boolean(interaction)}
      style={style}
      inert={!present}
      aria-hidden={!present}
      onPointerDown={(event) => {
        if (!transient) useWorkspacePanels.getState().raise(id);
        event.stopPropagation();
      }}
      onFocusCapture={(event) => {
        if (!transient) useWorkspacePanels.getState().raise(id);
        lastControl.current = event.target as HTMLElement;
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') return;
        if (event.key === 'Escape') {
          const currentNavigation = useWorkspacePanels.getState().navigation;
          if (currentNavigation?.id === id) {
            event.preventDefault();
            event.stopPropagation();
            useWorkspacePanels.getState().resolve(false);
            return;
          }
          if (!document.querySelector('[role="dialog"], [role="menu"], [data-model-dropdown]')) {
            event.preventDefault();
            event.stopPropagation();
            requestClose();
            return;
          }
        }
        event.stopPropagation();
      }}
    >
      <WindowFrame
        id={id}
        title={title}
        className={className}
        entry={entry}
        active={active}
        present={present}
        transient={transient}
        navigation={Boolean(navigation)}
        controls={controls}
        canMove={canMove}
        showSnapMenu={showSnapMenu}
        onRequestClose={requestClose}
        innerRef={ref}
        setInteraction={setInteraction}
      >
        {children}
      </WindowFrame>
      {navigation && <LeaveConfirmation returnControl={lastControl} />}
    </div>,
    host,
  );
}

function WindowFrame({
  id,
  title,
  className,
  entry,
  active,
  present,
  transient,
  navigation,
  controls,
  canMove,
  showSnapMenu,
  onRequestClose,
  innerRef,
  setInteraction,
  children,
}: {
  id: string;
  title: string;
  className: string;
  entry: PanelEntry | undefined;
  active: boolean;
  present: boolean;
  transient: boolean;
  navigation: boolean;
  controls: boolean;
  canMove: boolean;
  showSnapMenu: boolean;
  onRequestClose: () => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
  setInteraction: (value: { bounds: Rect; preview: SnapTarget | null } | null) => void;
  children: ReactNode;
}) {
  const [snapMenu, setSnapMenu] = useState<{ x: number; y: number } | null>(null);
  const interactionCleanup = useRef<(() => void) | null>(null);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | null>(null);
  const floating = Boolean(!transient && entry && !entry.maximized && entry.mode === 'floating');
  const status = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2600);
  };
  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
      interactionCleanup.current?.();
    },
    [],
  );

  const beginMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !entry || !canMove || navigation) return;
    if ((event.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    event.preventDefault();
    event.stopPropagation();
    useWorkspacePanels.getState().raise(id);
    const state = useWorkspacePanels.getState();
    const metrics = state.metrics;
    if (metrics.narrow) return;
    let start = entry.bounds;
    if (entry.maximized || isSnapMode(entry.mode)) {
      start = restoreDragBounds(entry, { x: event.clientX, y: event.clientY }, metrics);
      state.popOut(id);
      state.setBounds(id, start);
      start = useWorkspacePanels.getState().entries[id]?.bounds ?? start;
    }
    start ??= { x: 0, y: 0, width: 560, height: 640 };
    const startBounds = start;
    const startX = event.clientX;
    const startY = event.clientY;
    let latest = startBounds;
    let preview: SnapTarget | null = null;
    let finished = false;
    const root = document.documentElement;
    root.dataset.windowInteracting = 'true';
    const move = (moveEvent: PointerEvent) => {
      const current = useWorkspacePanels.getState().metrics;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      latest = moveWindowBounds(startBounds, dx, dy, current.desk);
      const candidate = snapTargetForPointer(current.desk, moveEvent.clientX, moveEvent.clientY);
      preview = candidate && canSnap(current.desk, candidate) ? candidate : null;
      useWorkspacePanels.getState().setPreview(preview);
      setInteraction({ bounds: latest, preview });
    };
    const finish = (cancelled = false) => {
      if (finished) return;
      finished = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      interactionCleanup.current = null;
      delete root.dataset.windowInteracting;
      useWorkspacePanels.getState().setPreview(null);
      setInteraction(null);
      if (!cancelled && preview) {
        if (!useWorkspacePanels.getState().snap(id, preview))
          status('There is not enough room to snap the window here.');
      } else {
        useWorkspacePanels.getState().setBounds(id, latest);
      }
    };
    const up = () => finish(false);
    const cancel = () => finish(true);
    interactionCleanup.current = () => finish(true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const beginResize = (event: React.PointerEvent<HTMLElement>, handle: ResizeHandle) => {
    if (event.button !== 0 || !entry || entry.maximized || entry.mode !== 'floating' || navigation)
      return;
    event.preventDefault();
    event.stopPropagation();
    useWorkspacePanels.getState().raise(id);
    const start = entry.bounds;
    if (!start) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let latest = start;
    let finished = false;
    const root = document.documentElement;
    root.dataset.windowInteracting = 'true';
    const move = (moveEvent: PointerEvent) => {
      const current = useWorkspacePanels.getState().metrics;
      latest = resizeWindowBounds(
        start,
        handle,
        moveEvent.clientX - startX,
        moveEvent.clientY - startY,
        current.desk,
      );
      setInteraction({ bounds: latest, preview: null });
    };
    const finish = (cancelled = false) => {
      if (finished) return;
      finished = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      interactionCleanup.current = null;
      delete root.dataset.windowInteracting;
      setInteraction(null);
      if (!cancelled) useWorkspacePanels.getState().setBounds(id, latest);
    };
    const up = () => finish(false);
    const cancel = () => finish(true);
    interactionCleanup.current = () => finish(true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const doSnap = (target: SnapTarget) => {
    setSnapMenu(null);
    if (!useWorkspacePanels.getState().snap(id, target))
      status('There is not enough room to snap the window here.');
  };

  const openSnapMenu = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setSnapMenu({ x: rect.left, y: rect.bottom + 6 });
  };

  const keyboardWindow = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!entry || !canMove || navigation) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (entry.maximized) useWorkspacePanels.getState().restore(id);
      else useWorkspacePanels.getState().maximize(id);
      return;
    }
    if (event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const target: SnapTarget =
        event.key === 'ArrowLeft'
          ? 'left'
          : event.key === 'ArrowRight'
            ? 'right'
            : event.key === 'ArrowUp'
              ? 'top'
              : 'bottom';
      doSnap(target);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const state = useWorkspacePanels.getState();
    let start = entry.bounds;
    if (entry.maximized || isSnapMode(entry.mode)) {
      start = restoreDragBounds(entry, { x: 0, y: 0 }, state.metrics);
      start.x = 0;
      start.y = 0;
      state.popOut(id);
      state.setBounds(id, start);
      start = useWorkspacePanels.getState().entries[id]?.bounds ?? start;
    }
    if (!start) return;
    const step = event.shiftKey ? 32 : 16;
    const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
    const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
    const metrics = useWorkspacePanels.getState().metrics;
    if (event.shiftKey) {
      useWorkspacePanels
        .getState()
        .setBounds(
          id,
          resizeWindowBounds(
            { ...start, width: start.width, height: start.height },
            'se',
            dx,
            dy,
            metrics.desk,
          ),
        );
    } else {
      useWorkspacePanels.getState().setBounds(id, moveWindowBounds(start, dx, dy, metrics.desk));
    }
  };

  return (
    <>
      <div
        ref={innerRef}
        role={present ? 'region' : undefined}
        aria-label={title}
        aria-roledescription={transient ? undefined : 'Window'}
        className={`modal ${transient ? '' : 'docked-panel'} ${className}`}
        tabIndex={-1}
        inert={navigation}
        aria-hidden={navigation ? true : undefined}
        data-window-active={active}
      >
        <header className="panel-titlebar">
          {!transient && canMove ? (
            <div
              className="panel-drag-handle nodrag"
              role="button"
              tabIndex={0}
              aria-label={`Move ${title} window`}
              title="Drag to move. Arrow keys move; Shift+Arrow resizes; Alt+Arrow snaps."
              onPointerDown={beginMove}
              onDoubleClick={() =>
                entry?.maximized
                  ? useWorkspacePanels.getState().restore(id)
                  : useWorkspacePanels.getState().maximize(id)
              }
              onKeyDown={keyboardWindow}
            >
              <Move size={15} aria-hidden />
              <h2>{title}</h2>
            </div>
          ) : (
            <div className="panel-title">
              <h2>{title}</h2>
            </div>
          )}
          {controls && entry && (
            <div className="panel-window-actions">
              {showSnapMenu && (
                <IconButton
                  label="Snap layout"
                  className="window-control"
                  aria-haspopup="menu"
                  aria-expanded={Boolean(snapMenu)}
                  onClick={(event) => openSnapMenu(event.currentTarget)}
                >
                  <LayoutGrid size={17} />
                </IconButton>
              )}
              <IconButton
                label={entry.maximized ? 'Restore window' : 'Maximize window'}
                className="window-control"
                onClick={() =>
                  entry.maximized
                    ? useWorkspacePanels.getState().restore(id)
                    : useWorkspacePanels.getState().maximize(id)
                }
              >
                {entry.maximized ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </IconButton>
              {entry.mode === 'docked' && !entry.maximized ? (
                <IconButton
                  label="Pop out panel"
                  className="window-control"
                  onClick={() => useWorkspacePanels.getState().popOut(id)}
                >
                  <PictureInPicture2 size={17} />
                </IconButton>
              ) : (
                <IconButton
                  label="Dock panel"
                  className="window-control"
                  onClick={() => useWorkspacePanels.getState().dock(id)}
                >
                  <PanelRightOpen size={17} />
                </IconButton>
              )}
              <IconButton
                label="Back to canvas"
                className="window-control"
                onClick={onRequestClose}
              >
                <X size={18} />
              </IconButton>
            </div>
          )}
          {!controls && (
            <div className="panel-window-actions">
              <IconButton
                label="Back to canvas"
                className="window-control"
                onClick={onRequestClose}
              >
                <X size={18} />
              </IconButton>
            </div>
          )}
        </header>
        {children}
      </div>
      {floating &&
        (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeHandle[]).map((handle) => (
          <div
            key={handle}
            className={`window-resize-handle handle-${handle}`}
            data-handle={handle}
            aria-hidden
            onPointerDown={(event) => beginResize(event, handle)}
          />
        ))}
      {notice && (
        <div className="window-notice" role="status">
          {notice}
        </div>
      )}
      {snapMenu && (
        <Menu x={snapMenu.x} y={snapMenu.y} label="Snap window" onClose={() => setSnapMenu(null)}>
          {snapOptions.map((option) => (
            <button
              key={option.target}
              role="menuitem"
              aria-label={option.label}
              onClick={() => doSnap(option.target)}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </Menu>
      )}
    </>
  );
}

export function Menu({
  x,
  y,
  label,
  onClose,
  children,
  className = '',
}: {
  x: number;
  y: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const present = useIsPresent();
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    if (!present) return;
    const menu = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const position = () => {
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft || 0) + 8,
        top = (viewport?.offsetTop || 0) + 8;
      const width = viewport?.width || window.innerWidth,
        height = viewport?.height || window.innerHeight;
      menu.style.maxHeight = `${Math.max(80, height - 20)}px`;
      menu.style.maxWidth = `${Math.max(160, width - 16)}px`;
      menu.style.overflowY = 'auto';
      const finalLeft = Math.max(left, Math.min(x, left + width - menu.offsetWidth - 16));
      const finalTop = Math.max(top, Math.min(y, top + height - menu.offsetHeight - 20));
      menu.style.left = `${finalLeft}px`;
      menu.style.top = `${finalTop}px`;
      menu.style.setProperty(
        '--menu-origin',
        `${finalLeft < x ? 'right' : 'left'} ${finalTop < y ? 'bottom' : 'top'}`,
      );
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(menu);
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    menu.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      if (
        previous?.isConnected &&
        !previous.closest('[inert]') &&
        (document.activeElement === document.body || menu.contains(document.activeElement))
      )
        previous.focus({ preventScroll: true });
    };
  }, [x, y, present]);
  useEffect(() => {
    if (!present) return;
    const dismiss = () => close.current();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.stopPropagation();
        close.current();
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>('button')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? buttons.length - 1
              : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    window.addEventListener('pointerdown', dismiss);
    const menu = ref.current!;
    menu.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      menu.removeEventListener('keydown', key);
    };
  }, [present]);
  return createPortal(
    <div
      role={present ? 'menu' : undefined}
      ref={ref}
      data-motion-state={present ? 'open' : 'closing'}
      inert={!present}
      aria-hidden={!present}
      aria-label={label}
      className={`context-menu nodrag nowheel ${className}`}
      style={{
        left: x,
        top: y,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      {children}
    </div>,
    document.body,
  );
}
