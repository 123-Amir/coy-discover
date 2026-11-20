import { describe, it, expect } from 'vitest';
import { createDb } from '../src/db/connection.js';
import { seedData } from '../src/data/profiles.js';
import { swipe } from '../src/services/swipeService.js';
import { listMatches } from '../src/services/matchService.js';
import { makeSeededDb, idBySlug, count, dump, expectAppError } from './helpers.js';

const LIKER = 'ananya';    // pre-liked the user in the seed
const NON_LIKER = 'rohan';  // did not
const RESULT_KEYS = ['alreadySwiped', 'match', 'matched', 'swipe'];
const MATCH_KEYS = ['id', 'matchedAt', 'profile'];
const PROFILE_KEYS = ['age', 'bio', 'city', 'college', 'id', 'interests', 'name', 'photoUrl'];

function setup() {
  const { db, me } = makeSeededDb();
  return { db, me, liker: idBySlug(db, LIKER), nonLiker: idBySlug(db, NON_LIKER) };
}

describe('swipe: recording likes and passes', () => {
  it('records a like on someone who has not liked back: no match', () => {
    const { db, me, nonLiker } = setup();
    const before = count(db, 'swipes');
    const result = swipe(db, me, { profileId: nonLiker, action: 'like' });
    expect(result).toEqual({
      swipe: { profileId: nonLiker, action: 'like' }, matched: false, match: null, alreadySwiped: false,
    });
    expect(count(db, 'swipes')).toBe(before + 1);
    expect(count(db, 'matches')).toBe(0);
  });

  it('records a pass', () => {
    const { db, me, nonLiker } = setup();
    const result = swipe(db, me, { profileId: nonLiker, action: 'pass' });
    expect(result).toEqual({
      swipe: { profileId: nonLiker, action: 'pass' }, matched: false, match: null, alreadySwiped: false,
    });
    expect(db.prepare('SELECT action FROM swipes WHERE swiper_id = ? AND target_id = ?').get(me, nonLiker).action).toBe('pass');
  });

  it('uses the server-supplied user, ignoring any swiper/user fields in the body', () => {
    const { db, me, nonLiker } = setup();
    const other = idBySlug(db, 'ishita');
    swipe(db, me, { profileId: nonLiker, action: 'like', swiperId: other, userId: other, matched: true });
    expect(db.prepare('SELECT swiper_id FROM swipes WHERE target_id = ? AND swiper_id IN (?, ?)').all(nonLiker, me, other))
      .toEqual([{ swiper_id: me }]);
  });
});

describe('swipe: matching only on mutual likes', () => {
  it('creates a match when liking someone who already liked the user', () => {
    const { db, me, liker } = setup();
    const result = swipe(db, me, { profileId: liker, action: 'like' });
    expect(Object.keys(result).sort()).toEqual(RESULT_KEYS);
    expect(result.matched).toBe(true);
    expect(Object.keys(result.match).sort()).toEqual(MATCH_KEYS);
    expect(Object.keys(result.match.profile).sort()).toEqual(PROFILE_KEYS);
    expect(result.match.profile.id).toBe(liker);
    expect(result.match.profile.name).toBe('Ananya');
    expect(count(db, 'matches')).toBe(1);
    const row = db.prepare('SELECT user_a_id, user_b_id FROM matches').get();
    expect(row.user_a_id < row.user_b_id).toBe(true);
  });

  it('does not match when the user passes on someone who liked them', () => {
    const { db, me, liker } = setup();
    expect(swipe(db, me, { profileId: liker, action: 'pass' }).matched).toBe(false);
    expect(count(db, 'matches')).toBe(0);
  });

  it('matches in either order: user likes first, the other likes second', () => {
    const { db, me, nonLiker } = setup();
    expect(swipe(db, me, { profileId: nonLiker, action: 'like' }).matched).toBe(false);
    const second = swipe(db, nonLiker, { profileId: me, action: 'like' });
    expect(second.matched).toBe(true);
    expect(second.match.profile.id).toBe(me);
    expect(listMatches(db, me).matches.map((m) => m.profile.id)).toEqual([nonLiker]);
    expect(listMatches(db, nonLiker).matches.map((m) => m.profile.id)).toEqual([me]);
    expect(count(db, 'matches')).toBe(1);
  });

  it('does not match when one side liked and the other passed, in either order', () => {
    const { db, me, nonLiker } = setup();
    const other = idBySlug(db, 'ishita');
    swipe(db, nonLiker, { profileId: me, action: 'pass' });
    expect(swipe(db, me, { profileId: nonLiker, action: 'like' }).matched).toBe(false);
    swipe(db, me, { profileId: other, action: 'like' });
    expect(swipe(db, other, { profileId: me, action: 'pass' }).matched).toBe(false);
    expect(count(db, 'matches')).toBe(0);
  });

  it('stores the pair in canonical order even when the swiper has the larger id', () => {
    const db = createDb(':memory:');
    const ins = db.prepare(`INSERT INTO profiles (slug, name, age, bio, city, photo_url, is_current_user)
                            VALUES (?, ?, 22, 'b', 'c', '/avatars/x.svg', ?)`);
    const other = ins.run('other', 'Other', 0).lastInsertRowid;  // id 1
    const me = ins.run('me', 'Me', 1).lastInsertRowid;           // id 2
    db.prepare(`INSERT INTO swipes (swiper_id, target_id, action) VALUES (?, ?, 'like')`).run(other, me);
    expect(swipe(db, Number(me), { profileId: Number(other), action: 'like' }).matched).toBe(true);
    expect(db.prepare('SELECT user_a_id, user_b_id FROM matches').get()).toEqual({ user_a_id: Number(other), user_b_id: Number(me) });
  });
});

