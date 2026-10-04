import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useStore } from '../store';
import type { NodeData } from '../types';

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
  const defaultModel = useStore((s) => s.model);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const provider = data.provider || 'openai';
  const model = data.model || defaultModel;
  const selected = providers.find((p) => p.id === provider);
  const groups = providers.flatMap((p) => {
    const allModels = [...new Set([...p.models, ...(p.id === provider ? [model] : [])])];
    const models = allModels.filter((m) =>
      `${p.name} ${m}`.toLowerCase().includes(query.toLowerCase()),
    );
    return models.length || !query || p.name.toLowerCase().includes(query.toLowerCase())
      ? [{ ...p, models }]
      : [];
  });
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const popup = menu.current.getBoundingClientRect();
    const below = rect.bottom + 8;
    const top =
      below + popup.height <= window.innerHeight - 8 ? below : rect.top - popup.height - 8;
    menu.current.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.width - 8))}px`;
    menu.current.style.top = `${Math.max(8, Math.min(top, window.innerHeight - popup.height - 8))}px`;
  }, [open, query, providers]);
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
    const reposition = () => setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);
  const rect = trigger.current?.getBoundingClientRect();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
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
                ['ArrowDown', 'ArrowUp'].includes(event.key) ||
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
                const items = [...menu.current!.querySelectorAll<HTMLElement>('input, button')];
                const index = items.indexOf(document.activeElement as HTMLElement);
                event.preventDefault();
                items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
              }
            }}
          >
            <input
              aria-label="Search models"
              placeholder="Search providers and models…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
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
                            useStore
                              .getState()
                              .updateNode(id, { provider: p.id, model: m, error: undefined }, true);
                            close();
                            if (unavailable)
                              useStore.setState({ settingsOpen: true, settingsProvider: p.id });
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
