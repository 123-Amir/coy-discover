import { createDb, DEFAULT_DB_PATH } from './db/connection.js';
import { seed } from './db/seed.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

const db = createDb();
seed(db);   // idempotent: never touches existing swipes, and guarantees exactly one current user
const app = createApp({ db });

const server = app.listen(PORT, () => {
  console.log(`Coy Discover API listening on http://localhost:${PORT}`);
  console.log(`Database: ${DEFAULT_DB_PATH}`);
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Set PORT to another value.` : err);
  db.close();
  process.exit(1);
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();   // do not hang forever on open connections
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