describe('swipe: duplicate requests are idempotent', () => {
  it('treats an identical repeated like as a no-op that returns the same outcome', () => {
    const { db, me, nonLiker } = setup();
    const first = swipe(db, me, { profileId: nonLiker, action: 'like' });
    const swipesAfterFirst = count(db, 'swipes');
    const second = swipe(db, me, { profileId: nonLiker, action: 'like' });
    expect(first.alreadySwiped).toBe(false);
    expect(second).toEqual({ ...first, alreadySwiped: true });
    expect(count(db, 'swipes')).toBe(swipesAfterFirst);
  });

  it('treats an identical repeated pass as a no-op', () => {
    const { db, me, nonLiker } = setup();
    swipe(db, me, { profileId: nonLiker, action: 'pass' });
    const n = count(db, 'swipes');
    const again = swipe(db, me, { profileId: nonLiker, action: 'pass' });
    expect(again.alreadySwiped).toBe(true);
    expect(again.matched).toBe(false);
    expect(count(db, 'swipes')).toBe(n);
  });

  it('returns the same match again for a repeated like on a mutual profile', () => {
    const { db, me, liker } = setup();
    const first = swipe(db, me, { profileId: liker, action: 'like' });
    const second = swipe(db, me, { profileId: liker, action: 'like' });
    expect(second.alreadySwiped).toBe(true);
    expect(second.matched).toBe(true);
    expect(second.match).toEqual(first.match);
    expect(count(db, 'matches')).toBe(1);
  });

  it('survives 20 rapid identical requests: one swipe row, one match', () => {
    const { db, me, liker } = setup();
    const swipesBefore = count(db, 'swipes');
    const results = Array.from({ length: 20 }, () => swipe(db, me, { profileId: liker, action: 'like' }));
    expect(results.filter((r) => !r.alreadySwiped)).toHaveLength(1);
    expect(results.every((r) => r.matched)).toBe(true);
    expect(new Set(results.map((r) => r.match.id)).size).toBe(1);
    expect(count(db, 'swipes')).toBe(swipesBefore + 1);
    expect(count(db, 'matches')).toBe(1);
  });
});

describe('swipe: conflicting repeat swipes are rejected', () => {
  it('rejects like after pass with ALREADY_SWIPED and changes nothing', () => {
    const { db, me, liker } = setup();
    swipe(db, me, { profileId: liker, action: 'pass' });
    const snapshot = { s: dump(db, 'swipes'), m: dump(db, 'matches') };
    expectAppError(() => swipe(db, me, { profileId: liker, action: 'like' }), 'ALREADY_SWIPED', 409);
    expect(dump(db, 'swipes')).toEqual(snapshot.s);
    expect(dump(db, 'matches')).toEqual(snapshot.m);
    expect(count(db, 'matches')).toBe(0);   // changing your mind never creates a match
  });

  it('rejects pass after like with ALREADY_SWIPED and keeps an existing match', () => {
    const { db, me, liker } = setup();
    swipe(db, me, { profileId: liker, action: 'like' });
    expectAppError(() => swipe(db, me, { profileId: liker, action: 'pass' }), 'ALREADY_SWIPED', 409);
    expect(listMatches(db, me).matches).toHaveLength(1);
  });
});

