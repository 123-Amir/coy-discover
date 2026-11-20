import express from 'express';
import { swipe } from '../services/swipeService.js';

/**
 * POST /api/swipe  { profileId, action }
 * Always 200 on success, including an identical repeat (alreadySwiped: true). The service
 * validates the body and decides everything; the acting user comes from the middleware.
 */
export function swipeRouter(db) {
  const router = express.Router();
  router.post('/', (req, res) => {
    res.json(swipe(db, req.userId, req.body));
  });
  return router;
}
