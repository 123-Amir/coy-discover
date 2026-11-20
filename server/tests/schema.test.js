import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDb } from '../src/db/connection.js';

let db;
beforeEach(() => {
  db = createDb(':memory:');
});
afterEach(() => db.close());

// --- helpers -------------------------------------------------------------
let slugCounter = 0;
function addProfile(overrides = {}) {
  const p = {
    slug: `p${++slugCounter}`, name: 'Test', age: 22, bio: 'bio', city: 'Bengaluru', college: null,
    photo_url: '/avatars/1.svg', interests: '["music"]', is_current_user: 0,
    ...overrides,
  };
  return db
    .prepare(`INSERT INTO profiles (slug, name, age, bio, city, college, photo_url, interests, is_current_user)
              VALUES (@slug, @name, @age, @bio, @city, @college, @photo_url, @interests, @is_current_user)`)
    .run(p).lastInsertRowid;
}
const swipe = (swiper, target, action) =>
  db.prepare('INSERT INTO swipes (swiper_id, target_id, action) VALUES (?, ?, ?)')
    .run(swiper, target, action);
const insertMatch = (a, b) =>
  db.prepare('INSERT INTO matches (user_a_id, user_b_id) VALUES (?, ?)').run(a, b);
// Matches whose two underlying likes are not both present. Must always be empty.
const invalidMatches = () =>
  db.prepare(`
    SELECT m.id FROM matches m
    WHERE NOT EXISTS (SELECT 1 FROM swipes WHERE swiper_id = m.user_a_id AND target_id = m.user_b_id AND action = 'like')
       OR NOT EXISTS (SELECT 1 FROM swipes WHERE swiper_id = m.user_b_id AND target_id = m.user_a_id AND action = 'like')
  `).all();
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

// --- setup ---------------------------------------------------------------
describe('database setup', () => {
  it('creates the expected tables and triggers', () => {
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'`)
      .all().map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining([
      'profiles', 'swipes', 'matches',
      'trg_swipes_immutable', 'trg_swipes_no_delete', 'trg_swipes_protect_match',
      'trg_matches_require_mutual_like', 'trg_matches_pair_immutable',
    ]));
  });

  it('enables recursive_triggers so INSERT OR REPLACE fires the delete trigger', () => {
    expect(db.pragma('recursive_triggers', { simple: true })).toBe(1);
  });

  it('enables foreign key enforcement', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('applying the schema twice is harmless and keeps data', () => {
    addProfile({ name: 'Keep me' });
    const file = path.join(os.tmpdir(), `coy-idem-${process.pid}.db`);
    fs.rmSync(file, { force: true });
    const a = createDb(file);
    a.prepare(`INSERT INTO profiles (slug, name, age, bio, city, photo_url) VALUES ('x', 'X', 20, 'b', 'c', 'p')`).run();
    a.close();
    const b = createDb(file); // re-runs schema.sql
    expect(b.prepare('SELECT COUNT(*) AS n FROM profiles').get().n).toBe(1);
    b.close();
    fs.rmSync(file, { force: true });
  });

  it('persists data across close and reopen (file-backed)', () => {
    const file = path.join(os.tmpdir(), `coy-persist-${process.pid}.db`);
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(file + ext, { force: true });

    const first = createDb(file);
    const ins = first.prepare(
      `INSERT INTO profiles (slug, name, age, bio, city, photo_url) VALUES (lower(?), ?, 21, 'b', 'c', 'p')`);
    const a = ins.run('A', 'A').lastInsertRowid;
    const b = ins.run('B', 'B').lastInsertRowid;
    first.prepare(`INSERT INTO swipes (swiper_id, target_id, action) VALUES (?, ?, 'like')`).run(a, b);
    first.close();

    const second = createDb(file);
    const row = second.prepare('SELECT swiper_id, target_id, action FROM swipes').get();
    expect(row).toEqual({ swiper_id: Number(a), target_id: Number(b), action: 'like' });
    second.close();
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(file + ext, { force: true });
  });
});

