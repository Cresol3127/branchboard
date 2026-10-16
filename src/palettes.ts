import { argbFromHex, Contrast, lstarFromArgb } from '@material/material-color-utilities';
import { colorTokens } from './theme';

export const colorRoles = {
  background: 'Background',
  surface: 'Panel surface',
  raised: 'Raised surface',
  text: 'Text',
  muted: 'Secondary text',
  accent: 'Accent',
  onAccent: 'Text on accent',
  border: 'Borders',
  hover: 'Hover surface',
  selection: 'Selection surface',
  selectionText: 'Selection text',
  focus: 'Focus indicator',
  error: 'Error',
  onError: 'Text on error',
} as const;
export type PaletteColors = Record<keyof typeof colorRoles, string>;
export type Palette = {
  id: string;
  name: string;
  description?: string;
  light: PaletteColors;
  dark: PaletteColors;
};
export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export function contrast(a: string, b: string) {
  return Contrast.ratioOfTones(lstarFromArgb(argbFromHex(a)), lstarFromArgb(argbFromHex(b)));
}
export function mix(a: string, b: string, fraction: number) {
  const channels = [1, 3, 5].map((i) =>
    Math.round(
      parseInt(a.slice(i, i + 2), 16) * (1 - fraction) + parseInt(b.slice(i, i + 2), 16) * fraction,
    ),
  );
  return `#${channels.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function readable(color: string, surfaces: string[], minimum = 4.5) {
  if (surfaces.every((s) => contrast(color, s) >= minimum)) return color;
  const target = ['#000000', '#ffffff'].sort(
    (a, b) =>
      Math.min(...surfaces.map((s) => contrast(b, s))) -
      Math.min(...surfaces.map((s) => contrast(a, s))),
  )[0];
  for (let i = 1; i <= 100; i++) {
    const candidate = mix(color, target, i / 100);
    if (surfaces.every((s) => contrast(candidate, s) >= minimum)) return candidate;
  }
  return target;
}
function scheme(
  background: string,
  surface: string,
  text: string,
  muted: string,
  seed: string,
  border: string,
): PaletteColors {
  const raised = mix(surface, text, 0.045);
  const hover = mix(surface, text, 0.08);
  const surfaces = [background, surface, raised, hover];
  const accent = readable(seed, surfaces);
  const selection = mix(surface, seed, 0.18);
  const error = readable('#db4b4b', surfaces);
  return {
    background,
    surface,
    raised,
    hover,
    text: readable(text, surfaces),
    muted: readable(muted, surfaces),
    accent,
    onAccent: readable(text, [accent]),
    border: readable(border, surfaces, 3),
    focus: readable(seed, surfaces, 3),
    selection,
    selectionText: readable(text, [selection]),
    error,
    onError: readable(text, [error]),
  };
}
// Source colors are mapped to UI roles, with foregrounds adjusted for readable contrast.
// See docs/palette-sources.md for upstream sources and adapted/inspired variants.
const definitions: [string, string, string, string[], string[]][] = [
  [
    'gruvbox',
    'Gruvbox',
    'Warm retro · light / dark',
    ['#fbf1c7', '#f9f5d7', '#3c3836', '#665c54', '#79740e', '#bdae93'],
    ['#282828', '#1d2021', '#ebdbb2', '#a89984', '#b8bb26', '#665c54'],
  ],
  [
    'nord',
    'Nord',
    'Arctic · adapted light / Polar Night',
    ['#eceff4', '#e5e9f0', '#2e3440', '#4c566a', '#5e81ac', '#9ba9bc'],
    ['#2e3440', '#272c36', '#eceff4', '#a6b1c1', '#88c0d0', '#4c566a'],
  ],
  [
    'catppuccin',
    'Catppuccin',
    'Latte / Mocha',
    ['#eff1f5', '#e6e9ef', '#4c4f69', '#6c6f85', '#8839ef', '#9ca0b0'],
    ['#1e1e2e', '#181825', '#cdd6f4', '#a6adc8', '#cba6f7', '#585b70'],
  ],
  [
    'monokai',
    'Monokai',
    'Adapted light / classic dark',
    ['#faf9f0', '#f1f0e6', '#3e3d32', '#676655', '#6b8300', '#a6a38c'],
    ['#272822', '#20211c', '#f8f8f2', '#b6b6a6', '#a6e22e', '#75715e'],
  ],
  [
    'solarized',
    'Solarized',
    'Canonical light / dark',
    ['#fdf6e3', '#eee8d5', '#586e75', '#657b83', '#268bd2', '#93a1a1'],
    ['#002b36', '#00232c', '#93a1a1', '#839496', '#2aa198', '#586e75'],
  ],
  [
    'vscode',
    'VS Code',
    'Light+ / Dark+ inspired',
    ['#ffffff', '#f3f3f3', '#333333', '#616161', '#007acc', '#b4b4b4'],
    ['#1e1e1e', '#181818', '#d4d4d4', '#9d9d9d', '#3794ff', '#555555'],
  ],
  [
    'tokyonight',
    'Tokyo Night',
    'Day / Night',
    ['#e1e2e7', '#d5d6db', '#3760bf', '#6172b0', '#2e7de9', '#9699a3'],
    ['#1a1b26', '#16161e', '#c0caf5', '#9aa5ce', '#7aa2f7', '#565f89'],
  ],
  [
    'dracula',
    'Dracula',
    'Adapted light / classic dark',
    ['#f8f8f2', '#edede7', '#282a36', '#626477', '#8b3fc9', '#a1a2af'],
    ['#282a36', '#21222c', '#f8f8f2', '#b6b8ce', '#bd93f9', '#6272a4'],
  ],
  [
    'one-dark',
    'One Dark',
    'One Light / One Dark inspired',
    ['#fafafa', '#f0f0f0', '#383a42', '#696c77', '#4078f2', '#a0a1a7'],
    ['#282c34', '#21252b', '#abb2bf', '#9da5b4', '#61afef', '#5c6370'],
  ],
  [
    'gemini',
    'Gemini',
    'Google Gemini inspired',
    ['#f8fafd', '#ffffff', '#1f1f1f', '#59616d', '#4466cf', '#abb7cc'],
    ['#131314', '#1e1f20', '#e3e3e3', '#aeb6c5', '#a8c7fa', '#5f6368'],
  ],
  [
    'chatgpt',
    'ChatGPT',
    'OpenAI ChatGPT inspired',
    ['#ffffff', '#f9f9f9', '#0d0d0d', '#606060', '#14836b', '#b4b4b4'],
    ['#212121', '#171717', '#ececec', '#b4b4b4', '#66c5a4', '#676767'],
  ],
  [
    'claude',
    'Claude',
    'Anthropic Claude inspired',
    ['#faf9f5', '#f0eee6', '#3d3929', '#6e6a5e', '#b45d3f', '#b8b3a5'],
    ['#262624', '#1f1f1d', '#ece8df', '#b7b2a7', '#d99b7e', '#706b60'],
  ],
];
export const builtinPalettes: Palette[] = definitions.map(
  ([id, name, description, light, dark]) => ({
    id,
    name,
    description,
    light: scheme(...(light as [string, string, string, string, string, string])),
    dark: scheme(...(dark as [string, string, string, string, string, string])),
  }),
);
export function paletteWarnings(colors: PaletteColors) {
  const checks: [keyof PaletteColors, keyof PaletteColors, number][] = [
    ...(['background', 'surface', 'raised', 'hover'] as const).flatMap(
      (bg) =>
        [
          ['text', bg, 4.5],
          ['muted', bg, 4.5],
          ['focus', bg, 3],
          ['border', bg, 3],
        ] as [keyof PaletteColors, keyof PaletteColors, number][],
    ),
    ['onAccent', 'accent', 4.5],
    ['selectionText', 'selection', 4.5],
    ['onError', 'error', 4.5],
  ];
  return checks
    .filter(([a, b, minimum]) => contrast(colors[a], colors[b]) < minimum)
    .map(([a, b]) => `${colorRoles[a]} on ${colorRoles[b].toLowerCase()}`);
}
export function paletteTokens(palette: Palette | undefined, dark: boolean): Record<string, string> {
  if (!palette) return colorTokens('#8DB89A', dark);
  const c = dark ? palette.dark : palette.light;
  const tokens = colorTokens(c.accent, dark);
  const roles: Record<string, string> = {
    background: c.background,
    onBackground: c.text,
    surface: c.background,
    onSurface: c.text,
    surfaceVariant: c.raised,
    onSurfaceVariant: c.muted,
    surfaceContainerLowest: c.surface,
    surfaceContainerLow: c.raised,
    surfaceContainer: c.raised,
    surfaceContainerHigh: c.hover,
    surfaceContainerHighest: c.hover,
    surfaceDim: c.surface,
    surfaceBright: c.hover,
    outline: c.border,
    outlineVariant: c.border,
    inverseSurface: c.text,
    inverseOnSurface: c.background,
    inversePrimary: c.accent,
    error: c.error,
    onError: c.onError,
    errorContainer: c.error,
    onErrorContainer: c.onError,
  };
  for (const role of ['primary', 'secondary', 'tertiary'])
    Object.assign(roles, {
      [role]: c.accent,
      [`on${role[0].toUpperCase()}${role.slice(1)}`]: c.onAccent,
      [`${role}Container`]: c.selection,
      [`on${role[0].toUpperCase()}${role.slice(1)}Container`]: c.selectionText,
    });
  for (const [key, value] of Object.entries(roles))
    tokens[`--md-sys-color-${key.replace(/[A-Z]/g, (s) => `-${s.toLowerCase()}`)}`] = value;
  tokens['--palette-focus'] = c.focus;
  tokens['--palette-border'] = c.border;
  tokens['--palette-hover'] = c.hover;
  tokens['--palette-selection'] = c.selection;
  tokens['--palette-selection-text'] = c.selectionText;
  return tokens;
}
