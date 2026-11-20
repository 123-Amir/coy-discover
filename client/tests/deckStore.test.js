import { describe, it, expect } from 'vitest';
import { createDeckStore, canSwipe, PAGE_SIZE } from '../src/state/deckStore.js';
import { ApiError } from '../src/api/client.js';

// ---- test helpers --------------------------------------------------------
const profile = (id) => ({ id, name: `P${id}`, age: 20 + (id % 10), bio: 'b', city: 'c', college: 'x', photoUrl: `/avatars/p${id}.svg`, interests: ['a'] });
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => profile(from + i));
const MATCH = (id, pid) => ({ id, matchedAt: '2026-11-18T10:00:00.000Z', profile: profile(pid) });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const netErr = () => new ApiError({ network: true, code: 'NETWORK_ERROR' });
const httpErr = (status, code) => new ApiError({ status, code, message: 'x' });
const nope = (id, action) => ({ swipe: { profileId: id, action }, matched: false, match: null, alreadySwiped: false });

/** A fake API. `feed` is what the "server" holds as unswiped; swipes remove from it like the real one. */
function fakeApi({ feed = range(1, 25), onSwipe } = {}) {
  const log = { feedCalls: 0, swipes: [] };
  let remaining = [...feed];
  return {
    log,
    async getFeed(limit) { log.feedCalls++; return { profiles: remaining.slice(0, limit) }; },
    async postSwipe(id, action) {
      log.swipes.push([id, action]);
      if (onSwipe) return onSwipe(id, action, log);
      remaining = remaining.filter((p) => p.id !== id);
      return nope(id, action);
    },
  };
}
const ready = async (api, opts) => { const store = createDeckStore({ api, ...opts }); await store.start(); return store; };
const ids = (store) => store.getState().queue.map((p) => p.id);

