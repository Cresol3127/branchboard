import { useEffect, useRef } from 'react';

export function CanvasListItem({
  name,
  number,
  active,
  menuOpen,
  onSelect,
  onMenu,
}: {
  name: string;
  number: number;
  active: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const cancelPress = () => {
    clearTimeout(timer.current);
    gesture.current = null;
  };
  useEffect(() => cancelPress, []);
  const open = (x: number, y: number) => {
    button.current?.focus({ preventScroll: true });
    onMenu(x, y);
  };
  return (
    <div className="board-row">
      <button
        ref={button}
        aria-label={name}
        aria-description="Right-click, press Shift+F10, or long-press for canvas actions."
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={`${name} · Right-click or long-press for actions`}
        className={`board-link ${active ? 'active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={(e) => {
          if (suppressClick.current && e.detail !== 0) {
            e.preventDefault();
            suppressClick.current = false;
            return;
          }
          onSelect();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (gesture.current) suppressClick.current = true;
          cancelPress();
          const rect = e.currentTarget.getBoundingClientRect();
          open(e.clientX || rect.right, e.clientY || rect.top);
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') return;
          e.stopPropagation();
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            open(rect.right + 4, rect.top);
          }
        }}
        onPointerDown={(e) => {
          cancelPress();
          suppressClick.current = false;
          if (e.pointerType !== 'touch' || !e.isPrimary) return;
          gesture.current = { x: e.clientX, y: e.clientY };
          timer.current = setTimeout(() => {
            const start = gesture.current;
            if (!start || !button.current?.isConnected) return;
            suppressClick.current = true;
            open(start.x, start.y);
            cancelPress();
          }, 550);
        }}
        onPointerMove={(e) => {
          const start = gesture.current;
          if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancelPress();
        }}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
      >
        <span className="canvas-number" aria-hidden="true">
          {number}
        </span>
        <span>{name}</span>
        {active && <span className="active-dot" />}
      </button>
    </div>
  );
}
