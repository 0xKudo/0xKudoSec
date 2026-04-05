// platform/server/services/retentionCron.js
// Runs daily at 02:00 server time.
// Deletes logs older than each user's configured retention period.
// Users with no setting default to 90 days.
// Audit log retention is per-user configurable. Default 365 days per PCI DSS 10.7.
// If audit_log_retention_enabled = false for a user, their audit entries are never auto-purged.

import cron from 'node-cron';
import pool from './db.js';

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_AUDIT_RETENTION_DAYS = 365;

async function runRetention() {
  try {
    // Load all user settings
    const { rows: settings } = await pool.query(
      `SELECT user_id, log_retention_days, audit_log_retention_enabled, audit_log_retention_days
       FROM user_settings`
    );

    const userMap = {};
    for (const row of settings) {
      userMap[row.user_id] = row;
    }

    // ── Event log retention ───────────────────────────────────────────────────
    const { rows: logUsers } = await pool.query(
      'SELECT DISTINCT user_id FROM logs WHERE user_id IS NOT NULL'
    );

    let totalDeleted = 0;
    for (const { user_id } of logUsers) {
      const days = userMap[user_id]?.log_retention_days ?? DEFAULT_RETENTION_DAYS;
      const { rowCount } = await pool.query(
        `DELETE FROM logs WHERE user_id = $1 AND timestamp < NOW() - INTERVAL '${days} days'`,
        [user_id]
      );
      if (rowCount > 0) {
        console.log(`[retention] Deleted ${rowCount} logs older than ${days} days for user ${user_id}`);
        totalDeleted += rowCount;
      }
    }

    if (totalDeleted === 0) {
      console.log('[retention] No logs expired.');
    }

    // ── Audit log retention ───────────────────────────────────────────────────
    // Per-user: only purge if audit_log_retention_enabled = true (or no setting on file).
    // Users with audit_log_retention_enabled = false keep their audit log indefinitely
    // (e.g. they have an external archiving pipeline). Warn in logs when this is the case.
    const { rows: auditUsers } = await pool.query(
      'SELECT DISTINCT user_id FROM audit_log WHERE user_id IS NOT NULL'
    );

    let totalAuditDeleted = 0;
    for (const { user_id } of auditUsers) {
      const s = userMap[user_id];
      const enabled = s?.audit_log_retention_enabled ?? true;

      if (!enabled) {
        console.log(`[retention] Audit log auto-purge DISABLED for user ${user_id} — entries retained indefinitely`);
        continue;
      }

      const days = s?.audit_log_retention_days ?? DEFAULT_AUDIT_RETENTION_DAYS;
      const { rowCount } = await pool.query(
        `DELETE FROM audit_log WHERE user_id = $1 AND created_at < NOW() - INTERVAL '${days} days'`,
        [user_id]
      );
      if (rowCount > 0) {
        console.log(`[retention] Deleted ${rowCount} audit entries older than ${days} days for user ${user_id}`);
        totalAuditDeleted += rowCount;
      }
    }

    // Also purge audit entries with no user_id (system events) using the global default
    const { rowCount: sysAuditDeleted } = await pool.query(
      `DELETE FROM audit_log WHERE user_id IS NULL AND created_at < NOW() - INTERVAL '${DEFAULT_AUDIT_RETENTION_DAYS} days'`
    );
    if (sysAuditDeleted > 0) {
      console.log(`[retention] Deleted ${sysAuditDeleted} system audit entries older than ${DEFAULT_AUDIT_RETENTION_DAYS} days`);
      totalAuditDeleted += sysAuditDeleted;
    }

    if (totalAuditDeleted === 0) {
      console.log('[retention] No audit log entries expired.');
    }
  } catch (err) {
    console.error('[retention] Error during log retention run:', err.message);
  }
}

export function startRetentionCron() {
  // Run daily at 02:00
  cron.schedule('0 2 * * *', runRetention);
  console.log('[retention] Log retention cron scheduled (daily at 02:00)');
}
