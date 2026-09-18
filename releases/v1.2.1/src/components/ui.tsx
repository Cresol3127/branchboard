import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const focusables = () =>
      [
        ...el.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ].filter((e) => e.getClientRects().length);
    (el.querySelector<HTMLElement>('[data-autofocus]') || el).focus();
    const key = (event: KeyboardEvent) => {
      // A busy form can disable the focused control and move focus to <body>.
      // Keep Escape and focus containment working for the topmost dialog.
      if ([...document.querySelectorAll('[role="dialog"]')].at(-1) !== el) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        close.current();
      }
      if (event.key === 'Tab') {
        const items = focusables(),
          first = items[0],
          last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === el)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        } else if (!el.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${className}`}
        tabIndex={-1}
      >
        <header>
          <h2>{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        {children}
      </div>
    </div>,
    document.body,
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
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
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
