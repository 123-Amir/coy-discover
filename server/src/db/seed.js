import { seedData } from '../data/profiles.js';
import { getCurrentUserId } from './currentUser.js';

const INSERT_PROFILE = `
  INSERT INTO profiles (slug, name, age, bio, city, college, photo_url, interests, is_current_user)
  VALUES (@slug, @name, @age, @bio, @city, @college, @photoUrl, @interests, @isCurrentUser)`;

const toRow = (p, isCurrentUser) => ({
  slug: p.slug,
  name: p.name,
  age: p.age,
  bio: p.bio,
  city: p.city,
  college: p.college ?? null,
  photoUrl: `/avatars/${p.slug}.svg`,
  interests: JSON.stringify(p.interests),
  isCurrentUser,
});

/**
 * Idempotent seed. Safe to run on every startup.
 *
 * - A profile is inserted only if its slug is not already present. Existing rows are never
 *   updated, replaced or deleted, and swipes/matches are never touched.
 * - A pre-like (profile -> current user) is created ONLY for a profile inserted by this very
 *   run. That keeps the seed from ever fabricating a mutual like, which would exist without
 *   a match row, for someone the user has already swiped on.
 * - Plain INSERTs are used on purpose: no OR REPLACE, and no OR IGNORE that could silently
 *   swallow a CHECK violation in bad seed data. Bad data throws and the whole run rolls back.
 * - Finishes by asserting exactly one current user exists.
 */
export function seed(db, data = seedData) {
  const run = db.transaction(() => {
    const summary = { profilesInserted: 0, likesInserted: 0 };

    const insertProfile = db.prepare(INSERT_PROFILE);
    const findBySlug = db.prepare('SELECT id FROM profiles WHERE slug = ?');
    const hasCurrentUser = db.prepare('SELECT 1 FROM profiles WHERE is_current_user = 1').get();

    if (!hasCurrentUser) {
      insertProfile.run(toRow(data.currentUser, 1));
      summary.profilesInserted++;
    }
    const currentUserId = getCurrentUserId(db);

    const insertLike = db.prepare(
      `INSERT INTO swipes (swiper_id, target_id, action) VALUES (?, ?, 'like')`);

    for (const profile of data.profiles) {
      if (findBySlug.get(profile.slug)) continue;
      const { lastInsertRowid } = insertProfile.run(toRow(profile, 0));
      summary.profilesInserted++;
      if (profile.likesCurrentUser) {
        insertLike.run(lastInsertRowid, currentUserId);
        summary.likesInserted++;
      }
    }

    getCurrentUserId(db); // throws unless exactly one current user exists
    return { ...summary, currentUserId };
  });
  return run.immediate();
}
