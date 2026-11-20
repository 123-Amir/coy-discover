// `npm run db:init` creates the database file and prints its structure.
import { createDb, DEFAULT_DB_PATH } from './connection.js';

const db = createDb();
const objects = db
  .prepare(`SELECT type, name FROM sqlite_master
            WHERE name NOT LIKE 'sqlite_%' ORDER BY type DESC, name`)
  .all();

console.log(`Database ready at ${DEFAULT_DB_PATH}`);
for (const { type, name } of objects) console.log(`  ${type.padEnd(8)} ${name}`);
db.close();
