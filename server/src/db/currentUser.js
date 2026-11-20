import { toPublicProfile } from '../serializers.js';

/**
 * Returns the id of the logged-in user. Throws unless EXACTLY one current user exists.
 * (The schema only guarantees "at most one"; seeding guarantees "at least one".)
 */
export function getCurrentUserId(db) {
  const rows = db.prepare('SELECT id FROM profiles WHERE is_current_user = 1').all();
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one current user but found ${rows.length}. Run \`npm run seed\`.`);
  }
  return rows[0].id;
}

/**
 * The current user's own profile, in the same public shape as everyone else's.
 * Deliberately returns nothing about swipes, likes or counts. Throws if `userId` is not
 * the current user, so this cannot be used to fetch another person's profile.
 */
export function getCurrentUserProfile(db, userId) {
  const row = db
    .prepare(
      `SELECT p.id, p.name, p.age, p.bio, p.city, p.college, p.photo_url, p.interests
       FROM profiles p WHERE p.id = ? AND p.is_current_user = 1`,
    )
    .get(userId);
  if (!row) throw new Error(`Current user ${userId} not found`);
  return { profile: toPublicProfile(row) };
}
