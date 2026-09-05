// platform/server/services/retentionCron.js
// Runs daily at 02:00 server time.
// Deletes logs older than each user's configured retention period.
// Users with no setting default to 90 days.
// Audit log retention is per-user configurable. Default 365 days per PCI DSS 10.7.
// If audit_log_retention_enabled = false for a user, their audit entries are never auto-purged.

import { createHash } from 'crypto';
import cron from 'node-cron';
import db from './db.js';
import { pruneCorrelationState } from './correlation/state.js';

let _opsPool;
function getOpsPool() {
  if (!_opsPool) _opsPool = db.getOpsPool();
  return _opsPool;
}

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_AUDIT_RETENTION_DAYS = 365;

// ── logs partition maintenance (0.2) ────────────────────────────────────────
// `logs` is RANGE-partitioned by month. Partition DDL (CREATE/DROP PARTITION)
// requires ownership of the parent table, so it runs as cybertools_app (the
// owner, granted CREATE on schema public) via the main pool — NOT the ops pool.
const PARTITION_LEAD_MONTHS = 2; // keep this many future months pre-created

function partitionName(d) {
  return `logs_y${d.getUTCFullYear()}m${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Pre-create the current month + next PARTITION_LEAD_MONTHS so ingest never
// falls into logs_default. Idempotent (CREATE ... IF NOT EXISTS). Names/dates
// are code-generated, not user input.
async function ensureLogPartitions() {
  const owner = db.getPool();
  const now = new Date();
  for (let i = 0; i <= PARTITION_LEAD_MONTHS; i++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1));
    const name = partitionName(start);
    try {
      await owner.query(
        `CREATE TABLE IF NOT EXISTS public.${name} PARTITION OF public.logs ` +
        `FOR VALUES FROM ('${start.toISOString().slice(0, 10)}') TO ('${end.toISOString().slice(0, 10)}')`
      );
    } catch (err) {
      console.error(`[retention] ensureLogPartitions ${name}:`, err.message);
    }
  }
}

// Drop monthly partitions whose entire range is older than the LONGEST per-user
// retention — those months no user can still need. Per-user trimming inside
// still-live months is handled by the row-DELETE loop. DROP PARTITION is the big
// space/perf win; it's instant vs a mass DELETE + VACUUM.
async function dropOldLogPartitions(maxRetentionDays) {
  const owner = db.getPool();
  const cutoff = new Date(Date.now() - maxRetentionDays * 86400 * 1000);
  const { rows } = await owner.query(`
    SELECT c.relname, pg_get_expr(c.relpartbound, c.oid) AS bound
    FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'public.logs'::regclass AND c.relname <> 'logs_default'
  `);
  for (const { relname, bound } of rows) {
    // bound: FOR VALUES FROM ('...') TO ('2026-07-01 00:00:00+00')
    const m = bound && bound.match(/TO \('([^']+)'\)/);
    if (!m) continue;
    if (new Date(m[1]) <= cutoff) {
      try {
        await owner.query(`DROP TABLE IF EXISTS public.${relname}`);
        console.log(`[retention] dropped logs partition ${relname} (older than ${maxRetentionDays}d)`);
      } catch (err) {
        console.error(`[retention] drop ${relname}:`, err.message);
      }
    }
  }
}

async function runRetention() {
  try {
    // Load all user settings. Cross-user maintenance runs on the BYPASSRLS ops
    // pool — with strict RLS and no app.user_id context the main pool sees no rows.
    const { rows: settings } = await getOpsPool().query(
      `SELECT user_id, log_retention_days, audit_log_retention_enabled, audit_log_retention_days
       FROM user_settings`
    );

    const userMap = {};
    for (const row of settings) {
      userMap[row.user_id] = row;
    }

    // ── Partition maintenance (0.2) ───────────────────────────────────────────
    // Ensure upcoming month partitions exist, then drop months older than the
    // longest retention any user has configured (global DROP PARTITION is safe
    // only past the max; per-user trimming below handles the live months).
    await ensureLogPartitions();
    const maxRetentionDays = Math.max(
      DEFAULT_RETENTION_DAYS,
      ...settings.map(s => s.log_retention_days || DEFAULT_RETENTION_DAYS)
    );
    await dropOldLogPartitions(maxRetentionDays);

    // ── Event log retention ───────────────────────────────────────────────────
    const { rows: logUsers } = await getOpsPool().query(
      'SELECT DISTINCT user_id FROM logs WHERE user_id IS NOT NULL'
    );

    let totalDeleted = 0;
    for (const { user_id } of logUsers) {
      const days = userMap[user_id]?.log_retention_days ?? DEFAULT_RETENTION_DAYS;
      const { rowCount } = await getOpsPool().query(
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

    // realtime_analysis lost its ON DELETE CASCADE FK when logs was partitioned
    // (0.2). Clean rows whose referenced log no longer exists (e.g. after a
    // partition drop or per-user delete). Runs on the ops pool (BYPASSRLS).
    const { rowCount: raOrphans } = await getOpsPool().query(
      `DELETE FROM realtime_analysis ra
        WHERE ra.log_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM logs l WHERE l.id = ra.log_id)`
    );
    if (raOrphans > 0) console.log(`[retention] cleaned ${raOrphans} orphaned realtime_analysis rows`);

    // Correlation state expiry (XDR Phase 1): drop sliding-window state untouched
    // for longer than the window ceiling — no live window can reference it.
    try {
      const staleState = await pruneCorrelationState();
      if (staleState > 0) console.log(`[retention] pruned ${staleState} expired correlation_state rows`);
    } catch (err) {
      // correlation_state may not exist yet on DBs predating Phase 1 — non-fatal.
      console.warn('[retention] correlation_state prune skipped:', err.message);
    }

    // ── Audit log retention ───────────────────────────────────────────────────
    // Per-user: only purge if audit_log_retention_enabled = true (or no setting on file).
    // Users with audit_log_retention_enabled = false keep their audit log indefinitely
    // (e.g. they have an external archiving pipeline). Warn in logs when this is the case.
    const { rows: auditUsers } = await getOpsPool().query(
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
      const { rowCount } = await getOpsPool().query(
        `DELETE FROM audit_log WHERE user_id = $1 AND created_at < NOW() - INTERVAL '${days} days'`,
        [user_id]
      );
      if (rowCount > 0) {
        console.log(`[retention] Deleted ${rowCount} audit entries older than ${days} days for user ${user_id}`);
        totalAuditDeleted += rowCount;
      }
    }

    // Also purge audit entries with no user_id (system events) using the global default
    const { rowCount: sysAuditDeleted } = await getOpsPool().query(
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

async function runIntegrityCheck() {
  try {
    const { rows } = await getOpsPool().query(
      `SELECT id, user_id, action, meta, ip, created_at, row_hash
       FROM audit_log
       WHERE created_at > NOW() - INTERVAL '25 hours'
       AND row_hash IS NOT NULL`
    );

    let mismatches = 0;
    for (const row of rows) {
      const hashInput = `${row.user_id}|${row.action}|${JSON.stringify(row.meta)}|${row.ip}|${new Date(row.created_at).toISOString()}`;
      const expected = createHash('sha256').update(hashInput).digest('hex');
      if (expected !== row.row_hash) {
        mismatches++;
        console.error(`[integrity] MISMATCH audit_log id=${row.id} action=${row.action} user=${row.user_id}`);
      }
    }

    if (mismatches === 0) {
      console.log(`[integrity] Audit log check passed — ${rows.length} rows verified.`);
    } else {
      console.error(`[integrity] AUDIT LOG INTEGRITY FAILURE — ${mismatches} mismatched rows detected.`);
    }
  } catch (err) {
    console.error('[integrity] Check failed:', err.message);
  }
}

// Exported for tests / manual rehearsal (0.2 partition maintenance).
export { runRetention, ensureLogPartitions, dropOldLogPartitions };

export function startRetentionCron() {
  // Run daily at 02:00
  cron.schedule('0 2 * * *', runRetention);
  console.log('[retention] Log retention cron scheduled (daily at 02:00)');
  // Run integrity check daily at 02:15 (after retention completes)
  cron.schedule('15 2 * * *', runIntegrityCheck);
  console.log('[integrity] Audit log integrity check scheduled (daily at 02:15)');
}
