import {
  useEffect,
  useLayoutEffect,
  useRef,
  useId,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { closeWorkspacePanel, useWorkspacePanels, type PanelKind } from '../workspacePanels';
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

export function Modal({
  title,
  onClose,
  children,
  className = '',
  kind = 'settings',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  kind?: PanelKind;
}) {
  const id = useId();
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const active = useWorkspacePanels((s) => s.active?.id === id);
  useLayoutEffect(() => {
    if (!present) return;
    // Capture the opener before the host makes the narrow canvas inert.
    returnFocus.current ??= document.activeElement as HTMLElement | null;
    useWorkspacePanels.getState().activate({
      id,
      kind,
      title,
      close: () => close.current(),
      dirty: () => Boolean(ref.current?.querySelector('[data-dirty="true"]')),
    });
    return () => useWorkspacePanels.getState().release(id);
  }, [id, kind, title, present]);
  useEffect(() => {
    if (!active || !present) return;
    const previous = returnFocus.current;
    const el = ref.current!;
    (el.querySelector<HTMLElement>('[data-autofocus]') || el).focus();
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"], [role="menu"], [data-model-dropdown]')) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeWorkspacePanel();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      requestAnimationFrame(() => {
        // Wait for the host to remove inert, without stealing focus from a new
        // panel or a command's destination control.
        if (
          !useWorkspacePanels.getState().active &&
          previous?.isConnected &&
          !previous.closest('[inert]') &&
          (document.activeElement === document.body || el.contains(document.activeElement))
        )
          previous.focus({ preventScroll: true });
      });
    };
  }, [active, present]);
  const host = document.getElementById('workspace-panel-host');
  if ((!active && present) || !host) return null;
  return createPortal(
    <div
      className="workspace-panel-content"
      data-motion-state={present ? 'open' : 'closing'}
      inert={!present}
      aria-hidden={!present}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') return;
        e.stopPropagation();
        if (
          e.key === 'Escape' &&
          !document.querySelector('[role="dialog"], [role="menu"], [data-model-dropdown]')
        ) {
          e.preventDefault();
          closeWorkspacePanel();
        }
      }}
    >
      <div
        ref={ref}
        role={present ? 'region' : undefined}
        aria-label={title}
        className={`modal docked-panel ${className}`}
        tabIndex={-1}
      >
        <header>
          <h2>{title}</h2>
          <IconButton label="Back to canvas" onClick={closeWorkspacePanel}>
            <X size={18} />
          </IconButton>
        </header>
        {children}
      </div>
    </div>,
    host,
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
      menu.style.left = `${Math.max(left, Math.min(x, left + width - menu.offsetWidth - 16))}px`;
      menu.style.top = `${Math.max(top, Math.min(y, top + height - menu.offsetHeight - 20))}px`;
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