describe('stale database guard', () => {
  it('refuses a database file created by the Phase 1 schema (no slug column)', () => {
    const file = path.join(os.tmpdir(), `coy-stale-${process.pid}.db`);
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(file + ext, { force: true });
    const old = new Database(file);
    old.exec(`CREATE TABLE profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, age INTEGER NOT NULL,
      bio TEXT NOT NULL, city TEXT NOT NULL, college TEXT, photo_url TEXT NOT NULL,
      interests TEXT NOT NULL DEFAULT '[]', is_current_user INTEGER NOT NULL DEFAULT 0)`);
    old.close();
    expect(() => createDb(file)).toThrow(/older schema/);
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(file + ext, { force: true });
  });
});

// --- profiles ------------------------------------------------------------
describe('profiles constraints', () => {
  it('rejects ages outside 18-99', () => {
    expect(() => addProfile({ age: 17 })).toThrow(/CHECK constraint failed/);
    expect(() => addProfile({ age: 100 })).toThrow(/CHECK constraint failed/);
    expect(() => addProfile({ age: 18 })).not.toThrow();
  });

  it('rejects blank names and malformed interests JSON', () => {
    expect(() => addProfile({ name: '   ' })).toThrow(/CHECK constraint failed/);
    expect(() => addProfile({ interests: 'not json' })).toThrow(/CHECK constraint failed/);
  });

  it('requires a unique, non-blank slug', () => {
    addProfile({ slug: 'dup' });
    expect(() => addProfile({ slug: 'dup' })).toThrow(/UNIQUE constraint failed/);
    expect(() => addProfile({ slug: '  ' })).toThrow(/CHECK constraint failed/);
  });

  it('allows at most one current user', () => {
    addProfile({ is_current_user: 1 });
    expect(() => addProfile({ is_current_user: 1 })).toThrow(/UNIQUE constraint failed/);
    expect(() => addProfile({ is_current_user: 0 })).not.toThrow();
  });

  it('does NOT require a current user: "exactly one" is the seed\'s job, not the schema\'s', () => {
    // Documents the limit of the partial unique index. Phase 2's seed test must
    // assert that exactly one current user exists after seeding.
    addProfile({ is_current_user: 0 });
    const n = db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE is_current_user = 1').get().n;
    expect(n).toBe(0);
  });
});

