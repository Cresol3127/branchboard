import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function SideSheet({
  open,
  modal,
  labelledBy,
  onRequestClose,
  children,
}: {
  open: boolean;
  modal: boolean;
  labelledBy: string;
  onRequestClose(): void;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    queueMicrotask(() => {
      sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    return () => {
      const target = previousFocus.current;
      if (target?.isConnected) queueMicrotask(() => target.focus());
    };
  }, [open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onRequestClose();
      return;
    }
    if (!modal || event.key !== "Tab") return;
    const focusable = [...(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;
  return (
    <div
      className={`md-side-sheet-layer ${modal ? "is-modal" : "is-standard"}`}
      onMouseDown={(event) => {
        if (modal && event.target === event.currentTarget) onRequestClose();
      }}
    >
      <aside
        ref={sheetRef}
        role="dialog"
        aria-modal={modal || undefined}
        aria-labelledby={labelledBy}
        className="md-side-sheet"
        onKeyDown={handleKeyDown}
      >
        {children}
      </aside>
    </div>
  );
}
