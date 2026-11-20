import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApi, get, postSwipe, postRaw, keys, expectError, PROFILE_KEYS, MATCH_KEYS, SWIPE_RESULT_KEYS } from './apiHelpers.js';
import { idBySlug, count, dump } from './helpers.js';

const LIKER = 'ananya';    // pre-liked the user in the seed
const NON_LIKER = 'rohan';  // did not

function setup() {
  const ctx = makeApi();
  return { ...ctx, liker: idBySlug(ctx.db, LIKER), nonLiker: idBySlug(ctx.db, NON_LIKER) };
}

describe('POST /api/swipe: success', () => {
  it('records a like on someone who has not liked back: 200, no match', async () => {
    const ctx = setup();
    const before = count(ctx.db, 'swipes');
    const res = await postSwipe(ctx, { profileId: ctx.nonLiker, action: 'like' })
      .expect(200).expect('Content-Type', /application\/json/);
    expect(res.body).toEqual({
      swipe: { profileId: ctx.nonLiker, action: 'like' }, matched: false, match: null, alreadySwiped: false,
    });
    expect(count(ctx.db, 'swipes')).toBe(before + 1);
    expect(count(ctx.db, 'matches')).toBe(0);
  });

  it('records a pass: 200, no match', async () => {
    const ctx = setup();
    const res = await postSwipe(ctx, { profileId: ctx.nonLiker, action: 'pass' }).expect(200);
    expect(res.body).toEqual({
      swipe: { profileId: ctx.nonLiker, action: 'pass' }, matched: false, match: null, alreadySwiped: false,
    });
  });

  it('accepts a JSON content type with a charset parameter', async () => {
    const ctx = setup();
    const res = await postRaw(ctx, JSON.stringify({ profileId: ctx.nonLiker, action: 'pass' }), 'application/json; charset=utf-8');
    expect(res.status).toBe(200);
  });

  it('ignores unknown body fields, and a body cannot choose who is swiping', async () => {
    const ctx = setup();
    const other = idBySlug(ctx.db, 'ishita');
    await postSwipe(ctx, { profileId: ctx.nonLiker, action: 'like', userId: other, swiperId: other, matched: true }).expect(200);
    const rows = ctx.db.prepare('SELECT swiper_id FROM swipes WHERE target_id = ? AND action = ?').all(ctx.nonLiker, 'like');
    expect(rows).toEqual([{ swiper_id: ctx.me }]);
  });
});

describe('POST /api/swipe: matching', () => {
  it('creates a match when liking someone who already liked the user', async () => {
    const ctx = setup();
    const res = await postSwipe(ctx, { profileId: ctx.liker, action: 'like' }).expect(200);
    expect(keys(res.body)).toEqual(SWIPE_RESULT_KEYS);
    expect(res.body.matched).toBe(true);
    expect(keys(res.body.match)).toEqual(MATCH_KEYS);
    expect(keys(res.body.match.profile)).toEqual(PROFILE_KEYS);
    expect(res.body.match.profile.id).toBe(ctx.liker);
    expect(count(ctx.db, 'matches')).toBe(1);
  });

  it('does not create a match when the user passes on someone who liked them', async () => {
    const ctx = setup();
    const res = await postSwipe(ctx, { profileId: ctx.liker, action: 'pass' }).expect(200);
    expect(res.body.matched).toBe(false);
    expect(res.body.match).toBeNull();
    expect(count(ctx.db, 'matches')).toBe(0);
  });

  it('makes the new match retrievable from GET /api/matches', async () => {
    const ctx = setup();
    const swipeRes = await postSwipe(ctx, { profileId: ctx.liker, action: 'like' });
    const list = await get(ctx, '/api/matches').expect(200);
    expect(list.body.matches).toHaveLength(1);
    expect(list.body.matches[0]).toEqual(swipeRes.body.match);
  });
});

describe('POST /api/swipe: duplicate requests are idempotent', () => {
  it('returns 200 with alreadySwiped: true for an identical repeat, writing nothing', async () => {
    const ctx = setup();
    const first = await postSwipe(ctx, { profileId: ctx.nonLiker, action: 'like' });
    const n = count(ctx.db, 'swipes');
    const second = await postSwipe(ctx, { profileId: ctx.nonLiker, action: 'like' }).expect(200);
    expect(first.body.alreadySwiped).toBe(false);
    expect(second.body).toEqual({ ...first.body, alreadySwiped: true });
    expect(count(ctx.db, 'swipes')).toBe(n);
  });

  it('returns the same match again when a mutual like is repeated', async () => {
    const ctx = setup();
    const first = await postSwipe(ctx, { profileId: ctx.liker, action: 'like' });
    const second = await postSwipe(ctx, { profileId: ctx.liker, action: 'like' }).expect(200);
    expect(second.body.alreadySwiped).toBe(true);
    expect(second.body.match).toEqual(first.body.match);
    expect(count(ctx.db, 'matches')).toBe(1);
  });

  it('survives 20 simultaneous identical requests: one swipe row, one match', async () => {
    const ctx = setup();
    const before = count(ctx.db, 'swipes');
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => postSwipe(ctx, { profileId: ctx.liker, action: 'like' })));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(responses.filter((r) => !r.body.alreadySwiped)).toHaveLength(1);
    expect(responses.every((r) => r.body.matched === true)).toBe(true);
    expect(new Set(responses.map((r) => r.body.match.id)).size).toBe(1);
    expect(count(ctx.db, 'swipes')).toBe(before + 1);
    expect(count(ctx.db, 'matches')).toBe(1);
  });
});

