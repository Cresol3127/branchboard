import type { ProviderId } from './providers';

export const MODEL_REFRESH_INTERVAL = 15 * 60 * 1000;
export type ModelDiscovery = {
  loading: boolean;
  checkedAt?: number;
  updatedAt?: number;
  error?: string;
};
export type ModelDiscoveryState = Partial<Record<ProviderId, ModelDiscovery>>;

export function modelsAreStale(status: ModelDiscovery | undefined, now = Date.now()) {
  return (
    !status?.loading &&
    (status?.checkedAt === undefined || now - status.checkedAt >= MODEL_REFRESH_INTERVAL)
  );
}

export function modelDiscoveryLabel(status: ModelDiscovery | undefined) {
  const time =
    status?.updatedAt === undefined
      ? ''
      : new Date(status.updatedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
  if (status?.loading) return 'Checking provider…';
  if (status?.error)
    return `Refresh failed — previous list kept${time ? ` · Updated ${time}` : ''}`;
  if (time) return `Updated ${time}`;
  return 'Not checked yet · suggested / saved models';
}
