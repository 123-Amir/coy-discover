import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApi, get } from './apiHelpers.js';
import { idBySlug } from './helpers.js';

describe('assignment API paths', () => {
  it('serves feed and matches at the exact assignment paths', async () => {
    const ctx = makeApi();
    const feed = await get(ctx, '/feed').expect(200);
    const matches = await get(ctx, '/matches').expect(200);

    expect(Array.isArray(feed.body.profiles)).toBe(true);
    expect(Array.isArray(matches.body.matches)).toBe(true);
  });

  it('records swipes at the exact assignment path', async () => {
    const ctx = makeApi();
    const profileId = idBySlug(ctx.db, 'ananya');
    const response = await request(ctx.app)
      .post('/swipe')
      .send({ profileId, action: 'pass' })
      .expect(200);

    expect(response.body.swipe).toMatchObject({ profileId, action: 'pass' });
    expect(response.body.matched).toBe(false);
  });
});
