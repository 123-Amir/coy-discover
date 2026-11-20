import { AppError } from '../errors.js';
import { toPublicProfile } from '../serializers.js';

export const DEFAULT_FEED_LIMIT = 10;
export const MAX_FEED_LIMIT = 50;

// PRIVACY: this query looks only at the viewer's OWN swipes (swiper_id = @me). It never
// reads anyone's swipes toward the viewer, so incoming likes cannot affect which profiles
// appear or in what order.
//
// Ordering is a fixed pseudo-shuffle of the profile id (Knuth multiplicative hash), so it is
// stable between requests, looks random, and depends on nothing but the id.
const FEED_SQL = `
  SELECT p.id, p.name, p.age, p.bio, p.city, p.college, p.photo_url, p.interests
  FROM profiles p
  WHERE p.id != @me
    AND NOT EXISTS (
      SELECT 1 FROM swipes s WHERE s.swiper_id = @me AND s.target_id = p.id
    )
  ORDER BY ((p.id * 2654435761) % 4294967296), p.id
  LIMIT @limit`;

/** Profiles the user has not swiped on yet, excluding themself. */
export function getFeed(db, userId, { limit = DEFAULT_FEED_LIMIT } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FEED_LIMIT) {
    throw new AppError(400, 'INVALID_LIMIT', `limit must be an integer between 1 and ${MAX_FEED_LIMIT}`);
  }
  const rows = db.prepare(FEED_SQL).all({ me: userId, limit });
  return { profiles: rows.map(toPublicProfile) };
}