// --- swipes --------------------------------------------------------------
describe('swipes constraints', () => {
  let me, other;
  beforeEach(() => {
    me = addProfile({ name: 'Me', is_current_user: 1 });
    other = addProfile({ name: 'Other' });
  });

  it('stores like and pass', () => {
    const third = addProfile({ name: 'Third' });
    swipe(me, other, 'like');
    swipe(me, third, 'pass');
    expect(count('swipes')).toBe(2);
  });

  it('rejects any action other than like/pass', () => {
    for (const bad of ['LIKE', 'superlike', '', 'Pass']) {
      expect(() => swipe(me, other, bad)).toThrow(/CHECK constraint failed/);
    }
    expect(count('swipes')).toBe(0);
  });

  it('rejects a duplicate swipe on the same target (same action)', () => {
    swipe(me, other, 'like');
    expect(() => swipe(me, other, 'like')).toThrow(/UNIQUE constraint failed/);
    expect(count('swipes')).toBe(1);
  });

  it('rejects a conflicting second swipe (different action)', () => {
    swipe(me, other, 'pass');
    expect(() => swipe(me, other, 'like')).toThrow(/UNIQUE constraint failed/);
  });

  it('INSERT OR IGNORE makes a duplicate a silent no-op', () => {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO swipes (swiper_id, target_id, action) VALUES (?, ?, 'like')`);
    expect(stmt.run(me, other).changes).toBe(1);
    expect(stmt.run(me, other).changes).toBe(0);
    expect(count('swipes')).toBe(1);
  });

  it('allows the reverse direction as its own swipe', () => {
    swipe(me, other, 'like');
    expect(() => swipe(other, me, 'like')).not.toThrow();
    expect(count('swipes')).toBe(2);
  });

  it('rejects swiping on yourself', () => {
    expect(() => swipe(me, me, 'like')).toThrow(/CHECK constraint failed/);
  });

  it('rejects swipes that reference nonexistent profiles', () => {
    expect(() => swipe(me, 9999, 'like')).toThrow(/FOREIGN KEY constraint failed/);
    expect(() => swipe(9999, me, 'like')).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('refuses to update a swipe (swipes are final)', () => {
    swipe(me, other, 'pass');
    expect(() => db.prepare(`UPDATE swipes SET action = 'like'`).run())
      .toThrow(/swipes are final/);
    expect(db.prepare('SELECT action FROM swipes').get().action).toBe('pass');
  });

  it('refuses to delete swipes (by id, by filter, or all at once)', () => {
    swipe(me, other, 'like');
    swipe(other, me, 'pass');
    expect(() => db.prepare('DELETE FROM swipes WHERE id = 1').run()).toThrow(/swipes are permanent/);
    expect(() => db.prepare('DELETE FROM swipes WHERE swiper_id = ?').run(me)).toThrow(/swipes are permanent/);
    expect(() => db.prepare('DELETE FROM swipes').run()).toThrow(/swipes are permanent/);
    expect(count('swipes')).toBe(2);
  });

  it('INSERT OR REPLACE cannot overwrite (and so silently delete) a swipe', () => {
    swipe(me, other, 'like');
    const replace = db.prepare(
      `INSERT OR REPLACE INTO swipes (swiper_id, target_id, action) VALUES (?, ?, 'pass')`);
    expect(() => replace.run(me, other)).toThrow(/swipes are permanent/);
    expect(db.prepare('SELECT action FROM swipes').get().action).toBe('like');
    expect(count('swipes')).toBe(1);
  });
});

// --- matches -------------------------------------------------------------
describe('matches constraints', () => {
  let a, b;
  beforeEach(() => {
    a = addProfile({ name: 'A', is_current_user: 1 });
    b = addProfile({ name: 'B' });
  });

  it('refuses a match when nobody has swiped', () => {
    expect(() => insertMatch(a, b)).toThrow(/match requires mutual likes/);
  });

  it('refuses a match from a one-sided like (either direction)', () => {
    swipe(a, b, 'like');
    expect(() => insertMatch(a, b)).toThrow(/match requires mutual likes/);

    const c = addProfile({ name: 'C' });
    swipe(c, a, 'like');
    expect(() => insertMatch(a, c)).toThrow(/match requires mutual likes/);
    expect(count('matches')).toBe(0);
  });

  it('refuses a match when one side liked and the other passed', () => {
    swipe(a, b, 'like');
    swipe(b, a, 'pass');
    expect(() => insertMatch(a, b)).toThrow(/match requires mutual likes/);
  });

  it('allows a match once both users have liked', () => {
    swipe(a, b, 'like');
    swipe(b, a, 'like');
    expect(() => insertMatch(a, b)).not.toThrow();
    expect(count('matches')).toBe(1);
  });

  it('enforces canonical ordering (user_a_id < user_b_id)', () => {
    swipe(a, b, 'like');
    swipe(b, a, 'like');
    expect(() => insertMatch(b, a)).toThrow(/CHECK constraint failed/);
  });

  it('allows only one match row per pair', () => {
    swipe(a, b, 'like');
    swipe(b, a, 'like');
    insertMatch(a, b);
    expect(() => insertMatch(a, b)).toThrow(/UNIQUE constraint failed/);
    const ignore = db.prepare(`INSERT OR IGNORE INTO matches (user_a_id, user_b_id) VALUES (?, ?)`);
    expect(ignore.run(a, b).changes).toBe(0);
    expect(count('matches')).toBe(1);
  });

  it('rolls back the swipe if the match insert fails inside a transaction', () => {
    const attempt = db.transaction(() => {
      swipe(a, b, 'like');
      insertMatch(a, b); // b has not liked a, so the trigger aborts
    });
    expect(() => attempt()).toThrow(/match requires mutual likes/);
    expect(count('swipes')).toBe(0);
    expect(count('matches')).toBe(0);
  });
});

// --- match integrity -----------------------------------------------------
// A match is valid only while both underlying likes exist. These tests try every
// route that could remove or alter a like (or the match itself) and then assert
// that no invalid match can exist.
describe('match integrity', () => {
  let a, b;
  beforeEach(() => {
    a = addProfile({ name: 'A', is_current_user: 1 });
    b = addProfile({ name: 'B' });
    swipe(a, b, 'like');
    swipe(b, a, 'like');
    insertMatch(a, b);
  });

  it('starts valid', () => {
    expect(invalidMatches()).toEqual([]);
  });

  it('cannot delete either underlying like; the match survives', () => {
    expect(() => db.prepare('DELETE FROM swipes WHERE swiper_id = ? AND target_id = ?').run(a, b))
      .toThrow(/swipes are permanent/);
    expect(() => db.prepare('DELETE FROM swipes WHERE swiper_id = ? AND target_id = ?').run(b, a))
      .toThrow(/swipes are permanent/);
    expect(count('swipes')).toBe(2);
    expect(count('matches')).toBe(1);
    expect(invalidMatches()).toEqual([]);
  });

  it('cannot downgrade a like to a pass with UPDATE', () => {
    expect(() => db.prepare(`UPDATE swipes SET action = 'pass' WHERE swiper_id = ?`).run(a))
      .toThrow(/swipes are final/);
    expect(invalidMatches()).toEqual([]);
  });

  it('cannot replace a matched like via INSERT OR REPLACE (recursive_triggers on)', () => {
    expect(() => db.prepare(
      `INSERT OR REPLACE INTO swipes (swiper_id, target_id, action) VALUES (?, ?, 'pass')`).run(a, b)
    ).toThrow(/swipes are permanent/);
    expect(invalidMatches()).toEqual([]);
  });

  it('schema-level backstop: replace is still refused on a connection WITHOUT recursive_triggers', () => {
    db.pragma('recursive_triggers = OFF'); // simulate a raw connection, e.g. the sqlite3 CLI
    expect(() => db.prepare(
      `INSERT OR REPLACE INTO swipes (swiper_id, target_id, action) VALUES (?, ?, 'pass')`).run(a, b)
    ).toThrow(/cannot replace a like that backs a match/);
    expect(db.prepare('SELECT action FROM swipes WHERE swiper_id = ? AND target_id = ?').get(a, b).action)
      .toBe('like');
    expect(count('swipes')).toBe(2);
    expect(invalidMatches()).toEqual([]);
  });

  it('cannot re-point a match at two users who never liked each other', () => {
    const c = addProfile({ name: 'C' });
    expect(() => db.prepare('UPDATE matches SET user_b_id = ? WHERE user_a_id = ?').run(c, a))
      .toThrow(/a match's users cannot be changed/);
    expect(() => db.prepare('UPDATE matches SET user_a_id = ?').run(0)).toThrow();
    expect(invalidMatches()).toEqual([]);
  });

  it('cannot delete a profile that is part of a match or a swipe', () => {
    expect(() => db.prepare('DELETE FROM profiles WHERE id = ?').run(b))
      .toThrow(/FOREIGN KEY constraint failed/);
    expect(() => db.prepare('DELETE FROM profiles WHERE id = ?').run(a))
      .toThrow(/FOREIGN KEY constraint failed/);
    expect(count('profiles')).toBe(2);
    expect(invalidMatches()).toEqual([]);
  });

  it('an unmatched profile with no swipes can still be deleted (FK does not over-block)', () => {
    const lonely = addProfile({ name: 'Lonely' });
    expect(() => db.prepare('DELETE FROM profiles WHERE id = ?').run(lonely)).not.toThrow();
  });

  it('stays valid after a barrage of destructive attempts', () => {
    const attempts = [
      'DELETE FROM swipes',
      `UPDATE swipes SET action = 'pass'`,
      `INSERT OR REPLACE INTO swipes (swiper_id, target_id, action) VALUES (1, 2, 'pass')`,
      `INSERT OR REPLACE INTO swipes (swiper_id, target_id, action) VALUES (2, 1, 'pass')`,
      'DELETE FROM profiles',
      'UPDATE matches SET user_b_id = user_b_id',
    ];
    for (const sql of attempts) expect(() => db.exec(sql)).toThrow();
    expect(count('swipes')).toBe(2);
    expect(count('matches')).toBe(1);
    expect(count('profiles')).toBe(2);
    expect(invalidMatches()).toEqual([]);
  });
});