describe('POST /api/swipe: conflicting repeat swipes', () => {
  it('returns 409 ALREADY_SWIPED for like after pass and changes nothing', async () => {
    const ctx = setup();
    await postSwipe(ctx, { profileId: ctx.liker, action: 'pass' }).expect(200);
    const snapshot = { s: dump(ctx.db, 'swipes'), m: dump(ctx.db, 'matches') };
    expectError(await postSwipe(ctx, { profileId: ctx.liker, action: 'like' }), 409, 'ALREADY_SWIPED');
    expect(dump(ctx.db, 'swipes')).toEqual(snapshot.s);
    expect(dump(ctx.db, 'matches')).toEqual(snapshot.m);
  });

  it('returns 409 ALREADY_SWIPED for pass after like and keeps an existing match', async () => {
    const ctx = setup();
    await postSwipe(ctx, { profileId: ctx.liker, action: 'like' }).expect(200);
    expectError(await postSwipe(ctx, { profileId: ctx.liker, action: 'pass' }), 409, 'ALREADY_SWIPED');
    expect((await get(ctx, '/api/matches')).body.matches).toHaveLength(1);
  });
});

describe('POST /api/swipe: invalid requests', () => {
  it('rejects a missing body with 400 INVALID_BODY', async () => {
    const ctx = setup();
    expectError(await request(ctx.app).post('/api/swipe'), 400, 'INVALID_BODY');
  });

  it('rejects empty, array and missing-field bodies with 400 INVALID_BODY', async () => {
    const ctx = setup();
    for (const body of [{}, [], { action: 'like' }, { profileId: ctx.nonLiker }]) {
      expectError(await postSwipe(ctx, body), 400, 'INVALID_BODY');
    }
  });

  it('rejects malformed JSON, and JSON that is not an object, with 400 INVALID_BODY', async () => {
    const ctx = setup();
    for (const raw of ['{"profileId":', '{profileId: 1}', 'not json at all', 'null', '"like"', '42']) {
      const res = await postRaw(ctx, raw);
      expectError(res, 400, 'INVALID_BODY');
      expect(res.body.error.message).toBe('Request body must be valid JSON');
    }
  });

  it('does not read a non-JSON content type as a swipe', async () => {
    const ctx = setup();
    const raw = JSON.stringify({ profileId: ctx.nonLiker, action: 'like' });
    const n = count(ctx.db, 'swipes');
    expectError(await postRaw(ctx, raw, 'text/plain'), 400, 'INVALID_BODY');
    expectError(await postRaw(ctx, raw, 'application/x-www-form-urlencoded'), 400, 'INVALID_BODY');
    expect(count(ctx.db, 'swipes')).toBe(n);
  });

  it('rejects an oversized body with 413 PAYLOAD_TOO_LARGE', async () => {
    const ctx = setup();
    const big = JSON.stringify({ profileId: ctx.nonLiker, action: 'like', padding: 'x'.repeat(20 * 1024) });
    expectError(await postRaw(ctx, big), 413, 'PAYLOAD_TOO_LARGE');
  });

  it('rejects invalid profile ids with 400 INVALID_PROFILE_ID (no coercion)', async () => {
    const ctx = setup();
    for (const profileId of [0, -3, 1.5, '7', '', null, true, [], {}, 1e21]) {
      expectError(await postSwipe(ctx, { profileId, action: 'like' }), 400, 'INVALID_PROFILE_ID');
    }
    expectError(await postRaw(ctx, '{"profileId":9007199254740993,"action":"like"}'), 400, 'INVALID_PROFILE_ID');
  });

  it('rejects anything but exactly "like" or "pass" with 400 INVALID_ACTION', async () => {
    const ctx = setup();
    for (const action of ['LIKE', 'Pass', 'superlike', '', ' like', null, 5, true, ['like'], {}]) {
      expectError(await postSwipe(ctx, { profileId: ctx.nonLiker, action }), 400, 'INVALID_ACTION');
    }
  });

  it('rejects swiping on yourself with 400 CANNOT_SWIPE_SELF', async () => {
    const ctx = setup();
    expectError(await postSwipe(ctx, { profileId: ctx.me, action: 'like' }), 400, 'CANNOT_SWIPE_SELF');
  });

  it('returns 404 PROFILE_NOT_FOUND for a profile that does not exist', async () => {
    const ctx = setup();
    expectError(await postSwipe(ctx, { profileId: 99999, action: 'like' }), 404, 'PROFILE_NOT_FOUND');
  });

  it('treats SQL injection attempts as plain invalid input', async () => {
    const ctx = setup();
    const profiles = count(ctx.db, 'profiles');
    expectError(await postSwipe(ctx, { profileId: '1 OR 1=1', action: 'like' }), 400, 'INVALID_PROFILE_ID');
    expectError(await postSwipe(ctx, { profileId: '1; DROP TABLE swipes;--', action: 'like' }), 400, 'INVALID_PROFILE_ID');
    expectError(await postSwipe(ctx, { profileId: ctx.nonLiker, action: "like'; DROP TABLE swipes;--" }), 400, 'INVALID_ACTION');
    expect(count(ctx.db, 'profiles')).toBe(profiles);
    expect((await get(ctx, '/api/feed')).status).toBe(200);   // tables still intact
  });

  it('writes nothing for any rejected request', async () => {
    const ctx = setup();
    const n = count(ctx.db, 'swipes');
    const bad = [{}, [], { profileId: 0, action: 'like' }, { profileId: ctx.nonLiker, action: 'x' },
      { profileId: ctx.me, action: 'like' }, { profileId: 99999, action: 'like' }];
    for (const body of bad) expect((await postSwipe(ctx, body)).status).toBeGreaterThanOrEqual(400);
    await postRaw(ctx, '{"profileId":');
    expect(count(ctx.db, 'swipes')).toBe(n);
    expect(count(ctx.db, 'matches')).toBe(0);
  });
});
