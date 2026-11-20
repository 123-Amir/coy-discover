import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(here, 'schema.sql');

export const DEFAULT_DB_PATH =
  process.env.DB_PATH ?? path.resolve(here, '../../var/coy.db');

/**
 * Open a SQLite database and make sure the schema exists.
 * Pass ':memory:' for an isolated, throwaway database (used by tests).
 */
export function createDb(filename = DEFAULT_DB_PATH) {
  const inMemory = filename === ':memory:';
  if (!inMemory) fs.mkdirSync(path.dirname(filename), { recursive: true });

  const db = new Database(filename);
  db.pragma('foreign_keys = ON');   // off by default in SQLite; constraints depend on it
  db.pragma('busy_timeout = 5000'); // wait for a competing writer instead of failing instantly
  // Without this, SQLite skips DELETE triggers when INSERT OR REPLACE overwrites a row,
  // which would let a swipe be silently replaced. See trg_swipes_no_delete.
  db.pragma('recursive_triggers = ON');
  if (!inMemory) db.pragma('journal_mode = WAL');

  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  // There is no migration framework (deliberately). `CREATE TABLE IF NOT EXISTS` will not
  // add the `slug` column to a database file made by the Phase 1 schema, so fail clearly.
  if (!db.pragma('table_info(profiles)').some((col) => col.name === 'slug')) {
    db.close();
    throw new Error(
      `${filename} was created by an older schema (profiles.slug is missing). ` +
        'Delete the file (it only holds seed data) and run `npm run seed`.',
    );
  }
  return db;
}
