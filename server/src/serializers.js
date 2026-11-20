// The ONLY place that decides which fields leave the service layer. Every field is listed
// explicitly (no spreading, no SELECT *), so internal columns (slug, is_current_user) and
// anything derived from other users' swipes can never leak by accident.

/** @param row a profiles row with id, name, age, bio, city, college, photo_url, interests */
export function toPublicProfile(row) {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    bio: row.bio,
    city: row.city,
    college: row.college,
    photoUrl: row.photo_url,
    interests: JSON.parse(row.interests),
  };
}

/** @param match {id, created_at}; @param profileRow the OTHER user's profile row */
export function toMatchView(match, profileRow) {
  return {
    id: match.id,
    matchedAt: match.created_at,
    profile: toPublicProfile(profileRow),
  };
}
