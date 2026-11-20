import { api } from '../api/client.js';
import { createDeckStore } from './deckStore.js';
import { createResource } from './resource.js';

// One instance of each for the whole app. Living outside React means the deck and the match list
// survive switching tabs (Discover unmounts when Home is shown) without refetching or losing place.
export const deckStore = createDeckStore({ api });
export const matchesStore = createResource({ fetcher: async () => (await api.getMatches()).matches });
export const meStore = createResource({ fetcher: async () => (await api.getMe()).profile });
