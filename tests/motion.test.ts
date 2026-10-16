import { describe, expect, it, vi } from 'vitest';
import { installMotionTokens, motion } from '../src/motion';

describe('shared motion contract', () => {
  it('uses bounded durations and valid non-overshooting cubic-bezier curves', () => {
    for (const duration of Object.values(motion.duration)) {
      expect(duration).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThanOrEqual(300);
    }
    for (const easing of Object.values(motion.easing)) {
      const values = easing.match(/[\d.]+/g)!.map(Number);
      expect(values).toHaveLength(4);
      values.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    }
  });
  it('installs one consistent set of CSS tokens without workspace writes', () => {
    const setProperty = vi.fn();
    installMotionTokens({ style: { setProperty } } as unknown as HTMLElement);
    expect(setProperty).toHaveBeenCalledTimes(8);
    expect(setProperty).toHaveBeenCalledWith('--motion-panel', '240ms');
    expect(setProperty).toHaveBeenCalledWith('--ease-enter', motion.easing.enter);
    expect(setProperty).toHaveBeenCalledWith('--ease-exit', motion.easing.exit);
  });
});
