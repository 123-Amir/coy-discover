import { toMatchView } from '../serializers.js';

/** Matches are stored once per pair with the smaller id first (see schema CHECK). */
const canonical = (x, y) => (x < y ? [x, y] : [y, x]);

/** Returns {id, created_at} or undefined. */
export function findMatch(db, userX, userY) {
  const [a, b] = canonical(userX, userY);
  return db
    .prepare('SELECT id, created_at FROM matches WHERE user_a_id = ? AND user_b_id = ?')
    .get(a, b);
}

/**
 * Creates the match row. Must be called inside the swipe transaction, only after the
 * reverse like has been confirmed. The database trigger independently refuses a match
 * unless both likes exist, so a bug here cannot create a false match.
 */
export function createMatch(db, userX, userY) {
  const [a, b] = canonical(userX, userY);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO matches (user_a_id, user_b_id) VALUES (?, ?)')
    .run(a, b);
  return db.prepare('SELECT id, created_at FROM matches WHERE id = ?').get(lastInsertRowid);
}

/** All of a user's mutual matches, newest first. Reads only the matches table. */
export function listMatches(db, userId) {
  const rows = db
    .prepare(
      `SELECT m.id AS match_id, m.created_at AS matched_at,
              p.id, p.name, p.age, p.bio, p.city, p.college, p.photo_url, p.interests
       FROM matches m
       JOIN profiles p
         ON p.id = CASE WHEN m.user_a_id = @me THEN m.user_b_id ELSE m.user_a_id END
       WHERE m.user_a_id = @me OR m.user_b_id = @me
       ORDER BY m.created_at DESC, m.id DESC`,
    )
    .all({ me: userId });

  return {
    matches: rows.map((row) => toMatchView({ id: row.match_id, created_at: row.matched_at }, row)),
  };
}
