import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";

export function Dialog({
  open,
  labelledBy,
  describedBy,
  variant = "basic",
  dismissible = true,
  initialFocusRef,
  returnFocusRef,
  onRequestClose,
  children,
}: {
  open: boolean;
  labelledBy: string;
  describedBy?: string;
  variant?: "basic" | "fullscreen";
  dismissible?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onRequestClose(): void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      previousFocus.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      queueMicrotask(() => {
        initialFocusRef?.current?.focus();
        if (!initialFocusRef?.current) {
          dialog.querySelector<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus();
        }
      });
    } else if (!open && dialog.open) {
      dialog.close();
      const target = returnFocusRef?.current ?? previousFocus.current;
      if (target?.isConnected) queueMicrotask(() => target.focus());
    }
  }, [initialFocusRef, open, returnFocusRef]);

  const handleBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (dismissible && event.target === event.currentTarget) onRequestClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`md-dialog md-dialog--${variant}`}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onRequestClose();
      }}
      onClick={handleBackdrop}
    >
      <div className="md-dialog__container">{children}</div>
    </dialog>
  );
}
