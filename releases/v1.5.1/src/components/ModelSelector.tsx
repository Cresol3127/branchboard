import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import type { NodeData } from '../types';
import { type ProviderId, providerDefinitions } from '../providers';
import { modelDiscoveryLabel } from '../modelDiscovery';

export function ModelSelector({
  id,
  data,
  streaming,
}: {
  id: string;
  data: NodeData;
  streaming: boolean;
}) {
  const providers = useStore((s) => s.providers);
  const discovery = useStore((s) => s.modelDiscovery);
  const boards = useStore((s) => s.boards);
  const defaultModel = useStore((s) => s.model);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customProvider, setCustomProvider] = useState<ProviderId>(data.provider || 'openai');
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const provider = data.provider || 'openai';
  const model = data.model || defaultModel;
  const selected = providers.find((p) => p.id === provider);
  const exactId = query.trim();
  const validId = Boolean(exactId && exactId.length <= 512 && !/[\r\n]/.test(exactId));
  const groups = providers.flatMap((p) => {
    if (!open) return [];
    const savedModels = boards.flatMap((b) =>
      b.nodes.flatMap((n) =>
        n.type === 'chat' && (n.data.provider || 'openai') === p.id && n.data.model
          ? [n.data.model]
          : [],
      ),
    );
    const allModels = [
      ...new Set([...p.models, ...savedModels, ...(p.id === provider ? [model] : [])]),
    ];
    const models = allModels.filter((m) =>
      `${p.name} ${m}`.toLowerCase().includes(query.toLowerCase()),
    );
    return models.length || !query || p.name.toLowerCase().includes(query.toLowerCase())
      ? [{ ...p, models }]
      : [];
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
  }, [open, query, providers, discovery, positionMenu]);
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
    if (
      state.streaming[id] ||
      !state.boards.find((b) => b.id === state.currentId)?.nodes.some((n) => n.id === id)
    )
      return;
    state.updateNode(id, { provider, model, error: undefined }, true);
    close();
    if (!state.providers.find((p) => p.id === provider)?.configured)
      useStore.setState({ settingsOpen: true, settingsProvider: provider });
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="model-selector nodrag nowheel"
        aria-label={`Select model: ${selected?.name || provider} / ${model}`}
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
              placeholder="Search models or enter an exact ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <div className="custom-model-entry">
                <label htmlFor={`custom-provider-${id}`}>Exact ID for</label>
                <select
                  id={`custom-provider-${id}`}
                  aria-label="Custom model provider"
                  value={customProvider}
                  onChange={(e) => setCustomProvider(e.target.value as ProviderId)}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!validId || streaming}
                  title={`Use ${exactId} with ${providerDefinitions[customProvider].name}; availability is checked when sending`}
                  onClick={() => choose(customProvider, exactId)}
                >
                  Use custom model
                </button>
                <small>Uses the exact ID you typed, even if it is not listed.</small>
              </div>
            )}
            <div role="listbox" aria-label="Available models" className="model-options">
              {!groups.length && <p role="status">No matching providers or models.</p>}
              {groups.map((p) => {
                const models = p.models;
                return (
                  <div key={p.id} role="group" aria-label={p.name}>
                    <strong>
                      {p.name}
                      <span>{!p.configured ? 'Setup required' : ''}</span>
                    </strong>
                    {p.configured && (
                      <div className="model-discovery-row">
                        <span className="model-discovery-status" title={discovery[p.id]?.error}>
                          {modelDiscoveryLabel(discovery[p.id])}
                        </span>
                        <button
                          type="button"
                          aria-label={`Refresh ${p.name} models`}
                          disabled={discovery[p.id]?.loading}
                          onClick={() =>
                            void useStore
                              .getState()
                              .refreshModels(p.id)
                              .catch(() => {})
                          }
                        >
                          <RefreshCw size={12} aria-hidden="true" /> Refresh
                        </button>
                        {discovery[p.id]?.error && <small>{discovery[p.id]?.error}</small>}
                      </div>
                    )}
                    <button
                      type="button"
                      className="model-setup-link"
                      data-configure
                      aria-label={`Setup guide for ${p.name} models`}
                      onClick={() => {
                        setOpen(false);
                        useStore.setState({ settingsOpen: true, settingsProvider: p.id });
                      }}
                    >
                      {p.id === 'ollama' ? 'Local setup instructions' : 'How to get an API key'}
                    </button>
                    {!models.length && (
                      <button
                        type="button"
                        data-configure
                        onClick={() => {
                          setOpen(false);
                          useStore.setState({ settingsOpen: true, settingsProvider: p.id });
                        }}
                      >
                        Configure {p.name}
                      </button>
                    )}
                    {models.map((m) => {
                      const unavailable = !p.configured;
                      return (
                        <button
                          key={m}
                          type="button"
                          role="option"
                          aria-selected={p.id === provider && m === model}
                          title={unavailable ? `Select ${m} and set up ${p.name}` : m}
                          onClick={() => {
                            choose(p.id, m);
                          }}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <p className="model-list-note">
              Saved/default IDs are also shown. The provider decides availability when sending.
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setOpen(false);
                useStore.setState({ settingsOpen: true, settingsProvider: provider });
              }}
            >
              Provider settings
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
