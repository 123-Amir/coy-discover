import { describe, it, expect } from 'vitest';
import { swipe } from '../src/services/swipeService.js';
import { listMatches } from '../src/services/matchService.js';
import { makeSeededDb, idBySlug, count, expectAppError } from './helpers.js';

const PROFILE_KEYS = ['age', 'bio', 'city', 'college', 'id', 'interests', 'name', 'photoUrl'];
const like = (db, who, target) => swipe(db, who, { profileId: target, action: 'like' });
const pass = (db, who, target) => swipe(db, who, { profileId: target, action: 'pass' });

describe('listMatches', () => {
  it('is empty before any swipe, even though some profiles have already liked the user', () => {
    const { db, me } = makeSeededDb();
    expect(listMatches(db, me)).toEqual({ matches: [] });
  });

  it('lists only mutual likes', () => {
    const { db, me } = makeSeededDb();
    const liker = idBySlug(db, 'ananya');        // liked the user first
    const passedLiker = idBySlug(db, 'kabir');   // liked the user first, but the user passes
    const nonLiker = idBySlug(db, 'rohan');      // never liked the user
    like(db, me, liker);
    pass(db, me, passedLiker);
    like(db, me, nonLiker);
    expect(listMatches(db, me).matches.map((m) => m.profile.id)).toEqual([liker]);
  });

  it('never lists a one-sided like in either direction', () => {
    const { db, me } = makeSeededDb();
    like(db, me, idBySlug(db, 'rohan'));                          // my like, unreturned
    // ananya's like is unreturned, since I have not swiped on her
    expect(listMatches(db, me).matches).toEqual([]);
  });

  it('returns whitelisted fields only, with an ISO timestamp', () => {
    const { db, me } = makeSeededDb();
    like(db, me, idBySlug(db, 'ananya'));
    const [m] = listMatches(db, me).matches;
    expect(Object.keys(m).sort()).toEqual(['id', 'matchedAt', 'profile']);
    expect(Object.keys(m.profile).sort()).toEqual(PROFILE_KEYS);
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(m.matchedAt)).toBe(true);
    const json = JSON.stringify(m);
    for (const forbidden of ['slug', 'is_current_user', 'likedYou', 'swiper', 'user_a_id']) {
      expect(json.includes(forbidden)).toBe(false);
    }
  });

  it('lists newest matches first', () => {
    const { db, me } = makeSeededDb();
    const ids = ['ananya', 'kabir', 'meera'].map((s) => idBySlug(db, s));
    ids.forEach((id) => like(db, me, id));
    expect(listMatches(db, me).matches.map((m) => m.profile.id)).toEqual([...ids].reverse());
  });

  it('shows each user only their own matches', () => {
    const { db, me } = makeSeededDb();
    const x = idBySlug(db, 'rohan');
    const y = idBySlug(db, 'ishita');
    like(db, x, y);
    like(db, y, x);   // a match between two OTHER users
    expect(listMatches(db, me).matches).toEqual([]);
    expect(listMatches(db, x).matches.map((m) => m.profile.id)).toEqual([y]);
    expect(listMatches(db, y).matches.map((m) => m.profile.id)).toEqual([x]);
  });

  it('survives a "reload": matches are read from the database each time', () => {
    const { db, me } = makeSeededDb();
    like(db, me, idBySlug(db, 'ananya'));
    expect(listMatches(db, me)).toEqual(listMatches(db, me));
    expect(listMatches(db, me).matches).toHaveLength(1);
  });
});

// Property-style test: hammer the service with random swipes by random users, then check that
// matches are EXACTLY the set of mutual likes, and that every swipe response agreed.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('matching under random activity', () => {
  it('matches exactly the mutual-like pairs, and no swipe response ever disagrees', () => {
    const { db } = makeSeededDb();
    const users = db.prepare('SELECT id FROM profiles').all().map((r) => r.id);
    const rand = mulberry32(20261118);
    const likedBy = (a, b) => !!db.prepare(`SELECT 1 FROM swipes WHERE swiper_id = ? AND target_id = ? AND action = 'like'`).get(a, b);
    let firstTimeLikes = 0, matchedResponses = 0;

    for (let i = 0; i < 600; i++) {
      const who = users[Math.floor(rand() * users.length)];
      const target = users[Math.floor(rand() * users.length)];
      const action = rand() < 0.6 ? 'like' : 'pass';
      const reverseLiked = likedBy(target, who);
      let result;
      try {
        result = swipe(db, who, { profileId: target, action });
      } catch (e) {
        expect(['CANNOT_SWIPE_SELF', 'ALREADY_SWIPED']).toContain(e.code);   // only legitimate refusals
        continue;
      }
      if (!result.alreadySwiped && action === 'like') {
        firstTimeLikes++;
        expect(result.matched).toBe(reverseLiked);       // match iff the other side had already liked
        if (result.matched) matchedResponses++;
      } else if (!result.alreadySwiped) {
        expect(result.matched).toBe(false);              // a pass never matches
      }
    }
    expect(firstTimeLikes).toBeGreaterThan(50);          // the test actually exercised something
    expect(matchedResponses).toBeGreaterThan(5);

    const mutual = db.prepare(`
      SELECT s1.swiper_id AS a, s1.target_id AS b FROM swipes s1
      JOIN swipes s2 ON s2.swiper_id = s1.target_id AND s2.target_id = s1.swiper_id
      WHERE s1.action = 'like' AND s2.action = 'like' AND s1.swiper_id < s1.target_id
      ORDER BY a, b`).all().map((r) => `${r.a}-${r.b}`);
    const matches = db.prepare('SELECT user_a_id AS a, user_b_id AS b FROM matches ORDER BY a, b')
      .all().map((r) => `${r.a}-${r.b}`);
    expect(matches).toEqual(mutual);
    expect(matches).toHaveLength(matchedResponses);

    for (const u of users) {        // every user's listing is exactly their mutual likes
      const expected = mutual.filter((p) => p.split('-').map(Number).includes(u)).length;
      expect(listMatches(db, u).matches).toHaveLength(expected);
    }
  });

  it('can never be tricked into a false match by repeated or conflicting swipes', () => {
    const { db, me } = makeSeededDb();
    const x = idBySlug(db, 'rohan');
    pass(db, me, x);
    for (let i = 0; i < 5; i++) {
      expectAppError(() => like(db, me, x), 'ALREADY_SWIPED');
      expect(pass(db, me, x).alreadySwiped).toBe(true);
    }
    like(db, x, me);                      // they like me after I passed
    expect(count(db, 'matches')).toBe(0);
    expect(listMatches(db, me).matches).toEqual([]);
  });
});
