import { argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities';

export function colorTokens(seed: string, dark: boolean): Record<string, string> {
  const theme = themeFromSourceColor(argbFromHex(seed));
  const scheme = (dark ? theme.schemes.dark : theme.schemes.light).toJSON();
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(scheme)) {
    tokens[`--md-sys-color-${key.replace(/[A-Z]/g, (s) => `-${s.toLowerCase()}`)}`] =
      hexFromArgb(value);
  }
  tokens['--md-sys-color-surface-container'] = hexFromArgb(
    theme.palettes.neutral.tone(dark ? 12 : 96),
  );
  tokens['--md-sys-color-surface-container-high'] = hexFromArgb(
    theme.palettes.neutral.tone(dark ? 17 : 92),
  );
  for (const [key, palette] of Object.entries(theme.palettes)) {
    for (const tone of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100])
      tokens[`--md-ref-palette-${key}-${tone}`] = hexFromArgb(palette.tone(tone));
  }
  return tokens;
}
