import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useStore } from '../store';
import { Modal } from './ui';
import { useWorkspacePanels } from '../workspacePanels';
import { ModelTest } from './ModelTest';
import type { ProviderId, PublicProvider } from '../providers';
type Theme = 'light' | 'dark' | 'system';
import { ProviderSetup } from './ProviderSetup';
import { modelDiscoveryLabel } from '../modelDiscovery';
import {
  catalogLabel,
  catalogModelChoices,
  catalogSources,
  hasPublicCatalog,
} from '../modelCatalog';

export function Settings({
  theme,
  onThemeChange,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const providers = useStore((s) => s.providers);
  const provider = useStore((s) => s.settingsProvider);
  const selected = providers.find((p) => p.id === provider);
  const section = useStore((s) => s.settingsSection);
  return (
    <Modal
      title={section === 'models' ? 'Models' : 'Settings'}
      kind={section === 'models' ? 'models' : 'settings'}
      className="settings-dialog"
      onClose={() => useStore.setState({ settingsOpen: false })}
    >
      <div
        className="help-tabs"
        role="tablist"
        aria-label="Workspace settings"
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const next =
            e.key === 'Home'
              ? 'models'
              : e.key === 'End'
                ? 'workspace'
                : section === 'models'
                  ? 'workspace'
                  : 'models';
          useWorkspacePanels.getState().navigate(() => {
            useStore.setState({ settingsSection: next });
            requestAnimationFrame(() => document.getElementById(`settings-tab-${next}`)?.focus());
          });
        }}
      >
        {(['models', 'workspace'] as const).map((id) => (
          <button
            type="button"
            role="tab"
            key={id}
            id={`settings-tab-${id}`}
            aria-controls={`settings-panel-${id}`}
            aria-selected={section === id}
            tabIndex={section === id ? 0 : -1}
            onClick={() =>
              useWorkspacePanels
                .getState()
                .navigate(() => useStore.setState({ settingsSection: id }))
            }
          >
            {id === 'models' ? 'Models' : 'Workspace'}
          </button>
        ))}
      </div>
      <div
        className="dialog-body"
        role="tabpanel"
        id={`settings-panel-${section}`}
        aria-labelledby={`settings-tab-${section}`}
      >
        {section === 'workspace' ? (
          <section>
            <h3>Appearance</h3>
            <label>
              Color theme
              <select
                aria-label="Color theme"
                value={theme}
                onChange={(e) => onThemeChange(e.target.value as Theme)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <p className="muted">
              Canvases stay in this browser. Use Backups before changing browser or origin.
            </p>
          </section>
        ) : (
          <>
            <p className="dialog-subtitle">Choose your AI provider. Keys stay on this server.</p>
            <label htmlFor="settings-provider">Provider</label>
            <select
              id="settings-provider"
              value={provider}
              onChange={(e) => {
                const id = e.target.value as ProviderId;
                useWorkspacePanels
                  .getState()
                  .navigate(() => useStore.setState({ settingsProvider: id }));
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {selected && <ProviderSettings key={provider} provider={selected} />}
            {!selected && (
              <p role="status">
                Provider settings are unavailable. Check that the local API server is running.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ProviderSettings({ provider }: { provider: PublicProvider }) {
  const discovery = useStore((s) => s.modelDiscovery[provider.id]);
  const catalog = useStore((s) => s.modelCatalog);
  const publicCatalog = hasPublicCatalog(provider.id);
  const choices = catalogModelChoices(provider, catalog, discovery);
  const [key, setKey] = useState('');
  const [baseURL, setBaseURL] = useState(provider.baseURL);
  const [model, setModel] = useState(provider.defaultModel);
  const [models, setModels] = useState(provider.extraModels.join('\n'));
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const local = provider.id === 'ollama';
  const custom = provider.id === 'custom';
  const report = (err: unknown) =>
    setError(err instanceof Error ? err.message : 'Unable to save settings.');
  const save = async (removeKey = false) => {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.id,
          ...(removeKey ? { apiKey: '' } : key.trim() ? { apiKey: key } : {}),
          ...(local || custom ? { baseURL } : {}),
          model,
          models: models
            .split('\n')
            .map((m) => m.trim())
            .filter(Boolean),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save settings.');
      useStore.getState().applyConfig(result, provider.id);
      setKey('');
      setStatus(removeKey ? 'API key removed.' : 'Settings saved.');
      if (!removeKey && local) {
        try {
          await useStore.getState().refreshModels(provider.id);
        } catch (err) {
          setError(
            `Settings saved. Model discovery failed; saved/static models remain available. ${err instanceof Error ? err.message : ''}`,
          );
        }
      }
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="provider-settings"
      data-dirty={Boolean(
        key ||
        baseURL !== provider.baseURL ||
        model !== provider.defaultModel ||
        models !== provider.extraModels.join('\n'),
      )}
      aria-busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="provider-state">
        {provider.configured
          ? local
            ? 'Local endpoint configured'
            : 'API key saved'
          : 'Not connected'}
      </p>
      {local ? (
        <p className="muted">No API key needed. Use an installed local model.</p>
      ) : (
        <>
          <label htmlFor="api-key">API key</label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            value={key}
            required={!provider.hasKey}
            placeholder={provider.hasKey ? 'Saved key — leave blank to keep' : 'Enter API key'}
            onChange={(e) => setKey(e.target.value)}
            disabled={busy}
            maxLength={512}
          />
        </>
      )}
      {(local || custom) && (
        <>
          <label htmlFor="provider-base-url">Base URL</label>
          <input
            id="provider-base-url"
            type="url"
            required
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            disabled={busy}
            placeholder={local ? 'http://localhost:11434' : 'https://your-provider.example/v1'}
          />
          {custom && (
            <p className="muted">
              OpenAI-compatible API root, including /v1 if needed (not /chat/completions).
            </p>
          )}
        </>
      )}
      <label htmlFor="provider-model">{custom ? 'Model name' : 'Default model'}</label>
      <input
        id="provider-model"
        list={`provider-model-options-${provider.id}`}
        value={model}
        onChange={(e) => setModel(e.target.value)}
        required={custom}
        disabled={busy}
        maxLength={512}
      />
      <datalist id={`provider-model-options-${provider.id}`}>
        {choices.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
      <ModelTest
        provider={provider.id}
        model={model}
        savedSettings={JSON.stringify(provider)}
        disabled={
          busy || !provider.configured || Boolean(key.trim()) || baseURL !== provider.baseURL
        }
      />
      <div className="provider-actions essential-actions">
        <button className="primary" disabled={busy}>
          {busy ? 'Working…' : 'Save settings'}
        </button>
        {!local && provider.hasKey && (
          <button type="button" disabled={busy} onClick={() => void save(true)}>
            Remove API key
          </button>
        )}
      </div>
      {status && (
        <p role="status" className="settings-feedback">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="error settings-feedback">
          {error}
        </p>
      )}
      <details className="settings-details">
        <summary>Setup instructions</summary>
        <ProviderSetup id={provider.id} />
      </details>
      <details className="settings-details">
        <summary>Models & advanced options</summary>
        <label htmlFor="provider-models">Additional models (one per line)</label>
        <textarea
          id="provider-models"
          rows={3}
          value={models}
          onChange={(e) => setModels(e.target.value)}
          disabled={busy}
        />
        <p className="muted">
          Catalogs update every 15 minutes without using keys. Only connected providers appear in
          the picker. Public listings do not guarantee account access or adapter compatibility.
        </p>
        <div className="provider-actions">
          {publicCatalog && (
            <button
              type="button"
              disabled={catalog.loading}
              onClick={() =>
                void useStore
                  .getState()
                  .refreshModelCatalog(true)
                  .catch(() => {})
              }
            >
              {catalog.loading ? 'Checking…' : 'Check for updates'}
            </button>
          )}
          {local && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!baseURL.trim()) {
                  setError('Enter an Ollama base URL before testing the connection.');
                  return;
                }
                setBusy(true);
                setError('');
                setStatus('');
                try {
                  const response = await fetch('/api/providers/ollama/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ baseURL }),
                  });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error);
                  setStatus(
                    `Connected to Ollama. ${result.models.length} installed model(s). Save settings to use this URL.`,
                  );
                } catch (err) {
                  report(err);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Test Connection
            </button>
          )}
          {provider.configured && (
            <button
              type="button"
              disabled={busy || discovery?.loading}
              onClick={async () => {
                setBusy(true);
                setError('');
                setStatus('');
                try {
                  await useStore.getState().refreshModels(provider.id);
                  setStatus('Model list refreshed from saved provider settings.');
                } catch (err) {
                  report(err);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {local ? 'Refresh models' : 'Fetch from saved API key'}
            </button>
          )}
        </div>
        {provider.configured && (
          <p className="connected">
            <CheckCircle2 size={16} /> {local ? 'Local endpoint configured' : 'API key saved'} ·{' '}
            {choices.length} model(s)
          </p>
        )}
        {publicCatalog && hasPublicCatalog(provider.id) && (
          <div className="muted model-discovery-status">
            <p>{catalogLabel(catalog, provider.id)}</p>
            {catalog.providers[provider.id] && (
              <a
                href={catalogSources[catalog.providers[provider.id]!.source].url}
                target="_blank"
                rel="noreferrer"
              >
                View public source
              </a>
            )}
            {(catalog.error || catalog.errors?.[provider.id]) && (
              <p>{catalog.error || catalog.errors?.[provider.id]}</p>
            )}
            {catalog.cacheError && <p>{catalog.cacheError}</p>}
          </div>
        )}
        {provider.configured && (
          <p className="muted model-discovery-status" title={discovery?.error}>
            {local || discovery?.checkedAt !== undefined
              ? modelDiscoveryLabel(discovery)
              : 'Saved-key listing is optional; public updates do not use your key.'}
            {discovery?.error && <> · {discovery.error}</>}
          </p>
        )}
      </details>
    </form>
  );
}

export function Help({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'start' | 'shortcuts'>('start');
  const [query, setQuery] = useState('');
  const groups = [
    {
      title: 'Navigation',
      items: [
        ['Ctrl / ⌘ K', 'Search nodes and commands'],
        ['Drag canvas', 'Pan the canvas'],
        ['Space + drag', 'Pan over cards'],
        ['/', 'Focus message composer'],
      ],
    },
    {
      title: 'Canvas',
      items: [
        ['Double-click canvas', 'Quick creation menu'],
        ['Ctrl / ⌘ + drag canvas', 'Draw a selection rectangle'],
        ['Shift + click', 'Add or remove a selected node'],
        ['Ctrl / ⌘ D', 'Duplicate selection'],
        ['Ctrl / ⌘ C / V', 'Copy / paste nodes within Branchboard'],
        ['Ctrl / ⌘ Z', 'Undo'],
        ['Ctrl / ⌘ Shift Z', 'Redo'],
        ['Delete / Backspace', 'Delete selection'],
        ['G', 'Toggle grid and snapping'],
        ['Alt + drag a port', 'Move its connection point'],
      ],
    },
    {
      title: 'Writing',
      items: [
        ['T', 'Text selection mode (copy card text)'],
        ['Enter / Shift Enter', 'Send message / new line'],
      ],
    },
  ].map((group) => ({
    ...group,
    items: group.items.filter((item) => item.join(' ').toLowerCase().includes(query.toLowerCase())),
  }));
  return (
    <Modal title="Help" kind="help" className="help-dialog" onClose={onClose}>
      <div
        className="help-tabs"
        role="tablist"
        aria-label="Help sections"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 'start'
              : event.key === 'End'
                ? 'shortcuts'
                : tab === 'start'
                  ? 'shortcuts'
                  : 'start';
          setTab(next);
          document.getElementById(`help-tab-${next}`)?.focus();
        }}
      >
        {(['start', 'shortcuts'] as const).map((id) => (
          <button
            type="button"
            key={id}
            id={`help-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`help-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {id === 'start' ? 'Getting started' : 'Keyboard shortcuts'}
          </button>
        ))}
      </div>
      <div
        className="dialog-body"
        role="tabpanel"
        id={`help-panel-${tab}`}
        aria-labelledby={`help-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'start' ? (
          <div className="help-guide">
            <section>
              <span>01</span>
              <h3>Capture a thought</h3>
              <p>
                Add a conversation or note. Choose a connected model in the message bar, then write
                your first message.
              </p>
            </section>
            <section>
              <span>02</span>
              <h3>Connect your ideas</h3>
              <p>
                Drag an output dot onto an input to share upstream context. Drop it on empty canvas
                to branch. History is inherited, not copied.
              </p>
            </section>
            <section>
              <span>03</span>
              <h3>Make room to explore</h3>
              <p>
                Drag a card’s surface to move it. Use Focus conversation to read, Fit canvas for the
                overview. Touch-scroll inside content; drag a card’s quiet surface to move.
              </p>
            </section>
            <p className="muted">
              Canvases are saved in this browser. Export a workspace backup before changing browsers
              or origins.
            </p>
          </div>
        ) : (
          <>
            <input
              aria-label="Search shortcuts"
              placeholder="Find a shortcut…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {groups
              .filter((group) => group.items.length)
              .map((group) => (
                <section className="shortcut-group" key={group.title}>
                  <h3>{group.title}</h3>
                  <dl className="shortcuts">
                    {group.items.map(([key, description]) => (
                      <div key={key}>
                        <dt>{description}</dt>
                        <dd>
                          <kbd>{key}</kbd>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            {!groups.some((group) => group.items.length) && (
              <p role="status">No matching shortcuts.</p>
            )}
            <p className="muted">Canvas shortcuts are inactive while typing or using a dialog.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
