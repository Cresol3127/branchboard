import { useLayoutEffect, type RefObject } from 'react';

/** Coordinate overlays without ever changing the user's graph viewport. */
export function useCanvasLayout(
  canvas: RefObject<HTMLElement | null>,
  minimap: boolean,
  boardId: string,
) {
  useLayoutEffect(() => {
    const root = canvas.current;
    if (!root) return;
    const composer = root.querySelector<HTMLElement>('.message-bar');
    const controls = root.querySelector<HTMLElement>('.view-controls');
    if (!composer || !controls) return;
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      const viewport = window.visualViewport;
      const inset = Math.max(
        0,
        bounds.bottom - (viewport ? viewport.offsetTop + viewport.height : window.innerHeight),
      );
      root.style.setProperty('--keyboard-inset', `${inset}px`);
      const bar = composer.getBoundingClientRect();
      const toolbar = controls.getBoundingClientRect();
      const overlaps = (width: number) =>
        bounds.right - 16 > bar.left && bounds.right - 16 - width < bar.right;
      const bottomFor = (width: number) =>
        overlaps(width) ? bounds.bottom - bar.top + 16 : inset + 16;
      let bottom = bottomFor(toolbar.width);
      const mapBottom = bottomFor(Math.min(200, bounds.width - 32));
      const mapHeight = Math.min(144, bounds.height - mapBottom - toolbar.height - 24 - 100);
      const showMap = minimap && mapHeight >= 64;
      if (showMap) bottom = Math.max(bottom, mapBottom + mapHeight + 24);
      root.dataset.minimapConstrained = String(minimap && !showMap);
      root.dataset.controlsInline = String(bottom < bounds.bottom - bar.top);
      root.style.setProperty('--controls-bottom', `${bottom}px`);
      root.style.setProperty('--minimap-bottom', `${mapBottom}px`);
      root.style.setProperty('--minimap-height', `${Math.max(64, mapHeight)}px`);
      root.style.setProperty(
        '--canvas-bottom-reserved',
        `${Math.max(bounds.bottom - bar.top, bottom + toolbar.height) + 16}px`,
      );
    };
    const observer = new ResizeObserver(measure);
    [root, composer, controls].forEach((element) => observer.observe(element));
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [canvas, minimap, boardId]);
}