describe('swipe: input validation', () => {
  const swipesAtStart = () => { const s = setup(); return { ...s, n: count(s.db, 'swipes') }; };

  it('rejects a body that is not a JSON object with INVALID_BODY', () => {
    const { db, me } = swipesAtStart();
    for (const body of [null, undefined, 'like', 7, true, []]) {
      expectAppError(() => swipe(db, me, body), 'INVALID_BODY', 400);
    }
  });

  it('rejects missing fields with INVALID_BODY', () => {
    const { db, me, nonLiker } = swipesAtStart();
    expectAppError(() => swipe(db, me, {}), 'INVALID_BODY', 400);
    expectAppError(() => swipe(db, me, { action: 'like' }), 'INVALID_BODY', 400);
    expectAppError(() => swipe(db, me, { profileId: nonLiker }), 'INVALID_BODY', 400);
  });

  it('rejects non-positive-integer profile ids with INVALID_PROFILE_ID (no coercion)', () => {
    const { db, me } = swipesAtStart();
    for (const profileId of [0, -1, 1.5, '7', '', null, NaN, Infinity, true, [], {}, 2 ** 53]) {
      expectAppError(() => swipe(db, me, { profileId, action: 'like' }), 'INVALID_PROFILE_ID', 400);
    }
  });

  it('rejects anything but exactly "like" or "pass" with INVALID_ACTION', () => {
    const { db, me, nonLiker } = swipesAtStart();
    for (const action of ['LIKE', 'Pass', 'superlike', '', ' like', null, 1, true, ['like'], {}]) {
      expectAppError(() => swipe(db, me, { profileId: nonLiker, action }), 'INVALID_ACTION', 400);
    }
  });

  it('rejects swiping on yourself with CANNOT_SWIPE_SELF', () => {
    const { db, me } = swipesAtStart();
    expectAppError(() => swipe(db, me, { profileId: me, action: 'like' }), 'CANNOT_SWIPE_SELF', 400);
  });

  it('rejects a nonexistent profile with PROFILE_NOT_FOUND', () => {
    const { db, me } = swipesAtStart();
    expectAppError(() => swipe(db, me, { profileId: 99999, action: 'like' }), 'PROFILE_NOT_FOUND', 404);
  });

  it('treats SQL-injection attempts as plain invalid input and leaves the database intact', () => {
    const { db, me, nonLiker } = swipesAtStart();
    const profiles = count(db, 'profiles');
    expectAppError(() => swipe(db, me, { profileId: '1 OR 1=1', action: 'like' }), 'INVALID_PROFILE_ID');
    expectAppError(() => swipe(db, me, { profileId: "1; DROP TABLE swipes;--", action: 'like' }), 'INVALID_PROFILE_ID');
    expectAppError(() => swipe(db, me, { profileId: nonLiker, action: "like'; DROP TABLE swipes;--" }), 'INVALID_ACTION');
    expect(count(db, 'profiles')).toBe(profiles);
    expect(count(db, 'swipes') >= 0).toBe(true);   // table still exists (throws otherwise)
  });

  it('writes nothing for any rejected request', () => {
    const { db, me, nonLiker, n } = swipesAtStart();
    const bad = [null, {}, { profileId: 0, action: 'like' }, { profileId: nonLiker, action: 'x' },
      { profileId: me, action: 'like' }, { profileId: 99999, action: 'like' }];
    for (const body of bad) expect(() => swipe(db, me, body)).toThrow();
    expect(count(db, 'swipes')).toBe(n);
    expect(count(db, 'matches')).toBe(0);
  });
});

describe('swipe: atomicity', () => {
  it('rolls the swipe back if creating the match fails', () => {
    const { db, me, liker } = setup();
    const n = count(db, 'swipes');
    db.exec(`CREATE TRIGGER zz_force_failure BEFORE INSERT ON matches
             BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`);
    expect(() => swipe(db, me, { profileId: liker, action: 'like' })).toThrow(/simulated failure/);
    expect(count(db, 'swipes')).toBe(n);       // the like was NOT left behind
    expect(count(db, 'matches')).toBe(0);

    db.exec('DROP TRIGGER zz_force_failure');
    const retry = swipe(db, me, { profileId: liker, action: 'like' });   // clean retry works
    expect(retry.matched).toBe(true);
    expect(retry.alreadySwiped).toBe(false);
  });
});
