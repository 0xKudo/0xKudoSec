// platform/server/services/audit.js
// Append-only audit log. Never update or delete rows from audit_log.
import { createHash } from 'crypto';
import pool from './db.js';

/**
 * Canonical row-hash formula, shared by the writer (here) and the verifier
 * (retentionCron.runIntegrityCheck) so the two can never diverge.
 *
 * IMPORTANT: `metaText` is the EXACT text stored in the audit_log.meta column
 * (a `text` column holding a JSON string), never a JS object. The writer passes
 * `JSON.stringify(meta)`; the verifier passes the column value back verbatim. Do
 * NOT JSON.stringify the stored text again — that double-encodes it and makes
 * every row fail verification (the bug this helper exists to prevent).
 *
 * @param {string} userId
 * @param {string} action
 * @param {string} metaText     - the stored JSON string, verbatim
 * @param {string|null} ip
 * @param {string} createdAtISO - created_at as an ISO-8601 string
 * @returns {string} sha256 hex
 */
export function auditRowHash(userId, action, metaText, ip, createdAtISO) {
  const hashInput = `${userId}|${action}|${metaText}|${ip}|${createdAtISO}`;
  return createHash('sha256').update(hashInput).digest('hex');
}

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
    // metaText is exactly what gets stored in the (text) meta column, and exactly
    // what the verifier hashes back — via the same shared helper.
    const metaText = JSON.stringify(metaWithId);
    const rowHash = auditRowHash(userId, action, metaText, ip, createdAt);
    // Run under RLS context so the INSERT's WITH CHECK (user_id = app.user_id)
    // passes once policies are strict. audit() always receives the row's userId.
    await pool.withUser(userId, (client) =>
      client.query(
        `INSERT INTO audit_log (user_id, action, meta, ip, created_at, row_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, action, metaText, ip, createdAt, rowHash]
      )
    );
  } catch (err) {
    // Never let an audit failure break the main request
    console.error('[audit] write failed:', err.message);
  }
}
