import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { providerDefinitions, type ProviderId, type PublicProvider } from '../providers';
import { validModelId } from '../modelCatalog';
import { ProviderIcon } from './ProviderIcon';
import { useIsPresent, useMotionPresence } from './Motion';
import { motion } from '../motion';
export type ModelOption = { provider: ProviderId; model: string; section: string };

export function ModelDropdown({
  value,
  options,
  providers,
  disabled,
  label = 'Select model',
  className = '',
  failed = false,
  onSelect,
  onAdd,
  footer,
  controlId,
}: {
  value: { provider: ProviderId; model: string };
  options: ModelOption[];
  providers: PublicProvider[];
  disabled?: boolean;
  label?: string;
  className?: string;
  failed?: boolean;
  onSelect: (provider: ProviderId, model: string) => boolean;
  onAdd: (provider: ProviderId, model: string) => boolean;
  footer?: ReactNode;
  controlId?: string;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [adding, setAdding] = useState(false);
  const [exact, setExact] = useState(''),
    [customProvider, setCustomProvider] = useState(value.provider),
    [active, setActive] = useState(0);
  const parentPresent = useIsPresent();
  const visible = open && parentPresent && !disabled;
  const rendered = useMotionPresence(visible, motion.duration.menu);
  const trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const filtered = options.filter((o) =>
    `${providerDefinitions[o.provider].name} ${o.model}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const index = Math.min(active, Math.max(0, filtered.length - 1));
  const custom = providers.some((p) => p.id === customProvider) ? customProvider : providers[0]?.id;
  const close = (restore = true) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  };
  const choose = (p: ProviderId, m: string) => {
    if (!disabled && onSelect(p, m)) close();
  };
  const position = useCallback(() => {
    if (!trigger.current || !menu.current) return;
    const viewport = window.visualViewport,
      height = viewport?.height ?? innerHeight,
      start = viewport?.offsetTop ?? 0;
    menu.current.style.maxHeight = `${Math.max(80, Math.min(460, height - 20))}px`;
    const r = trigger.current.getBoundingClientRect(),
      popup = { width: menu.current.offsetWidth, height: menu.current.offsetHeight };
    const below = r.bottom + 8,
      top = below + popup.height <= start + height - 12 ? below : r.top - popup.height - 8;
    menu.current.style.left = `${Math.max(8, Math.min(r.left, innerWidth - popup.width - 8))}px`;
    menu.current.style.top = `${Math.max(start + 8, Math.min(top, start + height - popup.height - 12))}px`;
  }, []);
  useLayoutEffect(() => {
    if (visible) position();
  }, [visible, query, adding, options, position]);
  useEffect(() => {
    if (!visible) return;
    menu.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus();
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node))
        setOpen(false);
    };
    const observer = new ResizeObserver(position);
    if (trigger.current) observer.observe(trigger.current);
    if (menu.current) observer.observe(menu.current);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [visible, position]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (visible && !adding)
      document.getElementById(`${uid}-option-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [visible, adding, index, uid, query]);
  return (
    <>
      <button
        id={controlId}
        ref={trigger}
        type="button"
        className={`model-selector nodrag nowheel ${className}`}
        aria-label={`${label}: ${providerDefinitions[value.provider].name} / ${value.model || 'Choose model'}`}
        aria-haspopup="dialog"
        aria-expanded={visible}
        disabled={disabled}
        title={`${providerDefinitions[value.provider].name} / ${value.model}`}
        onClick={() => {
          setQuery('');
          setAdding(false);
          setCustomProvider(value.provider);
          setActive(0);
          setOpen(!open);
        }}
      >
        <span
          className={`model-status ${failed ? 'failed' : !providers.some((p) => p.id === value.provider && p.configured) ? 'unconfigured' : ''}`}
        />
        <ProviderIcon provider={value.provider} />
        <span className="model-selector-text">{value.model || 'Choose model'}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {rendered &&
        createPortal(
          <div
            ref={menu}
            data-model-dropdown={visible ? '' : undefined}
            data-motion-state={visible ? 'open' : 'closing'}
            inert={!visible}
            aria-hidden={!visible}
            className="model-menu nodrag nowheel"
            role={visible ? 'dialog' : undefined}
            aria-label="Model selector"
            onBlur={(e) => {
              if (
                e.relatedTarget &&
                !e.currentTarget.contains(e.relatedTarget as Node) &&
                e.relatedTarget !== trigger.current
              )
                close(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
              }
            }}
          >
            {!adding && (
              <input
                role="combobox"
                aria-label="Search models"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={`${uid}-list`}
                aria-activedescendant={filtered.length ? `${uid}-option-${index}` : undefined}
                value={query}
                placeholder={providers.length ? 'Search models…' : 'No providers connected'}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || adding) return;
                  if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
                    e.preventDefault();
                    setActive(
                      (index + (e.key === 'ArrowDown' ? 1 : -1) + filtered.length) %
                        Math.max(1, filtered.length),
                    );
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const option = filtered[index];
                    if (option) choose(option.provider, option.model);
                  }
                  if (e.key === 'Home' || e.key === 'End') {
                    e.preventDefault();
                    setActive(e.key === 'Home' ? 0 : Math.max(0, filtered.length - 1));
                  }
                }}
              />
            )}
            {!adding && (
              <div
                id={`${uid}-list`}
                role="listbox"
                aria-label="Available models"
                className="model-options"
              >
                {!filtered.length && (
                  <p role="status">
                    {providers.length
                      ? 'No matching latest-generation models. Add an exact ID below.'
                      : 'Connect a provider in Settings to choose a model.'}
                  </p>
                )}
                {filtered.map((o, i) => (
                  <div key={`${o.provider}:${o.model}`}>
                    {(i === 0 || filtered[i - 1].section !== o.section) && (
                      <div className="model-section-label" aria-hidden="true">
                        {o.section}
                      </div>
                    )}
                    <button
                      id={`${uid}-option-${i}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-label={`${o.model} · ${providerDefinitions[o.provider].name}`}
                      aria-selected={o.provider === value.provider && o.model === value.model}
                      data-active={i === index}
                      title={`${providerDefinitions[o.provider].name} / ${o.model}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerMove={() => setActive(i)}
                      onClick={() => choose(o.provider, o.model)}
                    >
                      <ProviderIcon provider={o.provider} />
                      <span className="model-option-label">
                        <span>{o.model}</span>
                      </span>
                      {o.provider === value.provider && o.model === value.model && (
                        <Check size={15} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {adding && (
              <div className="custom-model-entry">
                <label htmlFor={`${uid}-provider`}>Provider</label>
                <select
                  id={`${uid}-provider`}
                  aria-label="Custom model provider"
                  value={custom}
                  onChange={(e) => setCustomProvider(e.target.value as ProviderId)}
                >
                  {providers.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <label htmlFor={`${uid}-exact`}>Exact model ID</label>
                <input
                  id={`${uid}-exact`}
                  aria-label="Exact model ID"
                  maxLength={512}
                  value={exact}
                  onChange={(e) => setExact(e.target.value)}
                  placeholder="provider/model-version"
                />
                <p className="model-list-note">
                  Availability is checked only when you explicitly send or test. Adding an ID makes
                  no AI request.
                </p>
                <button
                  type="button"
                  disabled={!custom || !validModelId(exact.trim()) || disabled}
                  onClick={() => {
                    if (custom && onAdd(custom, exact.trim())) close();
                  }}
                >
                  Use custom model
                </button>
              </div>
            )}
            <div
              className="model-menu-footer"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('[data-close-model-dropdown]')) close(false);
              }}
            >
              <button
                type="button"
                disabled={!providers.length}
                onClick={() => {
                  setExact(query);
                  setAdding(!adding);
                  requestAnimationFrame(() =>
                    menu.current
                      ?.querySelector<HTMLInputElement>(
                        adding ? '[role="combobox"]' : '[aria-label="Exact model ID"]',
                      )
                      ?.focus(),
                  );
                }}
              >
                {adding ? 'Back to model list' : 'Add model by ID…'}
              </button>
              {footer}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
