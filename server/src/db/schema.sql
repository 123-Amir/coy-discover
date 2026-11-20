-- Coy Discover schema. Safe to run on every startup (all statements are IF NOT EXISTS).
--
-- Privacy model: the database itself refuses to hold a match unless both users
-- have liked each other, and refuses to let a swipe be changed, deleted or repeated.
-- Application code is a convenience on top of these guarantees, not the guarantee.
--
-- Match integrity: a match is valid only while both underlying likes exist.
-- Likes can never be removed or altered (see the swipes triggers), and a match's
-- user pair can never be edited, so an invalid match cannot be created or
-- left behind. Profiles referenced by a swipe or match cannot be deleted (foreign
-- keys, no cascade).

CREATE TABLE IF NOT EXISTS profiles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    NOT NULL UNIQUE CHECK (length(trim(slug)) > 0), -- stable key so seeding can be idempotent
  name            TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  age             INTEGER NOT NULL CHECK (age BETWEEN 18 AND 99),
  bio             TEXT    NOT NULL,
  city            TEXT    NOT NULL,
  college         TEXT,
  photo_url       TEXT    NOT NULL,
  interests       TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(interests)),
  is_current_user INTEGER NOT NULL DEFAULT 0 CHECK (is_current_user IN (0, 1))
);

-- At most one row may be the logged-in user. This index only prevents TWO current
-- users; it does not force one to exist. The seed process is responsible for
-- ensuring exactly one current user (the app fails fast at startup if not).
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_single_current_user
  ON profiles (is_current_user) WHERE is_current_user = 1;

CREATE TABLE IF NOT EXISTS swipes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  swiper_id  INTEGER NOT NULL REFERENCES profiles (id),
  target_id  INTEGER NOT NULL REFERENCES profiles (id),
  action     TEXT    NOT NULL CHECK (action IN ('like', 'pass')),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (swiper_id, target_id),        -- one swipe per pair, ever
  CHECK (swiper_id != target_id)        -- no swiping on yourself
);

-- Supports the reverse-like lookup done inside the swipe transaction.
CREATE INDEX IF NOT EXISTS idx_swipes_target_action ON swipes (target_id, action);

-- Swipes are final: no editing a pass into a like (or vice versa)...
CREATE TRIGGER IF NOT EXISTS trg_swipes_immutable
BEFORE UPDATE ON swipes
BEGIN
  SELECT RAISE(ABORT, 'swipes are final and cannot be updated');
END;

-- ...and no deleting them, so "never appears again" and every match stay true.
-- NOTE: `INSERT OR REPLACE` deletes the conflicting row internally, and SQLite only
-- fires DELETE triggers for that when PRAGMA recursive_triggers is ON. connection.js
-- turns it on; trg_swipes_protect_match below is the schema-level backstop.
CREATE TRIGGER IF NOT EXISTS trg_swipes_no_delete
BEFORE DELETE ON swipes
BEGIN
  SELECT RAISE(ABORT, 'swipes are permanent and cannot be deleted');
END;

-- Backstop that works on any connection: if a swipe is re-inserted over an existing
-- one (INSERT OR REPLACE) it may never turn a like that backs a match into a pass.
-- AFTER INSERT triggers fire for the replacing row regardless of recursive_triggers.
CREATE TRIGGER IF NOT EXISTS trg_swipes_protect_match
AFTER INSERT ON swipes
WHEN NEW.action != 'like'
 AND EXISTS (SELECT 1 FROM matches
             WHERE user_a_id = min(NEW.swiper_id, NEW.target_id)
               AND user_b_id = max(NEW.swiper_id, NEW.target_id))
BEGIN
  SELECT RAISE(ABORT, 'cannot replace a like that backs a match');
END;

CREATE TABLE IF NOT EXISTS matches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a_id  INTEGER NOT NULL REFERENCES profiles (id),
  user_b_id  INTEGER NOT NULL REFERENCES profiles (id),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (user_a_id < user_b_id),        -- canonical ordering: (3,7), never (7,3)
  UNIQUE (user_a_id, user_b_id)         -- one match per pair
);

-- A match row can only exist if BOTH users liked each other.
CREATE TRIGGER IF NOT EXISTS trg_matches_require_mutual_like
BEFORE INSERT ON matches
WHEN NOT (
  EXISTS (SELECT 1 FROM swipes
          WHERE swiper_id = NEW.user_a_id AND target_id = NEW.user_b_id AND action = 'like')
  AND
  EXISTS (SELECT 1 FROM swipes
          WHERE swiper_id = NEW.user_b_id AND target_id = NEW.user_a_id AND action = 'like')
)
BEGIN
  SELECT RAISE(ABORT, 'match requires mutual likes');
END;

-- A match's pair is fixed once created; re-pointing it at two users who never
-- liked each other would bypass the mutual-like check above.
CREATE TRIGGER IF NOT EXISTS trg_matches_pair_immutable
BEFORE UPDATE OF user_a_id, user_b_id ON matches
BEGIN
  SELECT RAISE(ABORT, 'a match''s users cannot be changed');
END;
