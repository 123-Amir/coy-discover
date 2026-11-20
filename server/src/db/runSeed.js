// `npm run seed`: create/open the database and seed it. Safe to run repeatedly.
import { createDb, DEFAULT_DB_PATH } from './connection.js';
import { seed } from './seed.js';

const db = createDb();
const result = seed(db);
const count = (sql) => db.prepare(sql).get().n;
console.log(`Seeded ${DEFAULT_DB_PATH}`);
console.log(`  inserted this run: ${result.profilesInserted} profiles, ${result.likesInserted} incoming likes`);
console.log(`  totals: ${count('SELECT COUNT(*) AS n FROM profiles')} profiles, ` +
  `${count('SELECT COUNT(*) AS n FROM swipes')} swipes, ${count('SELECT COUNT(*) AS n FROM matches')} matches`);
db.close();
