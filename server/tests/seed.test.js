import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { getCurrentUserId } from '../src/db/currentUser.js';
import { seedData } from '../src/data/profiles.js';
import { makeSeededDb, withLikers, idBySlug, count, dump } from './helpers.js';

const AVATAR_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/public/avatars');

describe('seed data (static checks)', () => {
  const { profiles, currentUser } = seedData;

  it('has at least 32 discovery profiles, excluding the current user', () => {
    expect(profiles.length).toBeGreaterThanOrEqual(32);
    expect(profiles.map((p) => p.slug)).not.toContain(currentUser.slug);
  });

  it('has unique slugs and unique names', () => {
    expect(new Set(profiles.map((p) => p.slug)).size).toBe(profiles.length);
    expect(new Set(profiles.map((p) => p.name)).size).toBe(profiles.length);
  });

  it('gives every profile all required fields', () => {
    for (const p of [currentUser, ...profiles]) {
      for (const field of ['slug', 'name', 'bio', 'city', 'college']) {
        expect(typeof p[field]).toBe('string');
        expect(p[field].trim().length).toBeGreaterThan(0);
      }
      expect(Number.isInteger(p.age)).toBe(true);
      expect(p.age).toBeGreaterThanOrEqual(18);
      expect(Array.isArray(p.interests)).toBe(true);
      expect(p.interests.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('flags at least 8 profiles as having pre-liked the user, and never the user themself', () => {
    expect(profiles.filter((p) => p.likesCurrentUser).length).toBeGreaterThanOrEqual(8);
    expect(currentUser.likesCurrentUser).toBeUndefined();
  });

  it('ships a local SVG avatar for every profile (no external image dependency)', () => {
    for (const p of [currentUser, ...profiles]) {
      const file = path.join(AVATAR_DIR, `${p.slug}.svg`);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.readFileSync(file, 'utf8').startsWith('<svg')).toBe(true);
    }
  });
});

describe('seed()', () => {
  it('seeds a fresh database with exactly one current user and all profiles', () => {
    const { db, me } = makeSeededDb();
    expect(count(db, 'profiles')).toBe(seedData.profiles.length + 1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE is_current_user = 1').get().n).toBe(1);
    expect(getCurrentUserId(db)).toBe(me);
    expect(db.prepare('SELECT slug FROM profiles WHERE id = ?').get(me).slug).toBe('me');
  });

  it('stores local avatar paths and JSON interests', () => {
    const { db } = makeSeededDb();
    for (const row of db.prepare('SELECT slug, photo_url, interests FROM profiles').all()) {
      expect(row.photo_url).toBe(`/avatars/${row.slug}.svg`);
      expect(Array.isArray(JSON.parse(row.interests))).toBe(true);
    }
  });

  it('creates at least 8 incoming likes to the current user, all from other profiles', () => {
    const { db, me } = makeSeededDb();
    const likes = db.prepare('SELECT swiper_id, action FROM swipes WHERE target_id = ?').all(me);
    expect(likes.length).toBeGreaterThanOrEqual(8);
    for (const l of likes) {
      expect(l.action).toBe('like');
      expect(l.swiper_id === me).toBe(false);
    }
    // The user has swiped on nobody, and no matches exist yet.
    expect(db.prepare('SELECT COUNT(*) AS n FROM swipes WHERE swiper_id = ?').get(me).n).toBe(0);
    expect(count(db, 'matches')).toBe(0);
  });

  it('reports what it inserted', () => {
    const db = createDb(':memory:');
    const first = seed(db);
    expect(first.profilesInserted).toBe(seedData.profiles.length + 1);
    expect(first.likesInserted).toBe(seedData.profiles.filter((p) => p.likesCurrentUser).length);
    const second = seed(db);
    expect(second.profilesInserted).toBe(0);
    expect(second.likesInserted).toBe(0);
  });

  it('is idempotent: running it again changes nothing', () => {
    const { db } = makeSeededDb();
    const before = { p: dump(db, 'profiles'), s: dump(db, 'swipes'), m: dump(db, 'matches') };
    seed(db);
    seed(db);
    expect(dump(db, 'profiles')).toEqual(before.p);
    expect(dump(db, 'swipes')).toEqual(before.s);
    expect(dump(db, 'matches')).toEqual(before.m);
  });

  it('never overwrites an existing profile row', () => {
    const { db } = makeSeededDb();
    db.prepare(`UPDATE profiles SET bio = 'edited by hand' WHERE slug = 'ananya'`).run();
    seed(db);
    expect(db.prepare(`SELECT bio FROM profiles WHERE slug = 'ananya'`).get().bio).toBe('edited by hand');
  });

  it('preserves the user\'s swipes and matches across a re-seed', () => {
    const { db, me } = makeSeededDb();
    const liker = idBySlug(db, 'ananya');   // pre-liked the user
    const other = idBySlug(db, 'rohan');
    db.prepare(`INSERT INTO swipes (swiper_id, target_id, action) VALUES (?, ?, 'like')`).run(me, liker);
    db.prepare(`INSERT INTO swipes (swiper_id, target_id, action) VALUES (?, ?, 'pass')`).run(me, other);
    db.prepare('INSERT INTO matches (user_a_id, user_b_id) VALUES (?, ?)').run(Math.min(me, liker), Math.max(me, liker));
    const before = { s: dump(db, 'swipes'), m: dump(db, 'matches') };
    seed(db);
    expect(dump(db, 'swipes')).toEqual(before.s);
    expect(dump(db, 'matches')).toEqual(before.m);
  });

  it('does not fabricate a like for an already-existing profile whose flag changes later', () => {
    // First run: 'tara' has NOT liked the user. The user then likes tara.
    const { db, me } = makeSeededDb(withLikers(seedData, (p) => p.slug !== 'tara' && p.likesCurrentUser));
    const tara = idBySlug(db, 'tara');
    db.prepare(`INSERT INTO swipes (swiper_id, target_id, action) VALUES (?, ?, 'like')`).run(me, tara);
    const swipesBefore = count(db, 'swipes');
    // Re-seeding with tara flagged must not create tara -> me (that would be a mutual like with no match row).
    seed(db, withLikers(seedData, (p) => p.slug === 'tara'));
    expect(count(db, 'swipes')).toBe(swipesBefore);
    expect(db.prepare('SELECT COUNT(*) AS n FROM swipes WHERE swiper_id = ? AND target_id = ?').get(tara, me).n).toBe(0);
  });

  it('adds a newly introduced profile (and its pre-like) exactly once', () => {
    const { db, me } = makeSeededDb();
    const extended = {
      ...seedData,
      profiles: [...seedData.profiles, {
        slug: 'newcomer', name: 'Newcomer', age: 22, bio: 'New here.', city: 'Pune',
        college: 'Test College', interests: ['a', 'b', 'c'], likesCurrentUser: true,
      }],
    };
    const profilesBefore = count(db, 'profiles');
    const swipesBefore = count(db, 'swipes');
    seed(db, extended);
    seed(db, extended);
    expect(count(db, 'profiles')).toBe(profilesBefore + 1);
    expect(count(db, 'swipes')).toBe(swipesBefore + 1);
    const id = idBySlug(db, 'newcomer');
    expect(db.prepare('SELECT action FROM swipes WHERE swiper_id = ? AND target_id = ?').get(id, me).action).toBe('like');
  });

  it('keeps exactly one current user when one already exists under a different slug', () => {
    const db = createDb(':memory:');
    db.prepare(`INSERT INTO profiles (slug, name, age, bio, city, photo_url, is_current_user)
                VALUES ('existing-user', 'Existing', 30, 'b', 'c', 'p', 1)`).run();
    seed(db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE is_current_user = 1').get().n).toBe(1);
    expect(db.prepare('SELECT slug FROM profiles WHERE id = ?').get(getCurrentUserId(db)).slug).toBe('existing-user');
  });

  it('is atomic: invalid seed data rolls everything back', () => {
    const db = createDb(':memory:');
    const bad = { ...seedData, profiles: [...seedData.profiles, { ...seedData.profiles[0], slug: 'too-young', name: 'Kid', age: 17 }] };
    expect(() => seed(db, bad)).toThrow(/CHECK constraint failed/);
    expect(count(db, 'profiles')).toBe(0);
    expect(count(db, 'swipes')).toBe(0);
  });
});

describe('getCurrentUserId()', () => {
  it('throws on an unseeded database instead of guessing', () => {
    const db = createDb(':memory:');
    expect(() => getCurrentUserId(db)).toThrow(/exactly one current user/);
  });
});
