import { useEffect } from 'react';
import { modelsAreStale } from '../modelDiscovery';
import { useStore } from '../store';
import { catalogIsStale } from '../modelCatalog';

/** Poll only visible, online sessions; a failed provider gets the same retry interval. */
export function useModelDiscovery() {
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (
        controller.signal.aborted ||
        document.visibilityState === 'hidden' ||
        navigator.onLine === false
      )
        return;
      const state = useStore.getState();
      if (catalogIsStale(state.modelCatalog))
        void state.refreshModelCatalog(false, controller.signal).catch(() => {});
      for (const provider of state.providers) {
        // Cloud selections update from public catalogs, never by automatically using saved keys.
        if (
          provider.id === 'ollama' &&
          provider.configured &&
          modelsAreStale(state.modelDiscovery[provider.id])
        )
          void state.refreshModels(provider.id, controller.signal).catch(() => {
            // Each provider's visible status reports its own failure, without toast spam.
          });
      }
    };
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (
        state.providers !== previous.providers ||
        (previous.modelCatalog.loading && !state.modelCatalog.loading)
      )
        refresh();
    });
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    // StrictMode replays effects; wait until its discarded setup has been cleaned up.
    queueMicrotask(refresh);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
      controller.abort();
    };
  }, []);
}
