import express from 'express';
import { getCurrentUserProfile } from '../db/currentUser.js';

/** GET /api/me: the logged-in user's own profile. */
export function meRouter(db) {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.json(getCurrentUserProfile(db, req.userId));
  });
  return router;
}
