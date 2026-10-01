import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import type { NodeData } from '../types';
import { type ProviderId, providerDefinitions } from '../providers';
import { catalogModelChoices, validModelId } from '../modelCatalog';
import { selectableProviders } from '../modelPreferences';

export function ModelSelector({
  id,
  data,
  streaming,
  onSelect,
  className = '',
  label = 'Select model',
}: {
  id: string;
  data: Pick<NodeData, 'provider' | 'model' | 'error'>;
  streaming: boolean;
  onSelect?: (provider: ProviderId, model: string) => boolean;
  className?: string;
  label?: string;
}) {
  const providers = useStore((s) => s.providers);
  const discovery = useStore((s) => s.modelDiscovery);
  const catalog = useStore((s) => s.modelCatalog);
  const boards = useStore((s) => s.boards);
  const defaultModel = useStore((s) => s.model);
  const preferences = useStore((s) => s.modelPreferences);
  const preferenceError = useStore((s) => s.modelPreferenceError);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customProvider, setCustomProvider] = useState<ProviderId>(data.provider || 'openai');
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const provider = data.provider || 'openai';
  const model = data.model || defaultModel;
  const selected = providers.find((p) => p.id === provider);
  const exactId = query.trim();
  const validId = validModelId(exactId);
  const available = selectableProviders(providers, discovery);
  const exactProvider = available.some((p) => p.id === customProvider)
    ? customProvider
    : available[0]?.id;
  const recent = preferences.recent.filter(
    (choice) =>
      available.some((p) => p.id === choice.provider) &&
      `${providerDefinitions[choice.provider].name} ${choice.model}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const groups = available.flatMap((p) => {
    if (!open) return [];
    const savedModels = boards.flatMap((b) =>
      b.nodes.flatMap((n) =>
        n.type === 'chat' && (n.data.provider || 'openai') === p.id && n.data.model
          ? [n.data.model]
          : [],
      ),
    );
    const allModels = [
      ...new Set([
        ...catalogModelChoices(p, catalog, discovery[p.id]),
        ...savedModels,
        ...preferences.recent.filter((c) => c.provider === p.id).map((c) => c.model),
        ...(p.id === provider ? [model] : []),
      ]),
    ];
    const models = allModels.filter(
      (m) =>
        `${p.name} ${m}`.toLowerCase().includes(query.toLowerCase()) &&
        !recent.some((c) => c.provider === p.id && c.model === m),
    );
    return models.length ? [{ ...p, models }] : [];
  });
  const positionMenu = useCallback(() => {
    if (!menu.current || !trigger.current) return;
    const viewport = window.visualViewport;
    const height = viewport?.height ?? window.innerHeight;
    const start = viewport?.offsetTop ?? 0;
    // Mobile keyboards resize the visible viewport. Reposition instead of closing
    // the very input the user has just focused.
    menu.current.style.maxHeight = `${Math.max(80, Math.min(410, height - 16))}px`;
    const rect = trigger.current.getBoundingClientRect();
    const popup = menu.current.getBoundingClientRect();
    const below = rect.bottom + 8;
    const top = below + popup.height <= start + height - 8 ? below : rect.top - popup.height - 8;
    menu.current.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.width - 8))}px`;
    menu.current.style.top = `${Math.max(start + 8, Math.min(top, start + height - popup.height - 8))}px`;
  }, []);
  useLayoutEffect(() => {
    if (open) positionMenu();
  }, [open, query, providers, discovery, catalog, preferences, positionMenu]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('input')?.focus();
    const close = (event: globalThis.PointerEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('resize', positionMenu);
    window.visualViewport?.addEventListener('resize', positionMenu);
    window.visualViewport?.addEventListener('scroll', positionMenu);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', positionMenu);
      window.visualViewport?.removeEventListener('resize', positionMenu);
      window.visualViewport?.removeEventListener('scroll', positionMenu);
    };
  }, [open, positionMenu]);
  const rect = trigger.current?.getBoundingClientRect();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (provider: ProviderId, model: string) => {
    const state = useStore.getState();
    // A refresh must never change routing, and neither may a stale, streaming popup.
    if (!selectableProviders(state.providers, state.modelDiscovery).some((p) => p.id === provider))
      return;
    if (onSelect) {
      if (!onSelect(provider, model)) return;
    } else {
      if (
        state.streaming[id] ||
        !state.boards.find((b) => b.id === state.currentId)?.nodes.some((n) => n.id === id)
      )
        return;
      state.updateNode(id, { provider, model, error: undefined }, true);
      state.rememberModel({ provider, model });
    }
    close();
  };
  const option = (providerId: ProviderId, modelId: string, showProvider = false) => (
    <button
      key={`${providerId}:${modelId}`}
      type="button"
      role="option"
      aria-label={modelId}
      aria-selected={providerId === provider && modelId === model}
      title={`${providerDefinitions[providerId].name} / ${modelId}`}
      onClick={() => choose(providerId, modelId)}
    >
      <span className="model-option-label">
        <span>{modelId}</span>
        {showProvider && <small>{providerDefinitions[providerId].name}</small>}
      </span>
      {providerId === provider && modelId === model && <Check size={15} aria-hidden="true" />}
    </button>
  );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`model-selector nodrag nowheel ${className}`}
        aria-label={`${label}: ${selected?.name || provider} / ${model}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={streaming}
        title={
          streaming
            ? 'Stop generation before changing the model'
            : `${selected?.name || provider} / ${model}`
        }
        onClick={() => {
          setQuery('');
          setCustomProvider(provider);
          setOpen(!open);
        }}
      >
        <span
          className={`model-status ${data.error ? 'failed' : !selected?.configured ? 'unconfigured' : ''}`}
        />
        <span className="model-selector-text">
          {selected?.name || 'OpenAI'} · {model}
        </span>
        <ChevronDown size={12} />
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={menu}
            className="model-menu nodrag nowheel"
            role="dialog"
            aria-label="Model selector"
            style={{
              left: Math.max(8, Math.min(rect.left, window.innerWidth - 352)),
              top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 420)),
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                close();
              }
              if (
                (!(event.target instanceof HTMLSelectElement) &&
                  ['ArrowDown', 'ArrowUp'].includes(event.key)) ||
                (event.target instanceof HTMLButtonElement && ['Home', 'End'].includes(event.key))
              ) {
                event.preventDefault();
                const options = [
                  ...menu.current!.querySelectorAll<HTMLButtonElement>(
                    '[role="option"], [data-configure]',
                  ),
                ];
                const index = options.indexOf(document.activeElement as HTMLButtonElement);
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? options.length - 1
                      : event.key === 'ArrowDown'
                        ? (index + 1) % options.length
                        : (index - 1 + options.length) % options.length;
                options[next]?.focus();
              }
              if (event.key === 'Tab') {
                const items = [
                  ...menu.current!.querySelectorAll<HTMLElement>(
                    'input, select, button:not(:disabled)',
                  ),
                ];
                const index = items.indexOf(document.activeElement as HTMLElement);
                event.preventDefault();
                items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
              }
            }}
          >
            <input
              aria-label="Search models"
              placeholder={available.length ? 'Search models…' : 'No providers connected'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && validId && exactProvider && !groups.length && !recent.length && (
              <div className="custom-model-entry">
                <label htmlFor={`custom-provider-${id}`}>Exact ID for</label>
                <select
                  id={`custom-provider-${id}`}
                  aria-label="Custom model provider"
                  value={exactProvider}
                  onChange={(e) => setCustomProvider(e.target.value as ProviderId)}
                >
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!validId || streaming}
                  title={`Use ${exactId} with ${providerDefinitions[exactProvider].name}; availability is checked when sending`}
                  onClick={() => choose(exactProvider, exactId)}
                >
                  Use custom model
                </button>
              </div>
            )}
            <div role="listbox" aria-label="Available models" className="model-options">
              {!available.length && (
                <p role="status">Connect a provider in Settings to choose a model.</p>
              )}
              {available.length > 0 && !groups.length && !recent.length && (
                <p role="status">No matching models.</p>
              )}
              {recent.length > 0 && (
                <div role="group" aria-label="Recent models">
                  <strong>Recent</strong>
                  {recent.map((choice) => option(choice.provider, choice.model, true))}
                </div>
              )}
              {groups.map((p) => {
                const models = p.models;
                return (
                  <div key={p.id} role="group" aria-label={p.name}>
                    <strong>{p.name}</strong>
                    {models.map((m) => option(p.id, m))}
                  </div>
                );
              })}
            </div>
            {(preferenceError || catalog.error || catalog.cacheError) && (
              <p className="model-list-note" role="status">
                {preferenceError || catalog.error || catalog.cacheError}
              </p>
            )}
            <div className="model-menu-footer">
              <button
                type="button"
                aria-label="Check for updates"
                title="Update public model catalogs without using API keys"
                disabled={catalog.loading}
                onClick={() =>
                  void useStore
                    .getState()
                    .refreshModelCatalog(true)
                    .catch(() => {})
                }
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setOpen(false);
                  useStore.setState({ settingsOpen: true, settingsProvider: provider });
                }}
              >
                Manage providers
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
