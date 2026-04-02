// platform/server/services/retentionCron.js
// Runs daily at 02:00 server time.
// Deletes logs older than each user's configured retention period.
// Users with no setting default to 90 days.

import cron from 'node-cron';
import pool from './db.js';

const DEFAULT_RETENTION_DAYS = 90;

async function runRetention() {
  try {
    // Get all users with a custom retention setting
    const { rows: settings } = await pool.query(
      'SELECT user_id, log_retention_days FROM user_settings WHERE log_retention_days IS NOT NULL'
    );

    const userMap = {};
    for (const row of settings) {
      userMap[row.user_id] = row.log_retention_days;
    }

    // Get all distinct user_ids in logs
    const { rows: users } = await pool.query(
      'SELECT DISTINCT user_id FROM logs WHERE user_id IS NOT NULL'
    );

    let totalDeleted = 0;
    for (const { user_id } of users) {
      const days = userMap[user_id] ?? DEFAULT_RETENTION_DAYS;
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
  } catch (err) {
    console.error('[retention] Error during log retention run:', err.message);
  }
}

export function startRetentionCron() {
  // Run daily at 02:00
  cron.schedule('0 2 * * *', runRetention);
  console.log('[retention] Log retention cron scheduled (daily at 02:00)');
}
