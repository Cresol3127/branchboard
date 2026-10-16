import { useLayoutEffect, type RefObject } from 'react';
import { headerSearchLayout } from '../headerLayout';

/** Measurements affect only header CSS, never React Flow or workspace state. */
export function useHeaderSearchLayout(header: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = header.current;
    const left = root?.querySelector<HTMLElement>('.header-left');
    const right = root?.querySelector<HTMLElement>('.header-right');
    const sidebar = root?.closest('.workspace')?.querySelector<HTMLElement>('.sidebar-shell');
    const name = left?.querySelector<HTMLInputElement>('input');
    if (!root || !left || !right || !name || !sidebar) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const bounds = root.getBoundingClientRect();
      // The left container grows in compact mode; use its actual controls instead
      // of that flexible box so expanding the window can restore the full search.
      const leftEnd = Math.max(
        ...Array.from(left.children, (control) => control.getBoundingClientRect().right),
      );
      const layout = headerSearchLayout({
        windowWidth: window.innerWidth,
        headerLeft: bounds.left,
        leftEnd,
        rightStart: right.getBoundingClientRect().left,
        gap: Math.max(8, Number.parseFloat(getComputedStyle(root).columnGap) || 0),
      });
      root.dataset.searchLayout = layout.centered ? 'centered' : 'compact';
      root.dataset.searchShortcut = String(layout.centered && layout.width >= 320);
      root.style.setProperty('--header-search-left', `${layout.left}px`);
      root.style.setProperty('--header-search-width', `${layout.width}px`);
    };
    const observer = new ResizeObserver(measure);
    [root, left, right, sidebar, name].forEach((element) => observer.observe(element));
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    void document.fonts.ready.then(measure);
    measure();
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [header]);
}
