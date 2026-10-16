import { describe, expect, it, vi } from 'vitest';
import { installMotionTokens, motion } from '../src/motion';

const published = {
  spatial: {
    fast: [350, 'cubic-bezier(0.42, 1.67, 0.21, 0.9)'],
    default: [500, 'cubic-bezier(0.38, 1.21, 0.22, 1)'],
    slow: [650, 'cubic-bezier(0.39, 1.29, 0.35, 0.98)'],
  },
  effects: {
    fast: [150, 'cubic-bezier(0.31, 0.94, 0.34, 1)'],
    default: [200, 'cubic-bezier(0.34, 0.8, 0.34, 1)'],
    slow: [300, 'cubic-bezier(0.34, 0.88, 0.34, 1)'],
  },
} as const;

describe('Material 3 Expressive motion contract', () => {
  it('matches the published spatial and effects web conversions exactly', () => {
    for (const group of ['spatial', 'effects'] as const)
      for (const size of ['fast', 'default', 'slow'] as const) {
        expect(motion[group][size].duration).toBe(published[group][size][0]);
        expect(motion[group][size].easing).toBe(published[group][size][1]);
      }
  });

  it('keeps expressive overshoot on geometry and none on opacity or color', () => {
    for (const size of ['fast', 'default', 'slow'] as const) {
      const spatial = motion.spatial[size].easing.match(/[\d.]+/g)!.map(Number);
      const effects = motion.effects[size].easing.match(/[\d.]+/g)!.map(Number);
      expect(spatial[1]).toBeGreaterThan(1);
      expect(spatial[3]).toBeGreaterThanOrEqual(0.9);
      expect(spatial[3]).toBeLessThanOrEqual(1);
      expect(effects[1]).toBeLessThanOrEqual(1);
      expect(effects[3]).toBeLessThanOrEqual(1);
    }
  });

  it('installs one consistent set of CSS tokens', () => {
    const setProperty = vi.fn();
    installMotionTokens({ style: { setProperty } } as unknown as HTMLElement);
    expect(setProperty).toHaveBeenCalledTimes(12);
    expect(setProperty).toHaveBeenCalledWith('--motion-spatial-fast', '350ms');
    expect(setProperty).toHaveBeenCalledWith('--ease-spatial-fast', motion.spatial.fast.easing);
    expect(setProperty).toHaveBeenCalledWith('--motion-effects-slow', '300ms');
    expect(setProperty).toHaveBeenCalledWith(
      '--ease-effects-default',
      motion.effects.default.easing,
    );
  });
});
