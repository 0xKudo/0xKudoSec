// platform/server/middleware/dbContext.js
// Attaches req.db — a per-request DB handle whose every query runs with the
// RLS session variable app.user_id set to the authenticated user. Must be
// mounted AFTER requireAuth so req.auth.sub is available.
//
// Handlers call req.db.query(text, params) exactly like the old pool.query.
// Each query runs in its own short RLS transaction (see db.withUserPool), so
// there is no long-held client and no pool-exhaustion risk. Multi-statement
// atomic work should use db.withUser(userId, fn) directly.
import db from '../services/db.js';

export function dbContext(req, res, next) {
  const userId = req.auth?.sub;
  if (!userId) {
    // requireAuth should have rejected already; fail closed rather than run
    // queries with no user context.
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  req.db = db.withUserPool(userId);
  next();
}
