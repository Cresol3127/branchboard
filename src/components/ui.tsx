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
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const active = useWorkspacePanels((s) => s.active?.id === id);
  useLayoutEffect(() => {
    useWorkspacePanels.getState().activate({
      id,
      kind,
      title,
      close: () => close.current(),
      dirty: () => Boolean(ref.current?.querySelector('[data-dirty="true"]')),
    });
    return () => useWorkspacePanels.getState().release(id);
  }, [id, kind, title]);
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    (el.querySelector<HTMLElement>('[data-autofocus]') || el).focus();
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeWorkspacePanel();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      if (previous?.isConnected) previous.focus();
    };
  }, [active]);
  const host = document.getElementById('workspace-panel-host');
  if (!active || !host) return null;
  return createPortal(
    <div
      className="workspace-panel-content"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') return;
        e.stopPropagation();
        if (e.key === 'Escape' && !document.querySelector('[role="dialog"], [role="menu"]')) {
          e.preventDefault();
          closeWorkspacePanel();
        }
      }}
    >
      <div
        ref={ref}
        role="region"
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
}: {
  x: number;
  y: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const menu = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const position = () => {
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft || 0) + 8,
        top = (viewport?.offsetTop || 0) + 8;
      const width = viewport?.width || window.innerWidth,
        height = viewport?.height || window.innerHeight;
      menu.style.maxHeight = `${Math.max(80, height - 16)}px`;
      menu.style.overflowY = 'auto';
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(left, Math.min(x, left + width - rect.width - 16))}px`;
      menu.style.top = `${Math.max(top, Math.min(y, top + height - rect.height - 16))}px`;
    };
    position();
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    menu.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      previous?.focus();
    };
  }, [x, y]);
  useEffect(() => {
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
  }, []);
  return createPortal(
    <div
      role="menu"
      ref={ref}
      aria-label={label}
      className="context-menu nodrag nowheel"
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
