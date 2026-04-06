// platform/server/services/audit.js
// Append-only audit log. Never update or delete rows from audit_log.
import { createHash } from 'crypto';
import pool from './db.js';

/**
 * Write an audit event.
 * @param {string} userId  - Auth0 user ID
 * @param {string} action  - e.g. 'ingest_key.rotate', 'rule.create', 'alert.bulk_delete'
 * @param {object} meta    - arbitrary JSON detail (rule name, count, IP, etc.)
 * @param {string} ip      - request IP for traceability
 * @param {string} requestId - correlation ID
 */
export async function audit(userId, action, meta = {}, ip = null, requestId = null) {
  try {
    const metaWithId = requestId ? { ...meta, requestId } : meta;
    const createdAt = new Date().toISOString();
    const hashInput = `${userId}|${action}|${JSON.stringify(metaWithId)}|${ip}|${createdAt}`;
    const rowHash = createHash('sha256').update(hashInput).digest('hex');
    await pool.query(
      `INSERT INTO audit_log (user_id, action, meta, ip, created_at, row_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, JSON.stringify(metaWithId), ip, createdAt, rowHash]
    );
  } catch (err) {
    // Never let an audit failure break the main request
    console.error('[audit] write failed:', err.message);
  }
}
