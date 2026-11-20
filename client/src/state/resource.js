import { describeError } from '../api/client.js';

/**
 * A tiny observable "load this once, refresh on demand" store, used for the matches list and
 * the current user. Shows a loading state only until the first success; after that a refresh
 * keeps the old data on screen and reports `refreshing` / `error` alongside it.
 * Framework-free: React subscribes through useSyncExternalStore (see hooks.js).
 */
export function createResource({ fetcher }) {
  let state = { status: 'idle', data: null, error: null, refreshing: false, loaded: false };
  let inflight = null;
  const listeners = new Set();
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const l of [...listeners]) l();
  };

  function load() {
    if (inflight) return inflight;
    set(state.loaded ? { refreshing: true, error: null } : { status: 'loading', error: null });
    inflight = (async () => {
      try {
        const data = await fetcher();
        set({ status: 'ready', data, error: null, refreshing: false, loaded: true });
      } catch (err) {
        const error = describeError(err);
        set(state.loaded ? { refreshing: false, error } : { status: 'error', error, refreshing: false });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    /** Load once; safe to call from an effect that StrictMode runs twice. */
    start: () => (state.status === 'idle' ? load() : inflight ?? Promise.resolve()),
  };
}
