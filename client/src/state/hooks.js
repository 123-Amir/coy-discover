import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { deckStore, matchesStore, meStore } from './stores.js';
import { hashFor, parseHash } from '../lib/route.js';

const useStore = (store) => useSyncExternalStore(store.subscribe, store.getState);

export const useDeck = () => useStore(deckStore);
export const useMatches = () => useStore(matchesStore);
export const useMe = () => useStore(meStore);

/** [{ tab, view }, navigate(tab, view)] backed by location.hash, so a refresh keeps your place. */
export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((tab, view = 'swipe') => {
    const next = hashFor(tab, view);
    if (window.location.hash !== next) window.location.hash = next;
  }, []);
  return [route, navigate];
}
