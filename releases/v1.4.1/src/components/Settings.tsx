import { useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { useStore } from '../store';
import { Modal } from './ui';
import type { ProviderId, PublicProvider } from '../providers';
import { ProviderSetup } from './ProviderSetup';

export function Settings() {
  const providers = useStore((s) => s.providers);
  const provider = useStore((s) => s.settingsProvider);
  const selected = providers.find((p) => p.id === provider);
  return (
    <Modal title="Settings" onClose={() => useStore.setState({ settingsOpen: false })}>
      <div className="settings-intro">
        <KeyRound size={24} />
        <h3>Connect your AI provider</h3>
        <p>
          Use a cloud provider or local Ollama. Keys stay in branchboard.providers.json on this
          server, never in your canvas or browser storage.
        </p>
      </div>
      <label htmlFor="settings-provider">Provider</label>
      <select
        id="settings-provider"
        value={provider}
        onChange={(e) => useStore.setState({ settingsProvider: e.target.value as ProviderId })}
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
      <button className="text-button" onClick={() => useStore.setState({ settingsOpen: false })}>
        Back to canvas
      </button>
    </Modal>
  );
}

function ProviderSettings({ provider }: { provider: PublicProvider }) {
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
      useStore.getState().applyConfig(result);
      setKey('');
      setStatus(removeKey ? 'API key removed.' : 'Settings saved.');
      if (!removeKey) {
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
      aria-busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <ProviderSetup id={provider.id} />
      {local ? (
        <p className="muted">
          No API key needed. Start Ollama and install a model with <code>ollama pull llama3.2</code>
          .
        </p>
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
        value={model}
        onChange={(e) => setModel(e.target.value)}
        required={custom}
        disabled={busy}
        maxLength={512}
      />
      <label htmlFor="provider-models">Additional models (one per line)</label>
      <textarea
        id="provider-models"
        rows={3}
        value={models}
        onChange={(e) => setModels(e.target.value)}
        disabled={busy}
      />
      <p className="muted">
        Models load from your provider. Add extra model IDs here. Providers never switch
        automatically.
      </p>
      <div className="provider-actions">
        <button className="primary" disabled={busy}>
          {busy ? 'Working…' : 'Save settings'}
        </button>
        {!local && provider.hasKey && (
          <button type="button" disabled={busy} onClick={() => void save(true)}>
            Remove API key
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
            disabled={busy}
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
            Refresh models
          </button>
        )}
      </div>
      {provider.configured && (
        <p className="connected">
          <CheckCircle2 size={16} /> {local ? 'Local endpoint configured' : 'API key saved'} ·{' '}
          {provider.models.length} model(s)
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}

export function Help({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts & help" onClose={onClose}>
      <p>A canvas for conversations that don’t have to follow a straight line.</p>
      <dl className="shortcuts">
        {[
          ['Ctrl / ⌘ K', 'Search nodes and commands'],
          ['Double-click canvas', 'Create a conversation'],
          ['Space + drag', 'Pan the canvas'],
          ['Shift + click / drag', 'Select multiple nodes'],
          ['Ctrl / ⌘ D', 'Duplicate selection'],
          ['Ctrl / ⌘ G', 'Group selection'],
          ['Ctrl / ⌘ Z', 'Undo'],
          ['Ctrl / ⌘ Shift Z', 'Redo'],
          ['Delete / Backspace', 'Delete selection'],
          ['G', 'Toggle grid and snapping'],
          ['Alt + drag a port', 'Move its connection point'],
          ['Enter / Shift Enter', 'Send message / new line'],
        ].map(([key, description]) => (
          <div key={key}>
            <dt>{description}</dt>
            <dd>
              <kbd>{key}</kbd>
            </dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        Drag an output dot to an input dot to share upstream context. Branches inherit history; they
        don’t copy it. Select a node to edit or resize it. Right-click for more actions.
      </p>
    </Modal>
  );
}
