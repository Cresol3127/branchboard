/** Shared timings: presentation only, never a delay for a data operation. */
export const motion = {
  duration: { fast: 120, menu: 160, node: 180, standard: 200, panel: 240 },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

export function installMotionTokens(root: HTMLElement) {
  for (const [name, value] of Object.entries(motion.duration))
    root.style.setProperty(`--motion-${name}`, `${value}ms`);
  for (const [name, value] of Object.entries(motion.easing))
    root.style.setProperty(`--ease-${name}`, value);
}
