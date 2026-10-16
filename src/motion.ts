/**
 * Material 3 Expressive motion.
 *
 * Spatial tokens animate geometry: position, size, scale, rotation and clips.
 * Effects tokens animate opacity, color and elevation. Presentation never delays
 * a data operation.
 */
export const motion = {
  spatial: {
    fast: { duration: 350, easing: 'cubic-bezier(0.42, 1.67, 0.21, 0.9)' },
    default: { duration: 500, easing: 'cubic-bezier(0.38, 1.21, 0.22, 1)' },
    slow: { duration: 650, easing: 'cubic-bezier(0.39, 1.29, 0.35, 0.98)' },
  },
  effects: {
    fast: { duration: 150, easing: 'cubic-bezier(0.31, 0.94, 0.34, 1)' },
    default: { duration: 200, easing: 'cubic-bezier(0.34, 0.8, 0.34, 1)' },
    slow: { duration: 300, easing: 'cubic-bezier(0.34, 0.88, 0.34, 1)' },
  },
} as const;

export function installMotionTokens(root: HTMLElement) {
  for (const group of ['spatial', 'effects'] as const)
    for (const [name, token] of Object.entries(motion[group])) {
      root.style.setProperty(`--motion-${group}-${name}`, `${token.duration}ms`);
      root.style.setProperty(`--ease-${group}-${name}`, token.easing);
    }
}
