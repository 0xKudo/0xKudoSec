// platform/server/services/audit.js
// Append-only audit log. Never update or delete rows from audit_log.
import pool from './db.js';

/**
 * Write an audit event.
 * @param {string} userId  - Auth0 user ID
 * @param {string} action  - e.g. 'ingest_key.rotate', 'rule.create', 'alert.bulk_delete'
 * @param {object} meta    - arbitrary JSON detail (rule name, count, IP, etc.)
 * @param {string} ip      - request IP for traceability
 */
export async function audit(userId, action, meta = {}, ip = null) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, meta, ip) VALUES ($1, $2, $3, $4)`,
      [userId, action, JSON.stringify(meta), ip]
    );
  } catch (err) {
    // Never let an audit failure break the main request
    console.error('[audit] write failed:', err.message);
  }
}
