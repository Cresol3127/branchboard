import { describe, expect, it } from 'vitest';
import { headerSearchLayout } from '../src/headerLayout';

const base = { windowWidth: 1440, headerLeft: 256, leftEnd: 548, rightStart: 1376, gap: 20 };

describe('window-centered header search', () => {
  it('compensates for measured sidebar offsets, including animation intermediates', () => {
    for (const sidebar of [256, 220, 180, 128, 64]) {
      const layout = headerSearchLayout({ ...base, headerLeft: sidebar, leftEnd: sidebar + 292 });
      expect(layout.centered).toBe(true);
      expect(layout.left + sidebar).toBe(720);
      expect(layout.width).toBeLessThanOrEqual(420);
      expect(720 - layout.width / 2).toBeGreaterThanOrEqual(sidebar + 292 + base.gap);
    }
  });

  it('shrinks symmetrically to clear the canvas name and right actions', () => {
    expect(headerSearchLayout(base).width).toBe(304);
    expect(headerSearchLayout({ ...base, leftEnd: 300, rightStart: 840 }).width).toBe(200);
  });

  it('uses a compact control rather than covering a docked panel or header controls', () => {
    expect(headerSearchLayout({ ...base, headerLeft: 616, leftEnd: 908 }).centered).toBe(false);
    expect(headerSearchLayout({ ...base, rightStart: 750 }).width).toBe(40);
  });

  it('preserves the mobile compact control and rejects invalid measurements', () => {
    expect(headerSearchLayout({ ...base, windowWidth: 700 }).centered).toBe(false);
    expect(headerSearchLayout({ ...base, leftEnd: Number.NaN }).centered).toBe(false);
  });
});
