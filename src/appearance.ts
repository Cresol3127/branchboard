import { create } from 'zustand';
import { builtinPalettes, colorRoles, isHexColor, paletteTokens, type Palette } from './palettes';

export const APPEARANCE_KEY = 'branchboard.appearance.v1';
export type Appearance = { version: 1; active: string; custom: Palette[] };
export function validateAppearance(input: unknown): Appearance {
  if (!input || typeof input !== 'object') throw Error('Invalid palette library.');
  const a = input as Appearance;
  if (
    a.version !== 1 ||
    typeof a.active !== 'string' ||
    !Array.isArray(a.custom) ||
    a.custom.length > 100
  )
    throw Error('Invalid palette library.');
  const seen = new Set(['default', ...builtinPalettes.map((p) => p.id)]);
  const custom = a.custom.map((p) => {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !/^[\w-]{1,80}$/.test(p.id) ||
      seen.has(p.id) ||
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      p.name.length > 60
    )
      throw Error('Invalid custom palette.');
    seen.add(p.id);
    const colors = (mode: 'light' | 'dark') =>
      Object.fromEntries(
        Object.keys(colorRoles).map((role) => {
          const value = p[mode]?.[role as keyof typeof colorRoles];
          if (!isHexColor(value)) throw Error('Invalid custom palette color.');
          return [role, value.toLowerCase()];
        }),
      ) as Palette['light'];
    return { id: p.id, name: p.name.trim(), light: colors('light'), dark: colors('dark') };
  });
  return {
    version: 1,
    active: a.active === 'default' || seen.has(a.active) ? a.active : 'default',
    custom,
  };
}
export function loadAppearance(): { saved: Appearance; error: string } {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw && raw.length > 300_000) throw Error('Oversized palette library.');
    return {
      saved: raw
        ? validateAppearance(JSON.parse(raw))
        : { version: 1, active: 'default', custom: [] },
      error: '',
    };
  } catch {
    return {
      saved: { version: 1, active: 'default', custom: [] },
      error: 'Saved palettes could not be read. The original data has not been overwritten.',
    };
  }
}
type State = ReturnType<typeof loadAppearance> & {
  preview: Palette | null;
  commit: (saved: Appearance) => boolean;
  setPreview: (palette: Palette | null) => void;
};
export const useAppearance = create<State>((set, get) => ({
  ...loadAppearance(),
  preview: null,
  commit: (saved) => {
    try {
      // Do not silently replace an unreadable custom library.
      if (get().error.startsWith('Saved palettes could not be read')) throw Error(get().error);
      const valid = validateAppearance(saved);
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(valid));
      set({ saved: valid, preview: null, error: '' });
      return true;
    } catch (error) {
      set({
        error:
          error instanceof Error && error.message.startsWith('Saved palettes')
            ? error.message
            : 'Palette could not be saved. Free browser storage or allow local storage, then try again.',
      });
      return false;
    }
  },
  setPreview: (preview) => set({ preview }),
}));
export function selectedPalette(state: Pick<State, 'saved' | 'preview'>) {
  return (
    state.preview ??
    [...builtinPalettes, ...state.saved.custom].find((p) => p.id === state.saved.active)
  );
}
export function applyAppearance(mode: string, state = useAppearance.getState()) {
  const dark =
    mode === 'dark' ||
    (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // Remove previous custom-only roles when returning to the original appearance.
  for (const name of ['focus', 'border', 'hover', 'selection', 'selection-text'])
    document.documentElement.style.removeProperty(`--palette-${name}`);
  for (const [key, value] of Object.entries(paletteTokens(selectedPalette(state), dark)))
    document.documentElement.style.setProperty(key, value);
  return dark;
}
