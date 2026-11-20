import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { createApi } from '../../client/src/api/client.js';
import { createDeckStore, canSwipe } from '../../client/src/state/deckStore.js';
import { createResource } from '../../client/src/state/resource.js';
import { seedData } from '../src/data/profiles.js';
import { makeSeededDb, idBySlug } from './helpers.js';

// Contract tests: the REAL frontend stores talking to the REAL Express app and SQLite database over HTTP.
// They prove the UI's assumptions about the API are true, and that what the UI shows (matches, history)
// agrees with the database.

async function boot() {
  const { db, me } = makeSeededDb();
  const server = http.createServer(createApp({ db, logger: { error() {} } }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const api = createApi({ baseUrl: `http://127.0.0.1:${server.address().port}/api` });
  const close = () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
  const newDeck = () => createDeckStore({ api });
  const newMatches = () => createResource({ fetcher: async () => (await api.getMatches()).matches });
  return { db, me, api, close, newDeck, newMatches };
}
const ids = (store) => store.getState().queue.map((p) => p.id);
const mySwipes = (ctx) => ctx.db.prepare('SELECT target_id AS id, action FROM swipes WHERE swiper_id = ? ORDER BY id').all(ctx.me);
const likerIds = (ctx) => new Set(ctx.db.prepare(`SELECT swiper_id AS id FROM swipes WHERE target_id = ? AND action = 'like'`).all(ctx.me).map((r) => r.id));

describe('client stores against the real API', () => {
  it('loads the feed in the server\'s order with exactly the public fields', async () => {
    const ctx = await boot();
    try {
      const deck = ctx.newDeck();
      await deck.start();
      const serverFeed = (await ctx.api.getFeed(10)).profiles;
      expect(ids(deck)).toEqual(serverFeed.map((p) => p.id));
      for (const p of deck.getState().queue) {
        expect(Object.keys(p).sort()).toEqual(['age', 'bio', 'city', 'college', 'id', 'interests', 'name', 'photoUrl']);
      }
      expect(deck.getState().exhausted).toBe(false);
    } finally { await ctx.close(); }
  });

  it('walks the whole feed: each profile once, a match modal exactly for mutual likes, DB agrees', async () => {
    const ctx = await boot();
    try {
      const admirers = likerIds(ctx);                 // captured BEFORE swiping; the store never sees this
      const deck = ctx.newDeck();
      await deck.start();
      const shown = [], liked = new Set(), modals = [];
      for (let guard = 0; guard < 100 && deck.getState().queue.length; guard++) {
        const top = deck.getState().queue[0].id;
        shown.push(top);
        const action = guard % 2 === 0 ? 'like' : 'pass';
        if (action === 'like') liked.add(top);
        expect(deck.swipe(action)).toBe(true);
        await deck.idle();
        const modal = deck.getState().matchModal;
        if (modal) { modals.push(modal.profile.id); deck.dismissMatch(); }
      }
      expect(shown).toHaveLength(seedData.profiles.length);
      expect(new Set(shown).size).toBe(shown.length);
      expect(deck.getState().exhausted).toBe(true);
      expect(mySwipes(ctx)).toHaveLength(seedData.profiles.length);

      const expectedMatches = [...liked].filter((id) => admirers.has(id)).sort((a, b) => a - b);
      expect(expectedMatches.length).toBeGreaterThan(0);        // the walk actually produced matches
      expect(modals.sort((a, b) => a - b)).toEqual(expectedMatches);   // modal iff mutual
      const stored = ctx.db.prepare('SELECT user_a_id AS a, user_b_id AS b FROM matches').all()
        .map((m) => (m.a === ctx.me ? m.b : m.a)).sort((a, b) => a - b);
      expect(stored).toEqual(expectedMatches);                  // and the DB holds exactly those
    } finally { await ctx.close(); }
  });

  it('opens the modal for a mutual like, and the same match appears in the matches list', async () => {
    const ctx = await boot();
    try {
      const ananya = idBySlug(ctx.db, 'ananya');
      const deck = ctx.newDeck();
      await deck.start();
      while (deck.getState().queue[0].id !== ananya) { deck.swipe('pass'); await deck.idle(); }
      deck.swipe('like');
      await deck.idle();
      const modal = deck.getState().matchModal;
      expect(modal.profile.name).toBe('Ananya');
      const matches = ctx.newMatches();
      await matches.load();
      expect(matches.getState().data.map((m) => m.id)).toEqual([modal.id]);
      expect(matches.getState().data[0].profile.id).toBe(ananya);
    } finally { await ctx.close(); }
  });

  it('never shows a modal for a pass on an admirer, or a like on a non-admirer', async () => {
    const ctx = await boot();
    try {
      const admirers = likerIds(ctx);
      const deck = ctx.newDeck();
      await deck.start();
      for (let i = 0; i < 10; i++) {
        const top = deck.getState().queue[0].id;
        deck.swipe(admirers.has(top) ? 'pass' : 'like');
        await deck.idle();
        expect(deck.getState().matchModal).toBeNull();
      }
    } finally { await ctx.close(); }
  });

  it('blocks a double swipe against the real server: one request, one row', async () => {
    const ctx = await boot();
    try {
      const deck = ctx.newDeck();
      await deck.start();
      expect(deck.swipe('like')).toBe(true);
      expect(deck.swipe('like')).toBe(false);
      expect(deck.swipe('pass')).toBe(false);
      await deck.idle();
      expect(mySwipes(ctx)).toHaveLength(1);
    } finally { await ctx.close(); }
  });

  it('refresh preserves history: a brand-new store after swiping never re-offers swiped profiles', async () => {
    const ctx = await boot();
    try {
      const first = ctx.newDeck();
      await first.start();
      const swiped = [];
      for (let i = 0; i < 4; i++) { swiped.push(first.getState().queue[0].id); first.swipe(i % 2 ? 'like' : 'pass'); await first.idle(); first.dismissMatch(); }

      const reloaded = ctx.newDeck();                       // a page refresh
      await reloaded.start();
      for (const id of swiped) expect(ids(reloaded)).not.toContain(id);
      const matches = ctx.newMatches();                      // matches survive too
      await matches.load();
      expect(matches.getState().data.length).toBe(ctx.db.prepare('SELECT COUNT(*) AS n FROM matches').get().n);
    } finally { await ctx.close(); }
  });

  it('409 from the real server (decided in another tab): card stays removed, info notice, DB unchanged', async () => {
    const ctx = await boot();
    try {
      const deck = ctx.newDeck();
      await deck.start();
      const top = deck.getState().queue[0].id;
      await ctx.api.postSwipe(top, 'pass');                  // "another tab" decides first
      const before = mySwipes(ctx);
      deck.swipe('like');                                    // this tab disagrees
      await deck.idle();
      const s = deck.getState();
      expect(s.notice.kind).toBe('info');
      expect(s.rollbackId).toBeNull();
      expect(ids(deck)).not.toContain(top);
      expect(mySwipes(ctx)).toEqual(before);
    } finally { await ctx.close(); }
  });

  it('shows the modal when a retried like is reported as an idempotent match (lost-response case)', async () => {
    const ctx = await boot();
    try {
      const ananya = idBySlug(ctx.db, 'ananya');
      const deck = ctx.newDeck();
      await deck.start();
      await ctx.api.postSwipe(ananya, 'like');               // first attempt reached the server, response was lost
      while (deck.getState().queue[0].id !== ananya) { deck.swipe('pass'); await deck.idle(); }
      deck.swipe('like');                                    // the retry
      await deck.idle();
      expect(deck.getState().matchModal.profile.id).toBe(ananya);
      expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM matches').get().n).toBe(1);
    } finally { await ctx.close(); }
  });

  it('rolls back on a real 500, keeps the server text out of the UI, and recovers', async () => {
    const ctx = await boot();
    try {
      const deck = ctx.newDeck();
      await deck.start();
      const top = deck.getState().queue[0].id;
      ctx.db.exec(`CREATE TRIGGER zz_boom BEFORE INSERT ON swipes BEGIN SELECT RAISE(ABORT, 'secret detail'); END`);
      deck.swipe('like');
      await deck.idle();
      const s = deck.getState();
      expect(s.queue[0].id).toBe(top);
      expect(s.notice.kind).toBe('error');
      expect(JSON.stringify(s.notice).includes('secret')).toBe(false);
      expect(mySwipes(ctx)).toHaveLength(0);
      ctx.db.exec('DROP TRIGGER zz_boom');
      expect(deck.swipe('like')).toBe(true);
      await deck.idle();
      expect(mySwipes(ctx)).toHaveLength(1);
    } finally { await ctx.close(); }
  });

  it('rolls back with a "can\'t reach" message when the server is down', async () => {
    const ctx = await boot();
    const deck = ctx.newDeck();
    await deck.start();
    const top = deck.getState().queue[0].id;
    await ctx.close();                                       // server goes away
    deck.swipe('like');
    await deck.idle();
    const s = deck.getState();
    expect(s.queue[0].id).toBe(top);
    expect(s.notice.message).toMatch(/Can't reach Coy/);
    expect(canSwipe(s)).toBe(true);
  });
});
