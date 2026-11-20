import { describe, it, expect } from 'vitest';
import { seedData } from '../src/data/profiles.js';
import { swipe } from '../src/services/swipeService.js';
import { makeApi, get, postSwipe, postRaw, expectError, FORBIDDEN } from './apiHelpers.js';
import { withLikers, idBySlug } from './helpers.js';

const likerSlugs = new Set(seedData.profiles.filter((p) => p.likesCurrentUser).map((p) => p.slug));
const slugOf = (ctx, id) => ctx.db.prepare('SELECT slug FROM profiles WHERE id = ?').get(id).slug;

/**
 * The core promise, tested over HTTP. Build worlds that differ ONLY in how other users feel about
 * the current user, run an identical script of requests in each, and require every status code,
 * header and body to be identical. Liking someone who liked you is the one thing that may differ,
 * so the script passes on everyone who liked the user in the default world.
 */
async function runScript(ctx) {
  const log = [];
  const rec = (label, res) => log.push(JSON.stringify({ label, status: res.status, cache: res.headers['cache-control'], body: res.body }));

  rec('me', await get(ctx, '/api/me'));
  const feed = await get(ctx, '/api/feed?limit=50');
  rec('feed', feed);
  rec('matches', await get(ctx, '/api/matches'));

  for (const [i, p] of feed.body.profiles.entries()) {
    const action = likerSlugs.has(slugOf(ctx, p.id)) ? 'pass' : 'like';
    rec(`swipe-${p.id}`, await postSwipe(ctx, { profileId: p.id, action }));
    if (i % 8 === 0) rec(`feed-${i}`, await get(ctx, '/api/feed?limit=50'));
  }
  const first = feed.body.profiles[0].id;
  rec('dup-like', await postSwipe(ctx, { profileId: first, action: 'like' }));
  rec('dup-pass', await postSwipe(ctx, { profileId: first, action: 'pass' }));
  rec('bad-action', await postSwipe(ctx, { profileId: first, action: 'LIKE' }));
  rec('bad-id', await postSwipe(ctx, { profileId: 99999, action: 'like' }));
  rec('bad-json', await postRaw(ctx, '{"profileId":'));
  rec('feed-final', await get(ctx, '/api/feed'));
  rec('matches-final', await get(ctx, '/api/matches'));
  return log;
}

describe('API privacy: other users\' feelings are invisible', () => {
  const nobodyLikedMe = () => makeApi(withLikers(seedData, () => false));
  const everyonePassedMe = () => {
    const ctx = makeApi(withLikers(seedData, () => false));
    for (const { id } of ctx.db.prepare('SELECT id FROM profiles WHERE id != ?').all(ctx.me)) {
      swipe(ctx.db, id, { profileId: ctx.me, action: 'pass' });
    }
    return ctx;
  };

  it('produces identical responses whether people liked me, passed on me, or never swiped', async () => {
    const baseline = await runScript(makeApi());
    expect(await runScript(nobodyLikedMe())).toEqual(baseline);
    expect(await runScript(everyonePassedMe())).toEqual(baseline);
  });

  it('never reports a match in those sessions', async () => {
    for (const ctx of [makeApi(), nobodyLikedMe(), everyonePassedMe()]) {
      const log = await runScript(ctx);
      expect(log.some((entry) => entry.includes('"matched":true'))).toBe(false);
      expect(log[log.length - 1].includes('"matches":[]')).toBe(true);
    }
  });

  it('gives the same outcome for liking someone who passed on me as for liking someone who never swiped', async () => {
    const ctx = makeApi();
    const passer = idBySlug(ctx.db, 'rohan');
    const silent = idBySlug(ctx.db, 'ishita');
    swipe(ctx.db, passer, { profileId: ctx.me, action: 'pass' });
    const a = await postSwipe(ctx, { profileId: passer, action: 'like' });
    const b = await postSwipe(ctx, { profileId: silent, action: 'like' });
    expect(a.status).toBe(b.status);
    expect({ ...a.body, swipe: null }).toEqual({ ...b.body, swipe: null });
  });

  it('gives the same ALREADY_SWIPED error whether or not the other person liked me', async () => {
    const ctx = makeApi();
    const outcome = async (slug) => {
      const id = idBySlug(ctx.db, slug);
      await postSwipe(ctx, { profileId: id, action: 'pass' });
      const res = await postSwipe(ctx, { profileId: id, action: 'like' });
      return [res.status, res.body];
    };
    const [liker, nonLiker] = [await outcome('ananya'), await outcome('rohan')];
    expect(liker[0]).toBe(409);
    expect(liker).toEqual(nonLiker);                  // same status AND same body
    expectError({ status: liker[0], body: liker[1] }, 409, 'ALREADY_SWIPED');
  });
});

describe('API privacy: nothing reveals incoming likes', () => {
  it('reveals a match only when the user likes someone who already liked them', async () => {
    const ctx = makeApi();
    for (const p of (await get(ctx, '/api/feed?limit=50')).body.profiles) {
      const res = await postSwipe(ctx, { profileId: p.id, action: 'like' });
      expect(res.body.matched).toBe(likerSlugs.has(slugOf(ctx, p.id)));
      expect(res.body.match === null).toBe(!res.body.matched);
    }
    const ids = (await get(ctx, '/api/matches')).body.matches.map((m) => m.profile.id).sort((a, b) => a - b);
    expect(ids).toEqual([...likerSlugs].map((s) => idBySlug(ctx.db, s)).sort((a, b) => a - b));
  });

  it('keeps passed-on admirers hidden forever: they never reappear and never match', async () => {
    const ctx = makeApi();
    const likers = [...likerSlugs].map((s) => idBySlug(ctx.db, s));
    for (const id of likers) await postSwipe(ctx, { profileId: id, action: 'pass' }).expect(200);
    const feed = (await get(ctx, '/api/feed?limit=50')).body.profiles.map((p) => p.id);
    for (const id of likers) expect(feed).not.toContain(id);
    for (const id of likers) expectError(await postSwipe(ctx, { profileId: id, action: 'like' }), 409, 'ALREADY_SWIPED');
    expect((await get(ctx, '/api/matches')).body.matches).toEqual([]);
  });

  it('exposes no like-derived or internal field in any response of a full session', async () => {
    const ctx = makeApi();
    const texts = [(await get(ctx, '/api/me')).text, (await get(ctx, '/api/feed?limit=50')).text];
    for (const p of (await get(ctx, '/api/feed?limit=50')).body.profiles) {
      texts.push((await postSwipe(ctx, { profileId: p.id, action: 'like' })).text);
    }
    texts.push((await get(ctx, '/api/matches')).text);
    const all = texts.join('\n');
    for (const forbidden of FORBIDDEN) expect(all.includes(forbidden)).toBe(false);
  });

  it('offers no endpoint that could list admirers, swipes or other users', async () => {
    const ctx = makeApi();
    const paths = ['/api/likes', '/api/likes/incoming', '/api/likes-you', '/api/admirers', '/api/me/likes',
      '/api/me/swipes', '/api/swipes', '/api/profiles', '/api/profiles/2', '/api/users', '/api/users/2',
      '/api/feed/likes', '/api/matches/pending', '/api/admin'];
    for (const path of paths) expectError(await get(ctx, path), 404, 'NOT_FOUND');
  });
});
