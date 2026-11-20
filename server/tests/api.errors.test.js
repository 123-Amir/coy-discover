import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createDb } from '../src/db/connection.js';
import { createApp } from '../src/app.js';
import { makeApi, get, postSwipe, postRaw, expectError } from './apiHelpers.js';
import { idBySlug, count } from './helpers.js';

describe('404 handling', () => {
  it('returns a JSON 404 NOT_FOUND for unknown routes, paths and methods', async () => {
    const ctx = makeApi();
    const probes = [get(ctx, '/api/nope'), get(ctx, '/nope'), get(ctx, '/'), get(ctx, '/api/feed/extra'),
      request(ctx.app).post('/api/feed').send({}), get(ctx, '/api/swipe'),
      request(ctx.app).put('/api/matches').send({}), request(ctx.app).delete('/api/me')];
    for (const res of await Promise.all(probes)) {
      expectError(res, 404, 'NOT_FOUND');
      expect(res.body.error.message).toBe('Route not found');
    }
  });

  it('does not echo the requested path back (no reflected content)', async () => {
    const res = await get(makeApi(), '/api/%3Cscript%3Ealert(1)%3C/script%3E');
    expect(res.text.includes('script')).toBe(false);
  });
});

describe('500 handling', () => {
  it('returns a generic 500 and never leaks internal error text, then recovers', async () => {
    const ctx = makeApi();
    const n = count(ctx.db, 'swipes');
    ctx.db.exec(`CREATE TRIGGER zz_boom BEFORE INSERT ON swipes
                 BEGIN SELECT RAISE(ABORT, 'secret internal detail about swipes table'); END`);
    const res = await postSwipe(ctx, { profileId: idBySlug(ctx.db, 'rohan'), action: 'like' });
    expectError(res, 500, 'INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Something went wrong');
    for (const leak of ['secret', 'swipes', 'trigger', 'SQL', 'Sqlite', 'stack', ' at ']) {
      expect(res.text.includes(leak)).toBe(false);
    }
    // The real error went to the server log, once, where operators can see it.
    expect(ctx.logged).toHaveLength(1);
    expect(ctx.logged[0].some((a) => a instanceof Error && /secret internal detail/.test(a.message))).toBe(true);
    expect(count(ctx.db, 'swipes')).toBe(n);            // nothing half-written

    ctx.db.exec('DROP TRIGGER zz_boom');                // the server keeps working afterwards
    await postSwipe(ctx, { profileId: idBySlug(ctx.db, 'rohan'), action: 'like' }).expect(200);
  });

  it('returns a generic 500 on GET endpoints when the database is unavailable', async () => {
    const ctx = makeApi();
    ctx.db.close();
    for (const url of ['/api/me', '/api/feed', '/api/matches']) {
      const res = await get(ctx, url);
      expectError(res, 500, 'INTERNAL_ERROR');
      expect(res.body.error.message).toBe('Something went wrong');
    }
    expect(ctx.logged.length).toBe(3);
  });
});

describe('error format and response headers', () => {
  it('every error response has the same { error: { code, message } } shape', async () => {
    const ctx = makeApi();
    const rohan = idBySlug(ctx.db, 'rohan');
    await postSwipe(ctx, { profileId: rohan, action: 'pass' });
    const cases = [
      [await get(ctx, '/api/feed?limit=0'), 400, 'INVALID_LIMIT'],
      [await postSwipe(ctx, {}), 400, 'INVALID_BODY'],
      [await postSwipe(ctx, { profileId: 'x', action: 'like' }), 400, 'INVALID_PROFILE_ID'],
      [await postSwipe(ctx, { profileId: rohan, action: 'nope' }), 400, 'INVALID_ACTION'],
      [await postSwipe(ctx, { profileId: ctx.me, action: 'like' }), 400, 'CANNOT_SWIPE_SELF'],
      [await postSwipe(ctx, { profileId: 99999, action: 'like' }), 404, 'PROFILE_NOT_FOUND'],
      [await postSwipe(ctx, { profileId: rohan, action: 'like' }), 409, 'ALREADY_SWIPED'],
      [await get(ctx, '/api/unknown'), 404, 'NOT_FOUND'],
    ];
    for (const [res, status, code] of cases) expectError(res, status, code);
  });

  it('sends no-store, nosniff and JSON headers, and hides the framework, on every kind of response', async () => {
    const ctx = makeApi();
    const responses = [
      await get(ctx, '/api/me'), await get(ctx, '/api/feed'), await get(ctx, '/api/matches'),
      await postSwipe(ctx, { profileId: idBySlug(ctx.db, 'rohan'), action: 'like' }),
      await get(ctx, '/api/feed?limit=0'),   // 400
      await get(ctx, '/nope'),               // 404
      await postRaw(ctx, '{"profileId":'),   // 400 from the body parser
    ];
    for (const res of responses) {
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['etag']).toBeUndefined();
      expect(/application\/json/.test(res.headers['content-type'])).toBe(true);
    }
  });
});

describe('createApp()', () => {
  it('refuses to start against a database with no current user', () => {
    const db = createDb(':memory:');   // schema only, not seeded
    expect(() => createApp({ db })).toThrow(/exactly one current user/);
  });
});
