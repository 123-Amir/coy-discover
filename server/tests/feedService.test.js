import { describe, it, expect } from 'vitest';
import { seedData } from '../src/data/profiles.js';
import { getFeed, DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from '../src/services/feedService.js';
import { swipe } from '../src/services/swipeService.js';
import { makeSeededDb, withLikers, idBySlug, expectAppError } from './helpers.js';

const PROFILE_KEYS = ['age', 'bio', 'city', 'college', 'id', 'interests', 'name', 'photoUrl'];
const TOTAL = seedData.profiles.length;
const feedIds = (db, me, limit = MAX_FEED_LIMIT) => getFeed(db, me, { limit }).profiles.map((p) => p.id);

describe('getFeed: shape and limits', () => {
  it('returns { profiles } with the default limit', () => {
    const { db, me } = makeSeededDb();
    const feed = getFeed(db, me);
    expect(Object.keys(feed)).toEqual(['profiles']);
    expect(feed.profiles).toHaveLength(DEFAULT_FEED_LIMIT);
  });

  it('honours an explicit limit, up to the maximum', () => {
    const { db, me } = makeSeededDb();
    expect(getFeed(db, me, { limit: 1 }).profiles).toHaveLength(1);
    expect(getFeed(db, me, { limit: 5 }).profiles).toHaveLength(5);
    expect(getFeed(db, me, { limit: MAX_FEED_LIMIT }).profiles).toHaveLength(Math.min(TOTAL, MAX_FEED_LIMIT));
  });

  it('rejects invalid limits with INVALID_LIMIT', () => {
    const { db, me } = makeSeededDb();
    for (const limit of [0, -1, MAX_FEED_LIMIT + 1, 1.5, '5', null, NaN, Infinity]) {
      expectAppError(() => getFeed(db, me, { limit }), 'INVALID_LIMIT', 400);
    }
  });

  it('excludes the current user', () => {
    const { db, me } = makeSeededDb();
    expect(feedIds(db, me)).not.toContain(me);
    expect(feedIds(db, me)).toHaveLength(TOTAL);
  });
});

describe('getFeed: explicit field whitelist', () => {
  it('returns exactly the public profile fields and nothing else', () => {
    const { db, me } = makeSeededDb();
    for (const p of getFeed(db, me, { limit: MAX_FEED_LIMIT }).profiles) {
      expect(Object.keys(p).sort()).toEqual(PROFILE_KEYS);
      expect(Array.isArray(p.interests)).toBe(true);
      expect(p.photoUrl.startsWith('/avatars/')).toBe(true);
    }
  });

  it('never exposes internal or incoming-like fields', () => {
    const { db, me } = makeSeededDb();
    const json = JSON.stringify(getFeed(db, me, { limit: MAX_FEED_LIMIT }));
    for (const forbidden of ['slug', 'is_current_user', 'isCurrentUser', 'likesCurrentUser',
      'likedYou', 'likesYou', 'likedMe', 'swiper', 'action']) {
      expect(json.includes(forbidden)).toBe(false);
    }
  });
});

describe('getFeed: swiped profiles never come back', () => {
  it('excludes profiles the user liked or passed', () => {
    const { db, me } = makeSeededDb();
    const liked = idBySlug(db, 'rohan');
    const passed = idBySlug(db, 'ananya');
    swipe(db, me, { profileId: liked, action: 'like' });
    swipe(db, me, { profileId: passed, action: 'pass' });
    const ids = feedIds(db, me);
    expect(ids).not.toContain(liked);
    expect(ids).not.toContain(passed);
    expect(ids).toHaveLength(TOTAL - 2);
  });

  it('shows every profile exactly once across a full session, then an empty feed', () => {
    const { db, me } = makeSeededDb();
    const shown = [];
    for (let guard = 0; guard < 100; guard++) {
      const { profiles } = getFeed(db, me, { limit: 3 });
      if (profiles.length === 0) break;
      profiles.forEach((p, i) => {
        shown.push(p.id);
        swipe(db, me, { profileId: p.id, action: (shown.length + i) % 2 ? 'like' : 'pass' });
      });
    }
    expect(shown).toHaveLength(TOTAL);
    expect(new Set(shown).size).toBe(TOTAL);
    expect(getFeed(db, me)).toEqual({ profiles: [] });
  });

  it('persists across a new connection to the same data (reload simulation)', () => {
    const { db, me } = makeSeededDb();
    const first = getFeed(db, me, { limit: 1 }).profiles[0].id;
    swipe(db, me, { profileId: first, action: 'pass' });
    // A "reload" is just another request: the feed is derived from the database each time.
    expect(feedIds(db, me)).not.toContain(first);
  });
});

describe('getFeed: ordering is independent of incoming likes', () => {
  it('is deterministic and stays stable as profiles are swiped', () => {
    const { db, me } = makeSeededDb();
    const before = feedIds(db, me);
    expect(feedIds(db, me)).toEqual(before);
    swipe(db, me, { profileId: before[0], action: 'pass' });
    expect(feedIds(db, me)).toEqual(before.slice(1));
  });

  it('is identical whether everyone, nobody, or the default set has liked the user', () => {
    const worlds = [
      makeSeededDb(),
      makeSeededDb(withLikers(seedData, () => true)),
      makeSeededDb(withLikers(seedData, () => false)),
      makeSeededDb(withLikers(seedData, (p) => !p.likesCurrentUser)),
    ];
    const orders = worlds.map(({ db, me }) => feedIds(db, me));
    for (const order of orders.slice(1)) expect(order).toEqual(orders[0]);
  });

  it('does not change when a new like or pass arrives mid-session', () => {
    const { db, me } = makeSeededDb();
    const before = feedIds(db, me);
    const rohan = idBySlug(db, 'rohan');
    const ishita = idBySlug(db, 'ishita');
    swipe(db, rohan, { profileId: me, action: 'like' });   // rohan likes the user
    swipe(db, ishita, { profileId: me, action: 'pass' });  // ishita passes on the user
    expect(feedIds(db, me)).toEqual(before);
  });

  it('does not put people who liked the user first (demo likers are spread out)', () => {
    const { db, me } = makeSeededDb();
    const likers = new Set(db.prepare('SELECT swiper_id FROM swipes WHERE target_id = ?').all(me).map((r) => r.swiper_id));
    const order = feedIds(db, me);
    const inFirst = (n) => order.slice(0, n).filter((id) => likers.has(id)).length;
    expect(inFirst(1)).toBe(0);               // not guaranteed-first
    expect(inFirst(5)).toBeGreaterThanOrEqual(1);   // but a demo reaches a match quickly
    expect(inFirst(10)).toBeGreaterThanOrEqual(2);
    expect(inFirst(10)).toBeLessThan(10);
  });
});
