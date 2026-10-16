import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { builtinPalettes, paletteTokens, paletteWarnings } from '../src/palettes';
import { colorTokens } from '../src/theme';

describe('complete built-in palettes', () => {
  for (const palette of builtinPalettes)
    for (const mode of ['light', 'dark'] as const) {
      it(`${palette.name} ${mode} has readable foreground, selection and focus pairs`, () => {
        expect(paletteWarnings(palette[mode])).toEqual([]);
        const tokens = paletteTokens(palette, mode === 'dark');
        expect(tokens['--md-sys-color-surface']).toBe(palette[mode].background);
        expect(tokens['--md-sys-color-on-surface']).toBe(palette[mode].text);
        expect(tokens['--palette-focus']).toBe(palette[mode].focus);
      });
    }
  it('keeps original installations visually unchanged until a palette is chosen', () => {
    for (const dark of [false, true])
      expect(paletteTokens(undefined, dark)).toEqual(colorTokens('#8DB89A', dark));
  });
});

let memory: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  memory = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => memory.set(k, v)),
  });
});
afterEach(() => vi.unstubAllGlobals());
const personal = () => ({
  ...structuredClone(builtinPalettes[0]),
  id: 'my-palette',
  name: 'My palette',
});
describe('personal palette persistence', () => {
  it('saves, renames, duplicates and deletes personal palettes without touching workspace or mode', async () => {
    const { useAppearance, APPEARANCE_KEY } = await import('../src/appearance');
    memory.set('branchboard.theme', 'system');
    memory.set('branchboard.workspace.v1', 'original');
    const p = personal();
    expect(useAppearance.getState().commit({ version: 1, active: p.id, custom: [p] })).toBe(true);
    expect(
      useAppearance
        .getState()
        .commit({ version: 1, active: p.id, custom: [{ ...p, name: 'Renamed' }] }),
    ).toBe(true);
    const duplicate = { ...p, id: 'copy', name: 'Copy' };
    expect(
      useAppearance.getState().commit({ version: 1, active: 'copy', custom: [p, duplicate] }),
    ).toBe(true);
    expect(useAppearance.getState().commit({ version: 1, active: 'default', custom: [p] })).toBe(
      true,
    );
    expect(JSON.parse(memory.get(APPEARANCE_KEY)!).custom).toHaveLength(1);
    expect(memory.get('branchboard.theme')).toBe('system');
    expect(memory.get('branchboard.workspace.v1')).toBe('original');
  });
  it('previews without saving and restores saved colors when canceled', async () => {
    const { useAppearance, selectedPalette } = await import('../src/appearance');
    const p = personal();
    useAppearance.getState().setPreview(p);
    expect(selectedPalette(useAppearance.getState())).toEqual(p);
    expect(memory.size).toBe(0);
    useAppearance.getState().setPreview(null);
    expect(selectedPalette(useAppearance.getState())).toBeUndefined();
  });
  it('protects builtins and rejects invalid roles, IDs, names, versions and CSS', async () => {
    const { validateAppearance } = await import('../src/appearance');
    const p = personal(),
      input = { version: 1, active: p.id, custom: [p] };
    for (const custom of [
      [{ ...p, id: 'gruvbox' }],
      [{ ...p, id: 'default' }],
      [{ ...p, name: ' ' }],
      [p, p],
      [{ ...p, dark: { ...p.dark, text: 'url(https://invalid.example)' } }],
    ])
      expect(() => validateAppearance({ ...input, custom })).toThrow('Invalid');
    expect(() => validateAppearance({ ...input, version: 2 })).toThrow('Invalid');
    expect(paletteWarnings({ ...p.dark, text: p.dark.background })).not.toEqual([]);
  });
  it('does not overwrite corrupt libraries, and keeps saved selection through quota failures', async () => {
    const { useAppearance, loadAppearance, APPEARANCE_KEY } = await import('../src/appearance');
    memory.set(APPEARANCE_KEY, 'broken');
    expect(loadAppearance().error).toContain('not been overwritten');
    useAppearance.setState(loadAppearance());
    expect(useAppearance.getState().commit({ version: 1, active: 'nord', custom: [] })).toBe(false);
    expect(memory.get(APPEARANCE_KEY)).toBe('broken');
    useAppearance.setState({ saved: { version: 1, active: 'default', custom: [] }, error: '' });
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error('Quota');
    });
    expect(useAppearance.getState().commit({ version: 1, active: 'nord', custom: [] })).toBe(false);
    expect(useAppearance.getState().saved.active).toBe('default');
  });
});
