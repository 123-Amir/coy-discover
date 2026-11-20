import { expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { makeSeededDb } from './helpers.js';

/** A seeded in-memory database wrapped in the real Express app. Errors logged by the app are captured. */
export function makeApi(data) {
  const { db, me } = makeSeededDb(data);
  const logged = [];
  const logger = { error: (...args) => logged.push(args) };
  const app = createApp({ db, logger });
  return { app, db, me, logged };
}

export const get = (ctx, url) => request(ctx.app).get(url);
export const postSwipe = (ctx, body) => request(ctx.app).post('/api/swipe').send(body);
/** Send an exact string body, e.g. malformed JSON, with a chosen content type. */
export const postRaw = (ctx, raw, type = 'application/json') =>
  request(ctx.app).post('/api/swipe').set('Content-Type', type).send(raw);

export const keys = (obj) => Object.keys(obj).sort();
export const PROFILE_KEYS = ['age', 'bio', 'city', 'college', 'id', 'interests', 'name', 'photoUrl'];
export const MATCH_KEYS = ['id', 'matchedAt', 'profile'];
export const SWIPE_RESULT_KEYS = ['alreadySwiped', 'match', 'matched', 'swipe'];

/** Substrings that must never appear in any API response body. */
export const FORBIDDEN = ['likedYou', 'likesYou', 'likedMe', 'incoming', 'admirer', 'likesCurrentUser',
  'swiper_id', 'target_id', 'user_a_id', 'user_b_id', 'is_current_user', 'isCurrentUser', 'slug'];

/** Every error response has exactly { error: { code, message } }. */
export function expectError(res, status, code) {
  expect(res.status).toBe(status);
  expect(keys(res.body)).toEqual(['error']);
  expect(keys(res.body.error)).toEqual(['code', 'message']);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe('string');
  expect(res.body.error.message.length).toBeGreaterThan(0);
}
