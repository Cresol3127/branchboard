import {
  Children,
  cloneElement,
  isValidElement,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type MenuItemProps = {
  children: ReactNode;
  disabled?: boolean;
  checked?: boolean;
  role?: "menuitem" | "menuitemradio" | "menuitemcheckbox";
  onSelect?(): void;
  className?: string;
};

export function MenuItem({
  children,
  disabled,
  checked,
  role = "menuitem",
  onSelect,
  className,
}: MenuItemProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitem" ? undefined : checked}
      disabled={disabled}
      tabIndex={-1}
      className={["md-menu__item", className].filter(Boolean).join(" ")}
      onClick={onSelect}
    >
      {checked ? <span className="material-symbol" aria-hidden="true">check</span> : null}
      {children}
    </button>
  );
}

export function Menu({
  open,
  anchorRef,
  label,
  onRequestClose,
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  onRequestClose(): void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const typeahead = useRef("");
  const typeaheadTimer = useRef<number | null>(null);
  const items = useMemo(
    () => Children.toArray(children).filter(isValidElement) as ReactElement<MenuItemProps>[],
    [children],
  );

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      setPosition({ top: anchor.bottom + 4, left: Math.max(8, anchor.right - 280) });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    queueMicrotask(() => menuRef.current?.querySelector<HTMLElement>("[role^='menuitem']:not(:disabled)")?.focus());
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchorRef.current?.contains(target)) onRequestClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [anchorRef, onRequestClose, open]);

  if (!open) return null;

  const focusItems = () => [...(menuRef.current?.querySelectorAll<HTMLElement>("[role^='menuitem']:not(:disabled)") ?? [])];
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = focusItems();
    const index = enabled.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      onRequestClose();
      anchorRef.current?.focus();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabled.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
      enabled[next]?.focus();
      return;
    }
    if (event.key.length === 1 && /\S/.test(event.key)) {
      typeahead.current += event.key.toLowerCase();
      if (typeaheadTimer.current !== null) window.clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = window.setTimeout(() => {
        typeahead.current = "";
      }, 500);
      enabled.find((item) => item.textContent?.trim().toLowerCase().startsWith(typeahead.current))?.focus();
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="md-menu"
      style={{ top: position.top, left: position.left }}
      onKeyDown={handleKeyDown}
      onClick={(event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest("[role^='menuitem']")) onRequestClose();
      }}
    >
      {items.map((item, index) => cloneElement(item, { key: item.key ?? index }))}
    </div>,
    document.body,
  );
}
