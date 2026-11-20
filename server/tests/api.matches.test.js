import { describe, it, expect } from 'vitest';
import { makeApi, get, postSwipe, keys, PROFILE_KEYS, MATCH_KEYS, FORBIDDEN } from './apiHelpers.js';
import { idBySlug } from './helpers.js';

const like = (ctx, slug) => postSwipe(ctx, { profileId: idBySlug(ctx.db, slug), action: 'like' });
const pass = (ctx, slug) => postSwipe(ctx, { profileId: idBySlug(ctx.db, slug), action: 'pass' });

describe('GET /api/matches', () => {
  it('is empty before any swipe, even though some profiles have already liked the user', async () => {
    const res = await get(makeApi(), '/api/matches').expect(200).expect('Content-Type', /application\/json/);
    expect(res.body).toEqual({ matches: [] });
  });

  it('lists only mutual likes', async () => {
    const ctx = makeApi();
    await like(ctx, 'ananya');   // liked me first -> mutual
    await pass(ctx, 'kabir');    // liked me first, but I pass
    await like(ctx, 'rohan');    // never liked me
    const res = await get(ctx, '/api/matches').expect(200);
    expect(res.body.matches.map((m) => m.profile.name)).toEqual(['Ananya']);
  });

  it('never lists a one-sided like, in either direction', async () => {
    const ctx = makeApi();
    await like(ctx, 'rohan');   // my like, unreturned (and ananya's like to me is unreturned too)
    expect((await get(ctx, '/api/matches')).body.matches).toEqual([]);
  });

  it('returns whitelisted fields only, with an ISO timestamp', async () => {
    const ctx = makeApi();
    await like(ctx, 'ananya');
    const res = await get(ctx, '/api/matches');
    const [m] = res.body.matches;
    expect(keys(m)).toEqual(MATCH_KEYS);
    expect(keys(m.profile)).toEqual(PROFILE_KEYS);
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(m.matchedAt)).toBe(true);
    for (const forbidden of FORBIDDEN) expect(res.text.includes(forbidden)).toBe(false);
  });

  it('lists newest matches first', async () => {
    const ctx = makeApi();
    for (const slug of ['ananya', 'kabir', 'meera']) await like(ctx, slug);
    const names = (await get(ctx, '/api/matches')).body.matches.map((m) => m.profile.name);
    expect(names).toEqual(['Meera', 'Kabir', 'Ananya']);
  });

  it('returns the same list on every request (it is read from the database)', async () => {
    const ctx = makeApi();
    await like(ctx, 'ananya');
    const a = await get(ctx, '/api/matches');
    const b = await get(ctx, '/api/matches');
    expect(b.body).toEqual(a.body);
  });
});
