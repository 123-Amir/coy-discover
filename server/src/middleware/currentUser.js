import { getCurrentUserId } from '../db/currentUser.js';

/**
 * The app has no login: the one logged-in user is whoever the database marks as the current user.
 * This is the ONLY place the acting user is decided. Nothing in the request (header, query string,
 * body) can change it, and routes only ever read `req.userId`. Swapping in real authentication
 * later means changing this one file.
 */
export function currentUser(db) {
  return (req, res, next) => {
    try {
      req.userId = getCurrentUserId(db);
    } catch (err) {
      return next(err);
    }
    next();
  };
}
