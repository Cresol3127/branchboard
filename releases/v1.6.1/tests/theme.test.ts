import { describe, expect, it } from 'vitest';
import { argbFromHex, Contrast, lstarFromArgb } from '@material/material-color-utilities';
import { colorTokens } from '../src/theme';

describe('Material dynamic color', () => {
  for (const seed of ['#7b65c7', '#008060', '#ff8800', '#000000', '#ffffff']) {
    for (const dark of [false, true]) {
      it(`provides accessible paired roles for ${seed}, dark=${dark}`, () => {
        const tokens = colorTokens(seed, dark);
        const tone = (role: string) => lstarFromArgb(argbFromHex(tokens[`--md-sys-color-${role}`]));
        for (const [foreground, background] of [
          ['on-primary', 'primary'],
          ['on-primary-container', 'primary-container'],
          ['on-secondary-container', 'secondary-container'],
          ['on-tertiary-container', 'tertiary-container'],
          ['on-surface', 'surface-container-high'],
          ['on-surface-variant', 'surface-container'],
          ['inverse-on-surface', 'inverse-surface'],
          ['on-error-container', 'error-container'],
        ]) {
          expect(Contrast.ratioOfTones(tone(foreground), tone(background))).toBeGreaterThanOrEqual(
            4.5,
          );
        }
        expect(tokens['--md-ref-palette-primary-0']).toBe('#000000');
        expect(tokens['--md-ref-palette-primary-100']).toBe('#ffffff');
        expect(tokens['--md-sys-color-outline']).toMatch(/^#[\da-f]{6}$/);
      });
    }
  }
  it('changes semantic colors with both the seed and theme', () => {
    const light = colorTokens('#7b65c7', false);
    expect(colorTokens('#008060', false)['--md-sys-color-primary']).not.toBe(
      light['--md-sys-color-primary'],
    );
    expect(colorTokens('#7b65c7', true)['--md-sys-color-surface']).not.toBe(
      light['--md-sys-color-surface'],
    );
  });
});
