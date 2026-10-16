import { useEffect, useState } from 'react';
import {
  builtinPalettes,
  colorRoles,
  isHexColor,
  paletteWarnings,
  type Palette,
  type PaletteColors,
} from '../palettes';
import { useAppearance } from '../appearance';
import { colorTokens } from '../theme';
import { useIsPresent } from './Motion';

function PaletteColorField({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  onReset: () => void;
}) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  return (
    <div className="palette-color-field">
      <span>
        {label}
        <button
          type="button"
          className="text-button"
          aria-label={`Reset ${label}`}
          onClick={() => {
            setHex(value);
            onReset();
          }}
        >
          Reset
        </button>
      </span>
      <span>
        <input
          type="color"
          aria-label={`${label} color`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          aria-label={`${label} hex`}
          required
          pattern="#[0-9a-fA-F]{6}"
          maxLength={7}
          value={hex}
          onChange={(e) => {
            setHex(e.target.value);
            if (isHexColor(e.target.value)) onChange(e.target.value);
          }}
        />
      </span>
    </div>
  );
}

export function PaletteSettings() {
  const present = useIsPresent();
  const { saved, error, commit, setPreview } = useAppearance();
  const [draft, setDraft] = useState<Palette | null>(null);
  const [baseline, setBaseline] = useState<Palette | null>(null);
  const [editingMode, setEditingMode] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [resetRevision, setResetRevision] = useState(0);
  useEffect(() => () => useAppearance.getState().setPreview(null), []);
  useEffect(() => {
    if (!present) useAppearance.getState().setPreview(null);
  }, [present]);
  const active = [...builtinPalettes, ...saved.custom].find((p) => p.id === saved.active);
  const custom = saved.custom.some((p) => p.id === active?.id);
  const edit = (copy = false) => {
    const fallback = (dark: boolean) => {
      const t = colorTokens('#8DB89A', dark);
      const read = (role: string) => t[`--md-sys-color-${role}`];
      return {
        background: read('surface'),
        surface: read('surface-container-lowest'),
        raised: read('surface-container'),
        text: read('on-surface'),
        muted: read('on-surface-variant'),
        accent: read('primary'),
        onAccent: read('on-primary'),
        border: read('outline'),
        hover: read('surface-container-high'),
        selection: read('primary-container'),
        selectionText: read('on-primary-container'),
        focus: read('primary'),
        error: read('error'),
        onError: read('on-error'),
      };
    };
    const base = active ?? {
      id: 'default',
      name: 'Original',
      light: fallback(false),
      dark: fallback(true),
    };
    const next = structuredClone(base);
    if (!custom || copy) {
      next.id = crypto.randomUUID();
      next.name = `${base.name} copy`.slice(0, 60);
    }
    setEditingMode(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    setBaseline(structuredClone(next));
    setDraft(next);
    setPreview(next);
    setFeedback('');
    setDeleting(false);
  };
  const update = (next: Palette) => {
    setDraft(next);
    setPreview(next);
  };
  const cancel = () => {
    setDraft(null);
    setPreview(null);
  };
  const warnings = draft ? paletteWarnings(draft[editingMode]) : [];
  return (
    <section className="palette-settings" data-dirty={Boolean(draft)}>
      <label className="appearance-field" htmlFor="ui-palette">
        UI palette
        <select
          id="ui-palette"
          aria-label="UI palette"
          value={saved.active}
          disabled={Boolean(draft)}
          onChange={(e) => {
            setDeleting(false);
            commit({ ...saved, active: e.target.value });
          }}
        >
          <option value="default">Original · Sage</option>
          <optgroup label="Built-in palettes">
            {builtinPalettes.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {saved.custom.length > 0 && (
            <optgroup label="Your palettes">
              {saved.custom.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <p className="muted">
        {active?.description ??
          (custom ? 'Your saved palette' : 'The original BranchBoard appearance')}
        . Light, Dark and System work independently.
      </p>
      <div className="palette-swatches" aria-label="Palette preview">
        {(['background', 'surface', 'text', 'accent', 'selection'] as const).map((role) => (
          <span
            key={role}
            title={colorRoles[role]}
            style={{
              background: {
                background: 'var(--app-bg)',
                surface: 'var(--surface)',
                text: 'var(--text)',
                accent: 'var(--primary)',
                selection: 'var(--accent)',
              }[role],
            }}
          />
        ))}
      </div>
      {!draft && (
        <div className="provider-actions">
          <button type="button" onClick={() => edit()}>
            {custom ? 'Edit palette' : 'Customize palette'}
          </button>
          {custom && (
            <>
              <button type="button" onClick={() => edit(true)}>
                Duplicate palette
              </button>
              <button type="button" className="danger" onClick={() => setDeleting(true)}>
                Delete palette
              </button>
            </>
          )}
        </div>
      )}
      {deleting && !draft && (
        <div className="palette-delete" role="group" aria-label="Delete custom palette">
          <p>Delete “{active?.name}”? Built-in palettes are not affected.</p>
          <button type="button" onClick={() => setDeleting(false)}>
            Cancel deletion
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (
                commit({
                  ...saved,
                  active: 'default',
                  custom: saved.custom.filter((p) => p.id !== active?.id),
                })
              )
                setDeleting(false);
            }}
          >
            Confirm deletion
          </button>
        </div>
      )}
      {draft && (
        <form
          className="palette-editor"
          onSubmit={(e) => {
            e.preventDefault();
            const next = { ...draft, name: draft.name.trim() };
            if (!next.name) return;
            if (
              commit({
                ...saved,
                active: next.id,
                custom: [...saved.custom.filter((p) => p.id !== next.id), next],
              })
            ) {
              setDraft(null);
              setFeedback('Custom palette saved.');
            }
          }}
        >
          <div className="palette-preview-notice">
            <span>Live preview · unsaved</span>
            <button type="button" onClick={cancel}>
              Revert preview
            </button>
          </div>
          <label className="appearance-field">
            Palette name
            <input
              aria-label="Palette name"
              required
              maxLength={60}
              value={draft.name}
              onChange={(e) => update({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="appearance-field">
            Tune colors for
            <select
              aria-label="Palette mode to edit"
              value={editingMode}
              onChange={(e) => setEditingMode(e.target.value as 'light' | 'dark')}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <p className="muted">
            Preview follows the current appearance mode. Tune both variants; saved canvas/card
            colors stay unchanged.
          </p>
          <div className="palette-color-grid">
            {Object.entries(colorRoles).map(([key, label]) => {
              const role = key as keyof PaletteColors;
              return (
                <PaletteColorField
                  key={`${draft.id}-${editingMode}-${role}-${resetRevision}`}
                  label={label}
                  value={draft[editingMode][role]}
                  onChange={(color) =>
                    update({ ...draft, [editingMode]: { ...draft[editingMode], [role]: color } })
                  }
                  onReset={() => {
                    if (baseline)
                      update({
                        ...draft,
                        [editingMode]: {
                          ...draft[editingMode],
                          [role]: baseline[editingMode][role],
                        },
                      });
                  }}
                />
              );
            })}
          </div>
          {warnings.length > 0 && (
            <p role="status" className="palette-contrast-warning">
              Low contrast: {warnings.join('; ')}. Adjust these pairs before relying on this
              palette.
            </p>
          )}
          <div className="provider-actions">
            <button type="submit" className="primary">
              Save palette
            </button>
            <button type="button" onClick={cancel}>
              Cancel customization
            </button>
            <button
              type="button"
              onClick={() => {
                if (baseline) {
                  setResetRevision((revision) => revision + 1);
                  update({
                    ...draft,
                    light: structuredClone(baseline.light),
                    dark: structuredClone(baseline.dark),
                  });
                }
              }}
            >
              Reset colors
            </button>
          </div>
        </form>
      )}
      {(error || feedback) && <p role={error ? 'alert' : 'status'}>{error || feedback}</p>}
    </section>
  );
}
