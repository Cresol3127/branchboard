import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { motion } from '../motion';

const MotionPresence = createContext(true);
const query = '(prefers-reduced-motion: reduce)';
const reduced = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
const subscribe = (change: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', change);
  return () => media.removeEventListener('change', change);
};
export const useReducedMotion = () => useSyncExternalStore(subscribe, reduced, () => true);
export const useIsPresent = () => useContext(MotionPresence);

export function useMotionPresence(open: boolean, duration: number) {
  const reduce = useReducedMotion();
  const [retained, setRetained] = useState(open);
  useLayoutEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    if (reduce) {
      setRetained(false);
      return;
    }
    const timer = window.setTimeout(() => setRetained(false), duration + 32);
    return () => window.clearTimeout(timer);
  }, [open, duration, reduce]);
  return open || (!reduce && retained);
}

/** Retain the actual React subtree briefly, not a clone of form DOM or its values. */
export function Presence({
  children,
  duration = motion.spatial.default.duration,
}: {
  children: ReactNode;
  duration?: number;
}) {
  const parent = useIsPresent();
  const present = Boolean(children) && parent;
  const identity = useRef({ present: false, generation: 0 });
  if (present && !identity.current.present) identity.current.generation++;
  identity.current.present = present;
  const retained = useRef<ReactNode>(null);
  if (present) retained.current = children;
  const rendered = useMotionPresence(present, duration);
  if (!rendered) return null;
  return (
    <MotionPresence.Provider key={identity.current.generation} value={present}>
      {retained.current}
    </MotionPresence.Provider>
  );
}

/** Animate the reveal, not the buttons' hit targets; closed controls are inert. */
export function MotionReveal({ open, children }: { open: boolean; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = inner.current!;
    const measure = () => setWidth(element.scrollWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className="creation-extra"
      data-open={open}
      inert={!open}
      aria-hidden={!open}
      style={{ '--reveal-width': `${width}px` } as CSSProperties}
    >
      <div ref={inner} className="creation-extra-inner">
        {children}
      </div>
    </div>
  );
}
