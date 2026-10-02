import type { ProviderId, Settings } from "../types";
import type { ProviderModel } from "./providers";

export function selectProvider(
  settings: Settings,
  provider: ProviderId,
): Settings {
  return settings.provider === provider ? settings : { ...settings, provider };
}

export function selectActiveModel(
  settings: Settings,
  model: string,
): Settings {
  const provider = settings.provider;
  if (settings.providers[provider].model === model) return settings;

  return {
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: {
        ...settings.providers[provider],
        model,
      },
    },
  };
}

export function getModelOptions(
  discovered: ProviderModel[],
  selectedModel: string,
): ProviderModel[] {
  const selected = selectedModel.trim();
  if (!selected || discovered.some((model) => model.id === selected)) {
    return discovered;
  }
  return [{ id: selected, name: "Saved or custom model" }, ...discovered];
}

export function hasSameProviderConfig(
  current: Settings,
  snapshot: Settings,
  provider: ProviderId,
): boolean {
  const currentConfig = current.providers[provider];
  const snapshotConfig = snapshot.providers[provider];
  if (
    currentConfig.apiKey !== snapshotConfig.apiKey ||
    currentConfig.model !== snapshotConfig.model
  ) {
    return false;
  }
  if (provider !== "local") return true;

  return (
    current.providers.local.apiFormat === snapshot.providers.local.apiFormat &&
    current.providers.local.endpoint === snapshot.providers.local.endpoint
  );
}
