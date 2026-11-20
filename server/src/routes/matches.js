import express from 'express';
import { listMatches } from '../services/matchService.js';

/** GET /api/matches: the user's mutual matches, newest first. */
export function matchesRouter(db) {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.json(listMatches(db, req.userId));
  });
  return router;
}
