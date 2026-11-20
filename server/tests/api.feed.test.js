import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { seedData } from '../src/data/profiles.js';
import { makeApi, get, postSwipe, keys, expectError, PROFILE_KEYS, FORBIDDEN } from './apiHelpers.js';
import { withLikers, idBySlug } from './helpers.js';

const TOTAL = seedData.profiles.length;
const ids = (res) => res.body.profiles.map((p) => p.id);

describe('GET /api/feed: success', () => {
  it('returns { profiles } with 10 profiles by default', async () => {
    const res = await get(makeApi(), '/api/feed').expect(200).expect('Content-Type', /application\/json/);
    expect(keys(res.body)).toEqual(['profiles']);
    expect(res.body.profiles).toHaveLength(10);
  });

  it('honours the limit parameter', async () => {
    const ctx = makeApi();
    expect((await get(ctx, '/api/feed?limit=1')).body.profiles).toHaveLength(1);
    expect((await get(ctx, '/api/feed?limit=7')).body.profiles).toHaveLength(7);
    expect((await get(ctx, '/api/feed?limit=007')).body.profiles).toHaveLength(7);
    expect((await get(ctx, '/api/feed?limit=50')).body.profiles).toHaveLength(TOTAL);
  });

  it('never includes the current user', async () => {
    const ctx = makeApi();
    expect(ids(await get(ctx, '/api/feed?limit=50'))).not.toContain(ctx.me);
  });

  it('returns exactly the public profile fields and nothing else', async () => {
    const res = await get(makeApi(), '/api/feed?limit=50');
    for (const p of res.body.profiles) {
      expect(keys(p)).toEqual(PROFILE_KEYS);
      expect(p.photoUrl.startsWith('/avatars/')).toBe(true);
    }
  });

  it('exposes no internal fields and nothing about incoming likes', async () => {
    const res = await get(makeApi(), '/api/feed?limit=50');
    for (const forbidden of FORBIDDEN) expect(res.text.includes(forbidden)).toBe(false);
  });
});

describe('GET /api/feed: invalid input', () => {
  it('rejects bad limit values with 400 INVALID_LIMIT', async () => {
    const ctx = makeApi();
    const bad = ['limit=abc', 'limit=0', 'limit=51', 'limit=-1', 'limit=1.5', 'limit=1e1', 'limit=',
      'limit=%205', 'limit=0x10', 'limit=1&limit=2', 'limit[]=5', 'limit=99999999999999999999'];
    for (const q of bad) expectError(await get(ctx, `/api/feed?${q}`), 400, 'INVALID_LIMIT');
  });

  it('ignores unknown query parameters, including attempts to pick the user', async () => {
    const ctx = makeApi();
    const plain = await get(ctx, '/api/feed?limit=50');
    const sneaky = await get(ctx, `/api/feed?limit=50&userId=${idBySlug(ctx.db, 'ananya')}&likedYou=true&sort=likes`);
    const viaHeader = await request(ctx.app).get('/api/feed?limit=50').set('X-User-Id', '5');
    expect(ids(sneaky)).toEqual(ids(plain));
    expect(ids(viaHeader)).toEqual(ids(plain));
  });
});

describe('GET /api/feed: swiped profiles never come back', () => {
  it('excludes profiles after they are liked or passed', async () => {
    const ctx = makeApi();
    const liked = idBySlug(ctx.db, 'rohan');
    const passed = idBySlug(ctx.db, 'ananya');
    await postSwipe(ctx, { profileId: liked, action: 'like' }).expect(200);
    await postSwipe(ctx, { profileId: passed, action: 'pass' }).expect(200);
    const feed = ids(await get(ctx, '/api/feed?limit=50'));
    expect(feed).not.toContain(liked);
    expect(feed).not.toContain(passed);
    expect(feed).toHaveLength(TOTAL - 2);
  });

  it('shows every profile exactly once across a full session, then an empty feed', async () => {
    const ctx = makeApi();
    const shown = [];
    for (let guard = 0; guard < 100; guard++) {
      const { profiles } = (await get(ctx, '/api/feed?limit=3')).body;
      if (profiles.length === 0) break;
      for (const p of profiles) {
        shown.push(p.id);
        await postSwipe(ctx, { profileId: p.id, action: shown.length % 2 ? 'like' : 'pass' }).expect(200);
      }
    }
    expect(shown).toHaveLength(TOTAL);
    expect(new Set(shown).size).toBe(TOTAL);
    const empty = await get(ctx, '/api/feed').expect(200);
    expect(empty.body).toEqual({ profiles: [] });
  });
});

describe('GET /api/feed: ordering is independent of incoming likes', () => {
  it('is identical whether the default set, nobody or everybody has liked the user', async () => {
    const orders = [];
    for (const data of [seedData, withLikers(seedData, () => false), withLikers(seedData, () => true)]) {
      orders.push(ids(await get(makeApi(data), '/api/feed?limit=50')));
    }
    expect(orders[1]).toEqual(orders[0]);
    expect(orders[2]).toEqual(orders[0]);
  });

  it('is stable between requests and only loses swiped profiles', async () => {
    const ctx = makeApi();
    const first = ids(await get(ctx, '/api/feed?limit=50'));
    expect(ids(await get(ctx, '/api/feed?limit=50'))).toEqual(first);
    await postSwipe(ctx, { profileId: first[0], action: 'pass' });
    expect(ids(await get(ctx, '/api/feed?limit=50'))).toEqual(first.slice(1));
  });
});
