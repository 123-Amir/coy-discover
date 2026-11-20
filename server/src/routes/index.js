import express from 'express';
import { meRouter } from './me.js';
import { feedRouter } from './feed.js';
import { swipeRouter } from './swipe.js';
import { matchesRouter } from './matches.js';

/** Shared assignment routes; mounted at both /api and the exact assignment paths. */
export function apiRouter(db) {
  const router = express.Router();
  router.use('/me', meRouter(db));
  router.use('/feed', feedRouter(db));
  router.use('/swipe', swipeRouter(db));
  router.use('/matches', matchesRouter(db));
  return router;
}
