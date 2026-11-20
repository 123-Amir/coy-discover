import { AppError } from '../errors.js';
import { toMatchView } from '../serializers.js';
import { createMatch, findMatch } from './matchService.js';

function parseInput(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError(400, 'INVALID_BODY', 'Request body must be a JSON object');
  }
  const { profileId, action } = input;
  if (profileId === undefined || action === undefined) {
    throw new AppError(400, 'INVALID_BODY', 'profileId and action are required');
  }
  // Strict on purpose: "7", 7.5, null, true, NaN and 2**53 are all rejected, never coerced.
  if (!Number.isSafeInteger(profileId) || profileId <= 0) {
    throw new AppError(400, 'INVALID_PROFILE_ID', 'profileId must be a positive integer');
  }
  if (action !== 'like' && action !== 'pass') {
    throw new AppError(400, 'INVALID_ACTION', "action must be 'like' or 'pass'");
  }
  return { profileId, action };
}

// The reverse-like lookup. This is the one place another user's swipe is read, and only
// a boolean ever leaves it.
function hasLiked(db, swiperId, targetId) {
  return !!db
    .prepare(`SELECT 1 FROM swipes WHERE swiper_id = ? AND target_id = ? AND action = 'like'`)
    .get(swiperId, targetId);
}

// Same shape for every outcome, so a non-match reveals nothing about the other user:
// liking someone who passed on you looks identical to liking someone who never swiped.
function buildResult({ profileId, action, alreadySwiped, match, target }) {
  return {
    swipe: { profileId, action },
    matched: match !== null,
    match: match ? toMatchView(match, target) : null,
    alreadySwiped,
  };
}

/**
 * Record a like or pass for `userId` (who comes from the server, never from the request body).
 * Runs as a single IMMEDIATE transaction: the write lock is taken up front, so the duplicate
 * check, the insert, the reverse-like check and the match insert are one atomic unit.
 * The UNIQUE constraint on (swiper_id, target_id) remains the backstop.
 */
export function swipe(db, userId, input) {
  const { profileId, action } = parseInput(input);
  if (profileId === userId) {
    throw new AppError(400, 'CANNOT_SWIPE_SELF', 'You cannot swipe on yourself');
  }

  const run = db.transaction(() => {
    const target = db
      .prepare(
        `SELECT p.id, p.name, p.age, p.bio, p.city, p.college, p.photo_url, p.interests
         FROM profiles p WHERE p.id = ?`,
      )
      .get(profileId);
    if (!target) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found');

    const existing = db
      .prepare('SELECT action FROM swipes WHERE swiper_id = ? AND target_id = ?')
      .get(userId, profileId);

    if (existing) {
      if (existing.action !== action) {
        throw new AppError(409, 'ALREADY_SWIPED', 'You have already swiped on this profile');
      }
      // Identical repeat (double tap, retry): no writes, same answer as the first time.
      const match = action === 'like' ? findMatch(db, userId, profileId) ?? null : null;
      return buildResult({ profileId, action, alreadySwiped: true, match, target });
    }

    db.prepare('INSERT INTO swipes (swiper_id, target_id, action) VALUES (?, ?, ?)')
      .run(userId, profileId, action);

    let match = null;
    if (action === 'like' && hasLiked(db, profileId, userId)) {
      match = createMatch(db, userId, profileId);
    }
    return buildResult({ profileId, action, alreadySwiped: false, match, target });
  });

  return run.immediate();
}
