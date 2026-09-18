import { useEffect } from 'react';
import { modelsAreStale } from '../modelDiscovery';
import { useStore } from '../store';

/** Poll only visible, online sessions; a failed provider gets the same retry interval. */
export function useModelDiscovery() {
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState === 'hidden' || navigator.onLine === false) return;
      const state = useStore.getState();
      for (const provider of state.providers) {
        if (provider.configured && modelsAreStale(state.modelDiscovery[provider.id]))
          void state.refreshModels(provider.id, controller.signal).catch(() => {
            // Each provider's visible status reports its own failure, without toast spam.
          });
      }
    };
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (state.providers !== previous.providers) refresh();
    });
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    refresh();
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
