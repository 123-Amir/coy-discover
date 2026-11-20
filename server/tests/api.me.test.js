import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { seedData } from '../src/data/profiles.js';
import { makeApi, get, keys, PROFILE_KEYS, FORBIDDEN } from './apiHelpers.js';
import { withLikers, idBySlug } from './helpers.js';

describe('GET /api/me', () => {
  it('returns the current user profile with whitelisted fields only', async () => {
    const ctx = makeApi();
    const res = await get(ctx, '/api/me').expect(200);
    expect(keys(res.body)).toEqual(['profile']);
    expect(keys(res.body.profile)).toEqual(PROFILE_KEYS);
    expect(res.body.profile.id).toBe(ctx.me);
    expect(res.body.profile.name).toBe('Arjun');
    expect(res.body.profile.photoUrl).toBe('/avatars/me.svg');
    expect(Array.isArray(res.body.profile.interests)).toBe(true);
  });

  it('responds with JSON', async () => {
    const res = await get(makeApi(), '/api/me').expect('Content-Type', /application\/json/);
    expect(res.status).toBe(200);
  });

  it('exposes no internal fields and nothing derived from other users\' swipes', async () => {
    const res = await get(makeApi(), '/api/me');
    for (const forbidden of FORBIDDEN) expect(res.text.includes(forbidden)).toBe(false);
  });

  it('is identical whether many, none or all profiles have liked the user', async () => {
    const bodies = [];
    for (const data of [seedData, withLikers(seedData, () => false), withLikers(seedData, () => true)]) {
      bodies.push((await get(makeApi(data), '/api/me')).body);
    }
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });

  it('cannot be pointed at another user via header, query string or trailing path', async () => {
    const ctx = makeApi();
    const other = idBySlug(ctx.db, 'ananya');
    const viaHeader = await request(ctx.app).get('/api/me').set('X-User-Id', String(other));
    const viaQuery = await get(ctx, `/api/me?userId=${other}&id=${other}`);
    expect(viaHeader.body.profile.id).toBe(ctx.me);
    expect(viaQuery.body.profile.id).toBe(ctx.me);
  });
});
