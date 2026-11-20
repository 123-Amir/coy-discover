import { expect } from 'vitest';
import { createDb } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { getCurrentUserId } from '../src/db/currentUser.js';

/** Fresh in-memory database, seeded. `data` lets a test change who "likes" the user. */
export function makeSeededDb(data) {
  const db = createDb(':memory:');
  seed(db, data);
  return { db, me: getCurrentUserId(db) };
}

/** Copy of the seed data where `predicate(profile)` decides who has pre-liked the user. */
export function withLikers(data, predicate) {
  return { ...data, profiles: data.profiles.map((p) => ({ ...p, likesCurrentUser: !!predicate(p) })) };
}

export const idBySlug = (db, slug) => db.prepare('SELECT id FROM profiles WHERE slug = ?').get(slug).id;
export const count = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
export const dump = (db, table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();

/** Assert `fn` throws an AppError with the given code (and HTTP-style status). */
export function expectAppError(fn, code, status) {
  let err;
  try { fn(); } catch (e) { err = e; }
  expect(err !== undefined).toBe(true);
  expect(err.name).toBe('AppError');
  expect(err.code).toBe(code);
  if (status !== undefined) expect(err.status).toBe(status);
}
