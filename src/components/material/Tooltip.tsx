import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

type TooltipContextValue = {
  activeId: string | null;
  setActiveId(id: string | null): void;
};

const TooltipContext = createContext<TooltipContextValue | null>(null);

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  return (
    <TooltipContext.Provider value={{ activeId, setActiveId }}>
      {children}
    </TooltipContext.Provider>
  );
}

export function Tooltip({
  label,
  placement = "above",
  children,
}: {
  label: string;
  placement?: "above" | "below";
  children: ReactNode;
}) {
  const generatedId = useId();
  const id = `tooltip-${generatedId.replaceAll(":", "")}`;
  const shared = useContext(TooltipContext);
  const [localOpen, setLocalOpen] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const open = shared ? shared.activeId === id : localOpen;

  const setOpen = (next: boolean) => {
    if (shared) shared.setActiveId(next ? id : null);
    else setLocalOpen(next);
  };

  const cancelHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  useEffect(() => cancelHold, []);

  return (
    <span
      className="md-tooltip-anchor"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        cancelHold();
        holdTimer.current = window.setTimeout(() => setOpen(true), 500);
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
    >
      {children}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={`md-tooltip md-tooltip--${placement}`}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
