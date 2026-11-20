import express from 'express';
import { getFeed } from '../services/feedService.js';

// HTTP concern only: query-string text to a number. Anything that is not plain digits becomes NaN,
// which the service rejects with INVALID_LIMIT (so "5.5", "1e1", " 5" and repeated ?limit= all fail).
function parseLimit(raw) {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
}

/** GET /api/feed?limit=N: profiles the user has not swiped on yet. */
export function feedRouter(db) {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.json(getFeed(db, req.userId, { limit: parseLimit(req.query.limit) }));
  });
  return router;
}
