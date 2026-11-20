import express from 'express';
import { getCurrentUserId } from './db/currentUser.js';
import { currentUser } from './middleware/currentUser.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { feedRouter } from './routes/feed.js';
import { matchesRouter } from './routes/matches.js';
import { swipeRouter } from './routes/swipe.js';
import { apiRouter } from './routes/index.js';

/**
 * Builds the Express app around an open database. Exported as a factory so tests get an isolated
 * app per test, and so nothing here opens files or ports by itself.
 *
 * @param {{ db: object, logger?: { error: Function } }} options
 */
export function createApp({ db, logger = console }) {
  getCurrentUserId(db);   // fail fast at startup if the database has not been seeded

  const app = express();
  app.disable('x-powered-by');   // do not advertise the framework
  app.set('etag', false);        // no conditional-GET (304) shortcuts for personal data

  // Feed and matches are per-user and change after every swipe, so they must never be cached,
  // and browsers must not second-guess the JSON content type. Set before anything can fail.
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.use(express.json({ limit: '10kb' }));   // swipe bodies are tiny; reject anything bigger (413)
  const routes = apiRouter(db);
  app.use('/api', currentUser(db), routes);
  app.use('/feed', currentUser(db), feedRouter(db));
  app.use('/swipe', currentUser(db), swipeRouter(db));
  app.use('/matches', currentUser(db), matchesRouter(db));
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
