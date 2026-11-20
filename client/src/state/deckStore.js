import { describeError } from '../api/client.js';

export const PAGE_SIZE = 10;
export const PREFETCH_THRESHOLD = 3;

const initialState = () => ({
  status: 'loading',      // 'loading' | 'ready' | 'error'   (initial load only)
  error: null,            // { message, network, status, code } when status === 'error'
  queue: [],              // profiles still to swipe; queue[0] is the top card
  knownIds: [],           // every id ever queued this session, so a prefetch never repeats a card
  exhausted: false,       // the server has nothing more to show
  inFlight: null,         // { profile, action } while a swipe request is pending
  lastAction: null,       // drives the exit direction, also for button-initiated swipes
  rollbackId: null,       // profile id returned to the deck after a failed save
  matchModal: null,       // the server's `match` object; set ONLY when the server says matched: true
  newMatchIds: [],        // matches made this session that have not been looked at yet
  notice: null,           // { id, kind: 'error' | 'info', message }
  announcement: '',       // text for the screen-reader live region
});

/** True when a swipe would be accepted right now. */
export const canSwipe = (s) =>
  s.status === 'ready' && !s.inFlight && !s.matchModal && s.queue.length > 0;

/**
 * Everything about the swipe deck, with no React or DOM in it.
 *
 * What it does NOT do: decide matches. A match exists only if the server's response to a swipe
 * says `matched: true` with a `match` object; the store never looks at who liked whom.
 *
 * Swipe flow: the card leaves the queue immediately (so the next card is revealed at once), the
 * request is sent, and exactly one request can be in flight at a time. On success the modal opens
 * if the server said so. On a network/server failure the card is put back on top ("rollback").
 * On 409/404 the server already has a decision or the profile is gone, so the card stays removed.
 */
export function createDeckStore({ api, pageSize = PAGE_SIZE, prefetchThreshold = PREFETCH_THRESHOLD } = {}) {
  let state = initialState();
  let started = false;
  let loadPromise = null;
  let requestPromise = null;
  let noticeSeq = 0;
  const listeners = new Set();

  const set = (patch) => {
    state = { ...state, ...patch };
    for (const l of [...listeners]) l();
  };
  const notice = (kind, message) => ({ id: ++noticeSeq, kind, message });

  /** Fetch a page and append the profiles we have not seen. Shared by first load and prefetch. */
  function load() {
    if (loadPromise) return loadPromise;
    if (state.queue.length === 0) set({ status: 'loading', error: null });
    loadPromise = (async () => {
      try {
        const { profiles } = await api.getFeed(pageSize);
        const fresh = profiles.filter((p) => !state.knownIds.includes(p.id));
        set({
          status: 'ready',
          error: null,
          queue: [...state.queue, ...fresh],
          knownIds: [...state.knownIds, ...fresh.map((p) => p.id)],
          exhausted: profiles.length < pageSize || fresh.length === 0,
        });
      } catch (err) {
        // Keep playing with the cards we already have; only show an error if the deck is empty.
        if (state.queue.length === 0) set({ status: 'error', error: describeError(err) });
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  function maybePrefetch() {
    if (state.status === 'ready' && !state.exhausted && !loadPromise && state.queue.length <= prefetchThreshold) {
      load();
    }
  }

  function settleSuccess(profile, action, result) {
    const match = result?.matched === true && result.match ? result.match : null;
    if (match) {
      set({
        inFlight: null,
        matchModal: match,
        newMatchIds: state.newMatchIds.includes(match.id) ? state.newMatchIds : [...state.newMatchIds, match.id],
        announcement: `It's a match with ${profile.name}!`,
      });
    } else {
      set({
        inFlight: null,
        announcement: action === 'like' ? `You liked ${profile.name}.` : `You passed on ${profile.name}.`,
      });
    }
  }

  function settleFailure(profile, err) {
    if (err?.status === 409 || err?.status === 404) {
      // The server already holds a decision for this profile (e.g. from another tab), or it is gone.
      set({
        inFlight: null,
        notice: notice('info', err.status === 409
          ? `You've already decided on ${profile.name}.`
          : `${profile.name} isn't available any more.`),
        announcement: '',
      });
    } else {
      set({
        inFlight: null,
        queue: [profile, ...state.queue],
        rollbackId: profile.id,
        notice: notice('error', describeError(err).message),
        announcement: `Couldn't save your choice for ${profile.name}.`,
      });
    }
  }

  async function send(profile, action) {
    try {
      settleSuccess(profile, action, await api.postSwipe(profile.id, action));
    } catch (err) {
      settleFailure(profile, err);
    }
    maybePrefetch();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** First load. Idempotent, so StrictMode's double effect only fetches once. */
    start() {
      if (started) return loadPromise ?? Promise.resolve();
      started = true;
      return load();
    },

    /** Retry after an error, or look for new profiles after the deck ran out. */
    refresh() {
      set({ exhausted: false, ...(state.queue.length === 0 ? { status: 'loading', error: null } : {}) });
      return load();
    },

    /**
     * Swipe the top card. Returns true if accepted, false if ignored (a request is already in
     * flight, the match modal is open, the deck is empty or not ready). Synchronous on purpose:
     * the UI needs to know immediately whether to spring the card back.
     */
    swipe(action) {
      if (action !== 'like' && action !== 'pass') return false;
      if (!canSwipe(state)) return false;
      const profile = state.queue[0];
      set({
        queue: state.queue.slice(1),
        inFlight: { profile, action },
        lastAction: action,
        rollbackId: null,
        notice: null,
      });
      requestPromise = send(profile, action);   // send first, so the server has recorded it before the prefetch asks
      maybePrefetch();
      return true;
    },

    /** Resolves when no request is pending (used by tests and by callers that need to wait). */
    async idle() {
      await requestPromise;
      await loadPromise;
    },

    dismissMatch: () => set({ matchModal: null }),
    clearNewMatches: () => { if (state.newMatchIds.length) set({ newMatchIds: [] }); },
    dismissNotice: (id) => { if (state.notice && (id === undefined || state.notice.id === id)) set({ notice: null }); },
  };
}
