import { describe, it, expect } from 'vitest';
import { getCurrentUserProfile } from '../src/db/currentUser.js';
import { currentUser } from '../src/middleware/currentUser.js';
import { createDb } from '../src/db/connection.js';
import { makeSeededDb, idBySlug } from './helpers.js';

const PROFILE_KEYS = ['age', 'bio', 'city', 'college', 'id', 'interests', 'name', 'photoUrl'];

describe('getCurrentUserProfile', () => {
  it('returns the current user as a whitelisted public profile', () => {
    const { db, me } = makeSeededDb();
    const { profile } = getCurrentUserProfile(db, me);
    expect(Object.keys(profile).sort()).toEqual(PROFILE_KEYS);
    expect(profile.name).toBe('Arjun');
    expect(profile.interests).toEqual(['Cricket', 'Filter coffee', 'Travel']);
  });

  it('refuses to return anyone who is not the current user', () => {
    const { db } = makeSeededDb();
    expect(() => getCurrentUserProfile(db, idBySlug(db, 'ananya'))).toThrow();
    expect(() => getCurrentUserProfile(db, 99999)).toThrow();
  });
});

describe('currentUser middleware', () => {
  it('sets req.userId from the database and ignores everything the client sent', () => {
    const { db, me } = makeSeededDb();
    const req = { headers: { 'x-user-id': '5' }, query: { userId: '5' }, body: { userId: 5 } };
    let called = 0;
    currentUser(db)(req, {}, () => { called++; });
    expect(req.userId).toBe(me);
    expect(called).toBe(1);
  });

  it('passes a database failure on to the error handler instead of continuing', () => {
    const db = createDb(':memory:');   // unseeded: no current user
    let passed;
    currentUser(db)({}, {}, (err) => { passed = err; });
    expect(passed instanceof Error).toBe(true);
    expect(/exactly one current user/.test(passed.message)).toBe(true);
  });
});
