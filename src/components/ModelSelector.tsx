import { RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import type { NodeData } from '../types';
import type { ProviderId } from '../providers';
import { catalogModelChoices } from '../modelCatalog';
import { selectableProviders } from '../modelPreferences';
import { useAddedModels } from '../addedModels';
import { ModelDropdown, type ModelOption } from './ModelDropdown';
import { useWorkspacePanels } from '../workspacePanels';

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
  const providers = useStore((s) => s.providers),
    discovery = useStore((s) => s.modelDiscovery),
    catalog = useStore((s) => s.modelCatalog);
  const defaultModel = useStore((s) => s.model),
    preferences = useStore((s) => s.modelPreferences),
    preferenceError = useStore((s) => s.modelPreferenceError);
  const added = useAddedModels();
  const value = {
    provider: data.provider || ('openai' as ProviderId),
    model: data.model || defaultModel,
  };
  const available = selectableProviders(providers, discovery);
  const options: ModelOption[] = [];
  const include = (provider: ProviderId, model: string, section: string) => {
    if (
      model &&
      available.some((p) => p.id === provider) &&
      !options.some((o) => o.provider === provider && o.model === model)
    )
      options.push({ provider, model, section });
  };
  preferences.recent.forEach((c) => include(c.provider, c.model, 'Recent · saved choices'));
  available.forEach((p) =>
    catalogModelChoices(p, catalog, discovery[p.id]).forEach((m) =>
      include(p.id, m, p.id === 'ollama' ? 'Installed locally' : 'Latest generation'),
    ),
  );
  available.forEach((p) =>
    [
      ...p.extraModels,
      ...added.models.filter((c) => c.provider === p.id).map((c) => c.model),
    ].forEach((m) => include(p.id, m, 'Added by ID')),
  );
  include(value.provider, value.model, 'Current · saved selection');
  const choose = (provider: ProviderId, model: string, saveAdded = false) => {
    const state = useStore.getState();
    if (
      streaming ||
      !selectableProviders(state.providers, state.modelDiscovery).some((p) => p.id === provider)
    )
      return false;
    if (
      !onSelect &&
      (state.streaming[id] ||
        !state.boards.find((b) => b.id === state.currentId)?.nodes.some((n) => n.id === id))
    )
      return false;
    if (saveAdded && !added.add({ provider, model })) return false;
    if (onSelect) return onSelect(provider, model);
    state.updateNode(id, { provider, model, error: undefined }, true);
    state.rememberModel({ provider, model });
    return true;
  };
  return (
    <ModelDropdown
      value={value}
      options={options}
      providers={available}
      disabled={streaming}
      label={label}
      className={className}
      failed={Boolean(data.error)}
      onSelect={choose}
      onAdd={(provider, model) => choose(provider, model, true)}
      footer={
        <>
          <button
            type="button"
            aria-label="Check for updates"
            title="Update public catalogs without API keys"
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
            data-close-model-dropdown
            onClick={() => {
              useStore.setState({
                modelsOpen: true,
                settingsProvider: value.provider,
              });
              requestAnimationFrame(() => useWorkspacePanels.getState().raiseKind('models'));
            }}
          >
            Manage providers
          </button>
          {(preferenceError || added.error || catalog.error || catalog.cacheError) && (
            <p role="status" className="model-list-note">
              {preferenceError || added.error || catalog.error || catalog.cacheError}
            </p>
          )}
        </>
      }
    />
  );
}
