import { describe, it, expect } from 'vitest';
import { seedData } from '../src/data/profiles.js';
import { getFeed, MAX_FEED_LIMIT } from '../src/services/feedService.js';
import { swipe } from '../src/services/swipeService.js';
import { listMatches } from '../src/services/matchService.js';
import { makeSeededDb, withLikers, idBySlug, expectAppError } from './helpers.js';

const likerSlugs = new Set(seedData.profiles.filter((p) => p.likesCurrentUser).map((p) => p.slug));

/**
 * The core promise: nothing I can see or do reveals who liked me unless it is mutual.
 *
 * Differential test: build several worlds that differ ONLY in how other users feel about me
 * (some liked me, nobody did, everybody passed on me), run the same script of actions in
 * each, and require every response to be byte-for-byte identical.
 */
function runScript(world) {
  const { db, me } = world;
  const log = [];
  const record = (label, value) => log.push(JSON.stringify({ label, value }));

  record('feed-initial', getFeed(db, me, { limit: MAX_FEED_LIMIT }));
  record('matches-initial', listMatches(db, me));

  // Pass on the profiles that liked me in the default world; like everyone else.
  // (Liking someone who liked me is the one thing that legitimately reveals a match.)
  const order = getFeed(db, me, { limit: MAX_FEED_LIMIT }).profiles;
  order.forEach((p, i) => {
    const slug = db.prepare('SELECT slug FROM profiles WHERE id = ?').get(p.id).slug;
    const action = likerSlugs.has(slug) ? 'pass' : 'like';
    record(`swipe-${p.id}`, swipe(db, me, { profileId: p.id, action }));
    if (i % 7 === 0) record(`feed-${i}`, getFeed(db, me, { limit: MAX_FEED_LIMIT }));
  });

  // Errors must not differ either.
  const first = order[0].id;
  for (const action of ['like', 'pass']) {
    try { swipe(db, me, { profileId: first, action }); record(`dup-${action}`, 'no error'); }
    catch (e) { record(`dup-${action}`, { code: e.code, status: e.status, message: e.message }); }
  }
  record('feed-final', getFeed(db, me, { limit: MAX_FEED_LIMIT }));
  record('matches-final', listMatches(db, me));
  return log;
}

describe('privacy: other users\' feelings are invisible', () => {
  const defaultWorld = () => makeSeededDb();
  const nobodyLikedMe = () => makeSeededDb(withLikers(seedData, () => false));
  const everyoneLikedMe = () => makeSeededDb(withLikers(seedData, () => true));
  const everyonePassedMe = () => {
    const world = makeSeededDb(withLikers(seedData, () => false));
    const others = world.db.prepare('SELECT id FROM profiles WHERE id != ?').all(world.me);
    for (const { id } of others) swipe(world.db, id, { profileId: world.me, action: 'pass' });
    return world;
  };

  it('produces identical responses whether people liked me, passed on me, or never swiped', () => {
    const baseline = runScript(defaultWorld());
    expect(runScript(nobodyLikedMe())).toEqual(baseline);
    expect(runScript(everyonePassedMe())).toEqual(baseline);
  });

  it('never reports a match in any of those scripted sessions', () => {
    for (const make of [defaultWorld, nobodyLikedMe, everyonePassedMe]) {
      const log = runScript(make());
      expect(log.some((entry) => entry.includes('"matched":true'))).toBe(false);
      expect(log[log.length - 1]).toEqual(JSON.stringify({ label: 'matches-final', value: { matches: [] } }));
    }
  });

  it('gives the same outcome for liking someone who passed on me as for liking someone who never swiped', () => {
    const { db, me } = makeSeededDb();
    const passer = idBySlug(db, 'rohan');
    const silent = idBySlug(db, 'ishita');
    swipe(db, passer, { profileId: me, action: 'pass' });
    const a = swipe(db, me, { profileId: passer, action: 'like' });
    const b = swipe(db, me, { profileId: silent, action: 'like' });
    expect({ ...a, swipe: null }).toEqual({ ...b, swipe: null });
  });

  it('gives the same ALREADY_SWIPED error whether or not the other person liked me', () => {
    const { db, me } = makeSeededDb();
    const liker = idBySlug(db, 'ananya');
    const nonLiker = idBySlug(db, 'rohan');
    const capture = (target) => {
      swipe(db, me, { profileId: target, action: 'pass' });
      try { swipe(db, me, { profileId: target, action: 'like' }); } catch (e) { return [e.status, e.code, e.message]; }
    };
    expect(capture(liker)).toEqual(capture(nonLiker));
  });
});

describe('privacy: incoming likes are revealed only by mutual action', () => {
  it('shows an incoming like to the user only once they like back, and only as a match', () => {
    const { db, me } = makeSeededDb();
    const liker = idBySlug(db, 'ananya');
    expect(JSON.stringify(getFeed(db, me, { limit: MAX_FEED_LIMIT })).includes('"matched"')).toBe(false);
    expect(listMatches(db, me).matches).toEqual([]);
    const reveal = swipe(db, me, { profileId: liker, action: 'like' });
    expect(reveal.matched).toBe(true);
    expect(listMatches(db, me).matches.map((m) => m.profile.id)).toEqual([liker]);
  });

  it('keeps passed-on admirers hidden forever: they never reappear and never match', () => {
    const { db, me } = makeSeededDb();
    const likers = [...likerSlugs].map((s) => idBySlug(db, s));
    likers.forEach((id) => swipe(db, me, { profileId: id, action: 'pass' }));
    const remaining = getFeed(db, me, { limit: MAX_FEED_LIMIT }).profiles.map((p) => p.id);
    likers.forEach((id) => expect(remaining).not.toContain(id));
    expect(listMatches(db, me).matches).toEqual([]);
    for (const id of likers) expectAppError(() => swipe(db, me, { profileId: id, action: 'like' }), 'ALREADY_SWIPED');
    expect(listMatches(db, me).matches).toEqual([]);
  });

  it('exposes no field derived from incoming likes anywhere in a full session\'s output', () => {
    const { db, me } = makeSeededDb();
    const outputs = [getFeed(db, me, { limit: MAX_FEED_LIMIT })];
    for (const p of getFeed(db, me, { limit: MAX_FEED_LIMIT }).profiles) {
      outputs.push(swipe(db, me, { profileId: p.id, action: 'like' }));
    }
    outputs.push(listMatches(db, me));
    const json = JSON.stringify(outputs);
    for (const forbidden of ['likedYou', 'likesYou', 'likedMe', 'incoming', 'admirer', 'likesCurrentUser',
      'swiper_id', 'target_id', 'is_current_user', 'slug']) {
      expect(json.includes(forbidden)).toBe(false);
    }
    // Matches appear only for profiles that had liked me; non-likers never produce one.
    const matchedIds = listMatches(db, me).matches.map((m) => m.profile.id).sort((a, b) => a - b);
    expect(matchedIds).toEqual([...likerSlugs].map((s) => idBySlug(db, s)).sort((a, b) => a - b));
  });
});
