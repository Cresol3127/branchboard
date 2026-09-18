import { argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities';

export function colorTokens(seed: string, dark: boolean): Record<string, string> {
  const theme = themeFromSourceColor(argbFromHex(seed));
  const scheme = (dark ? theme.schemes.dark : theme.schemes.light).toJSON();
  // Use the softer secondary palette for large accent surfaces, not neon fills.
  scheme.primaryContainer = scheme.secondaryContainer;
  scheme.onPrimaryContainer = scheme.onSecondaryContainer;
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(scheme)) {
    tokens[`--md-sys-color-${key.replace(/[A-Z]/g, (s) => `-${s.toLowerCase()}`)}`] =
      hexFromArgb(value);
  }
  // Neutral Workspace-like surfaces; accent/foreground pairs still come from the seed.
  Object.assign(
    tokens,
    dark
      ? {
          '--md-sys-color-surface': '#131314',
          '--md-sys-color-surface-container-lowest': '#0e0e0f',
          '--md-sys-color-surface-container-low': '#1b1b1e',
          '--md-sys-color-surface-container': '#202124',
          '--md-sys-color-surface-container-high': '#2b2c2f',
          '--md-sys-color-surface-container-highest': '#35363a',
        }
      : {
          '--md-sys-color-surface': '#f8fafd',
          '--md-sys-color-surface-container-lowest': '#ffffff',
          '--md-sys-color-surface-container-low': '#f1f4f9',
          '--md-sys-color-surface-container': '#edf2f8',
          '--md-sys-color-surface-container-high': '#e6ebf2',
          '--md-sys-color-surface-container-highest': '#dee3eb',
        },
  );
  for (const [key, palette] of Object.entries(theme.palettes)) {
    for (const tone of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100])
      tokens[`--md-ref-palette-${key}-${tone}`] = hexFromArgb(palette.tone(tone));
  }
  return tokens;
}