// ---- loading -------------------------------------------------------------
describe('deckStore: loading', () => {
  it('starts in loading, then holds the first page', async () => {
    const store = createDeckStore({ api: fakeApi() });
    expect(store.getState().status).toBe('loading');
    await store.start();
    const s = store.getState();
    expect(s.status).toBe('ready');
    expect(s.queue).toHaveLength(PAGE_SIZE);
    expect(s.exhausted).toBe(false);
  });

  it('marks the deck exhausted when the server returns a short page', async () => {
    const store = await ready(fakeApi({ feed: range(1, 4) }));
    expect(ids(store)).toEqual([1, 2, 3, 4]);
    expect(store.getState().exhausted).toBe(true);
  });

  it('handles an empty feed: ready, no cards, exhausted', async () => {
    const store = await ready(fakeApi({ feed: [] }));
    const s = store.getState();
    expect(s.status).toBe('ready');
    expect(s.queue).toEqual([]);
    expect(s.exhausted).toBe(true);
    expect(canSwipe(s)).toBe(false);
  });

  it('start() twice (StrictMode) only fetches once', async () => {
    const api = fakeApi();
    const store = createDeckStore({ api });
    await Promise.all([store.start(), store.start()]);
    expect(api.log.feedCalls).toBe(1);
  });

  it('start() again after the first load finished does not refetch (re-mounting Discover keeps the deck)', async () => {
    const api = fakeApi();
    const store = await ready(api);
    store.swipe('like'); await store.idle();
    const before = ids(store);
    await store.start();
    await store.start();
    expect(api.log.feedCalls).toBe(1);
    expect(ids(store)).toEqual(before);
  });

  it('reports a load failure, then recovers on refresh()', async () => {
    let fail = true;
    const api = { async getFeed() { if (fail) throw netErr(); return { profiles: range(1, 5) }; }, postSwipe: async () => nope(1, 'like') };
    const store = createDeckStore({ api });
    await store.start();
    expect(store.getState().status).toBe('error');
    expect(store.getState().error.network).toBe(true);
    expect(store.getState().error.message).toMatch(/Can't reach Coy/);
    fail = false;
    await store.refresh();
    expect(store.getState().status).toBe('ready');
    expect(ids(store)).toEqual([1, 2, 3, 4, 5]);
  });

  it('refresh() after exhaustion picks up newly available profiles', async () => {
    const feed = range(1, 3);
    const api = { async getFeed() { return { profiles: feed.slice() }; }, postSwipe: async (id, a) => nope(id, a) };
    const store = await ready(api);
    expect(store.getState().exhausted).toBe(true);
    feed.push(profile(4));
    await store.refresh();
    expect(ids(store)).toEqual([1, 2, 3, 4]);
  });

  it('notifies subscribers, and keeps the same state object when nothing changed', async () => {
    const store = createDeckStore({ api: fakeApi() });
    let calls = 0;
    const off = store.subscribe(() => calls++);
    await store.start();
    expect(calls).toBeGreaterThan(0);
    const before = store.getState();
    expect(store.getState()).toBe(before);
    store.dismissMatch();                 // sets matchModal: null (a change, new object is fine)
    off();
    const n = calls;
    store.dismissMatch();
    expect(calls).toBe(n);                // unsubscribed
  });
});

// ---- swiping -------------------------------------------------------------
describe('deckStore: swiping', () => {
  it('removes the card immediately, sends one request, then settles', async () => {
    const api = fakeApi();
    const store = await ready(api);
    const top = ids(store)[0];
    expect(store.swipe('like')).toBe(true);
    const s = store.getState();
    expect(s.queue[0].id).toBe(top + 1);                 // next card is already on top
    expect(s.inFlight).toEqual({ profile: profile(top), action: 'like' });
    expect(s.lastAction).toBe('like');
    await store.idle();
    expect(store.getState().inFlight).toBeNull();
    expect(api.log.swipes).toEqual([[top, 'like']]);
  });

  it('blocks a second swipe while one is in flight (no double-swipe)', async () => {
    const gate = deferred();
    const api = fakeApi({ onSwipe: async (id, a) => { await gate.promise; return nope(id, a); } });
    const store = await ready(api);
    expect(store.swipe('like')).toBe(true);
    expect(store.swipe('like')).toBe(false);
    expect(store.swipe('pass')).toBe(false);
    expect(canSwipe(store.getState())).toBe(false);
    expect(api.log.swipes).toHaveLength(1);
    gate.resolve();
    await store.idle();
    expect(canSwipe(store.getState())).toBe(true);
    expect(store.swipe('pass')).toBe(true);
    await store.idle();
    expect(api.log.swipes).toHaveLength(2);
  });

  it('ignores invalid actions, an empty deck, and a deck that has not loaded', async () => {
    const api = fakeApi({ feed: [] });
    const store = createDeckStore({ api });
    expect(store.swipe('like')).toBe(false);             // still loading
    await store.start();
    expect(store.swipe('like')).toBe(false);             // empty
    const full = await ready(fakeApi());
    for (const bad of ['LIKE', 'superlike', '', null, undefined, 1]) expect(full.swipe(bad)).toBe(false);
    expect(full.getState().inFlight).toBeNull();
  });

  it('records a passed profile and never offers it again after a refresh', async () => {
    const api = fakeApi({ feed: range(1, 6) });
    const store = await ready(api);
    store.swipe('pass');
    await store.idle();
    await store.refresh();
    expect(ids(store)).toEqual([2, 3, 4, 5, 6]);
  });
});

// ---- the match modal: only the server decides -----------------------------
describe('deckStore: match modal', () => {
  it('opens ONLY when the server says matched: true, with the server\'s match object', async () => {
    const match = MATCH(7, 3);
    const api = fakeApi({ onSwipe: async (id, action) => ({ swipe: { profileId: id, action }, matched: true, match, alreadySwiped: false }) });
    const store = await ready(api);
    store.swipe('like');
    await store.idle();
    const s = store.getState();
    expect(s.matchModal).toEqual(match);
    expect(s.newMatchIds).toEqual([7]);
    expect(s.announcement).toMatch(/match/i);
  });

  it('does not open for matched: false, whoever the profile is', async () => {
    const store = await ready(fakeApi());
    for (let i = 0; i < 5; i++) { store.swipe('like'); await store.idle(); }
    expect(store.getState().matchModal).toBeNull();
    expect(store.getState().newMatchIds).toEqual([]);
  });

  it('does not open if the server says matched: true but sends no match object', async () => {
    const api = fakeApi({ onSwipe: async (id, action) => ({ swipe: { profileId: id, action }, matched: true, match: null }) });
    const store = await ready(api);
    store.swipe('like'); await store.idle();
    expect(store.getState().matchModal).toBeNull();
  });

  it('ignores truthy-but-not-true values for matched', async () => {
    for (const matched of ['true', 1, 'yes', {}]) {
      const api = fakeApi({ onSwipe: async (id, action) => ({ swipe: { profileId: id, action }, matched, match: MATCH(1, 2) }) });
      const store = await ready(api);
      store.swipe('like'); await store.idle();
      expect(store.getState().matchModal).toBeNull();
    }
  });

  it('opens again for an idempotent repeat that the server reports as matched', async () => {
    const api = fakeApi({ onSwipe: async (id, action) => ({ swipe: { profileId: id, action }, matched: true, match: MATCH(9, id), alreadySwiped: true }) });
    const store = await ready(api);
    store.swipe('like'); await store.idle();
    expect(store.getState().matchModal.id).toBe(9);
  });

  it('blocks swiping while the modal is open, and allows it after dismissal', async () => {
    const api = fakeApi({ onSwipe: async (id, action) => ({ swipe: { profileId: id, action }, matched: true, match: MATCH(1, id) }) });
    const store = await ready(api);
    store.swipe('like'); await store.idle();
    expect(canSwipe(store.getState())).toBe(false);
    expect(store.swipe('pass')).toBe(false);
    store.dismissMatch();
    expect(store.getState().matchModal).toBeNull();
    expect(store.swipe('pass')).toBe(true);
  });

  it('counts a new match once and clears the badge on request', async () => {
    let n = 0;
    const api = fakeApi({ onSwipe: async (id, action) => ({ swipe: { profileId: id, action }, matched: true, match: MATCH(n++ % 2 + 1, id) }) });
    const store = await ready(api);
    for (let i = 0; i < 3; i++) { store.swipe('like'); await store.idle(); store.dismissMatch(); }
    expect(store.getState().newMatchIds).toEqual([1, 2]);   // match id 1 seen twice, counted once
    store.clearNewMatches();
    expect(store.getState().newMatchIds).toEqual([]);
  });
});

// ---- failures ------------------------------------------------------------
describe('deckStore: failed swipes', () => {
  it('rolls the card back to the top after a network failure, with an error notice', async () => {
    const api = fakeApi({ onSwipe: async () => { throw netErr(); } });
    const store = await ready(api);
    const top = ids(store)[0];
    store.swipe('like');
    expect(ids(store)[0]).not.toBe(top);                 // optimistic advance
    await store.idle();
    const s = store.getState();
    expect(s.queue[0].id).toBe(top);                      // rolled back
    expect(s.rollbackId).toBe(top);
    expect(s.inFlight).toBeNull();
    expect(s.notice.kind).toBe('error');
    expect(s.notice.message).toMatch(/Can't reach Coy/);
    expect(s.matchModal).toBeNull();
  });

  it('rolls back on a 500 and shows a friendly message, never the server text', async () => {
    const api = fakeApi({ onSwipe: async () => { throw new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong' }); } });
    const store = await ready(api);
    store.swipe('pass'); await store.idle();
    expect(store.getState().queue[0].id).toBe(1);
    expect(store.getState().notice.message).toMatch(/our side/);
  });

  it('lets the user retry after a rollback', async () => {
    let fail = true;
    const api = fakeApi({ onSwipe: async (id, a) => { if (fail) throw netErr(); return nope(id, a); } });
    const store = await ready(api);
    store.swipe('like'); await store.idle();
    fail = false;
    expect(store.swipe('like')).toBe(true);
    await store.idle();
    expect(store.getState().queue[0].id).toBe(2);
    expect(store.getState().rollbackId).toBeNull();
  });

  it('does NOT bring the card back on 409 ALREADY_SWIPED; shows an info notice', async () => {
    const api = fakeApi({ onSwipe: async () => { throw httpErr(409, 'ALREADY_SWIPED'); } });
    const store = await ready(api);
    store.swipe('like'); await store.idle();
    const s = store.getState();
    expect(s.queue[0].id).toBe(2);
    expect(s.rollbackId).toBeNull();
    expect(s.notice.kind).toBe('info');
    expect(s.notice.message).toMatch(/already decided/);
  });

  it('does NOT bring the card back on 404 PROFILE_NOT_FOUND', async () => {
    const api = fakeApi({ onSwipe: async () => { throw httpErr(404, 'PROFILE_NOT_FOUND'); } });
    const store = await ready(api);
    store.swipe('like'); await store.idle();
    expect(store.getState().queue[0].id).toBe(2);
    expect(store.getState().notice.kind).toBe('info');
  });

  it('clears the notice on the next swipe and on dismissal', async () => {
    const api = fakeApi({ onSwipe: async () => { throw netErr(); } });
    const store = await ready(api);
    store.swipe('like'); await store.idle();
    const id = store.getState().notice.id;
    store.dismissNotice(id + 99);                          // wrong id: ignored
    expect(store.getState().notice).not.toBeNull();
    store.dismissNotice(id);
    expect(store.getState().notice).toBeNull();
    store.swipe('like'); await store.idle();
    store.swipe('like');                                   // rejected? no: rollback put card back, swipe allowed
    expect(store.getState().notice).toBeNull();            // cleared as soon as a new swipe starts
    await store.idle();
  });
});

// ---- paging --------------------------------------------------------------
describe('deckStore: prefetching and de-duplication', () => {
  it('prefetches when the queue runs low, exactly once, without repeating cards', async () => {
    const api = fakeApi({ feed: range(1, 25) });
    const store = await ready(api);
    expect(api.log.feedCalls).toBe(1);
    for (let i = 0; i < 7; i++) { store.swipe('like'); await store.idle(); }
    expect(ids(store)).toHaveLength(10);                   // 10 - 7 + 7 fetched
    expect(api.log.feedCalls).toBe(2);
    expect(new Set(ids(store)).size).toBe(ids(store).length);
  });

  it('never queues a profile whose swipe is still in flight (server may still list it)', async () => {
    const gate = deferred();
    const api = fakeApi({ feed: range(1, 25), onSwipe: async (id, a) => { await gate.promise; return nope(id, a); } });
    const store = await ready(api);
    // Server has not recorded anything yet, so a prefetch will again return profile 1..10.
    for (let i = 0; i < 7; i++) { store.swipe('like'); gate.resolve(); await store.idle(); }
    const swiped = api.log.swipes.map(([id]) => id);
    for (const id of swiped) expect(ids(store)).not.toContain(id);
    expect(new Set(ids(store)).size).toBe(ids(store).length);
  });

  it('walks a whole 25-profile feed: every profile shown exactly once, then exhausted', async () => {
    const api = fakeApi({ feed: range(1, 25) });
    const store = await ready(api);
    const seen = [];
    for (let guard = 0; guard < 100 && canSwipe(store.getState()); guard++) {
      seen.push(store.getState().queue[0].id);
      store.swipe(guard % 2 ? 'like' : 'pass');
      await store.idle();
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    const s = store.getState();
    expect(s.queue).toEqual([]);
    expect(s.exhausted).toBe(true);
    expect(s.status).toBe('ready');
  });

  it('keeps playing when a prefetch fails and the deck is not empty', async () => {
    let calls = 0;
    const api = { async getFeed(limit) { calls++; if (calls > 1) throw netErr(); return { profiles: range(1, limit) }; }, postSwipe: async (id, a) => nope(id, a) };
    const store = await ready(api);
    for (let i = 0; i < 8; i++) { store.swipe('like'); await store.idle(); }
    expect(store.getState().status).toBe('ready');
    expect(ids(store)).toHaveLength(2);
  });

  it('shows an error if the deck runs out and the follow-up fetch fails', async () => {
    let calls = 0;
    const api = { async getFeed(limit) { calls++; if (calls > 1) throw netErr(); return { profiles: range(1, limit) }; }, postSwipe: async (id, a) => nope(id, a) };
    const store = await ready(api);
    for (let i = 0; i < 10; i++) { store.swipe('like'); await store.idle(); }
    expect(store.getState().status).toBe('error');
  });
});
