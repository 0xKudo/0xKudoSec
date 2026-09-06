// catalogCron.js — scheduled evaluation of the community Sigma catalog.
//
// WHY THIS EXISTS
// The catalog holds ~3,600 converted rules. Evaluating all enabled rules on
// every ingest batch (Fluent Bit flushes every ~2s) meant thousands of SQL
// queries per flush and pegged the VPS CPU. Enterprise SIEMs do not run their
// full rule set per event either: scheduled/near-real-time analytics rules run
// on a cadence over a recent window (Sentinel default ~5 min, Splunk ES
// correlation searches, Elastic detection rules). This cron adopts that model:
// the user's own detection_rules + correlation_rules stay real-time on ingest,
// while the large community catalog is evaluated here every few minutes over a
// short look-back window. Idempotent — dedup on alerts_sigma_dedup makes the
// overlapping window safe.
//
// This is the TEMPORARY fix. The durable fix is an in-memory compiled matcher
// that tests one event against many rules in a single pass (see run.js notes).

import nodeCron from 'node-cron';
import db from '../db.js';
import { runCatalogForUser } from './run.js';
import { broadcast } from '../wsBroadcast.js';

// Cadence and look-back. Interval is clamped to >= 1 min.
//
// The look-back must comfortably exceed how long a full pass takes, not just the
// interval. A pass over the enabled catalog is IO-bound on the residual rules a
// trigram/GIN index cannot serve (chiefly `re` regex rules that seq-scan the
// window), so a pass can run several minutes even though CPU stays low. If the
// window were only interval+60s, a rule evaluated late in a slow pass would query
// `NOW() - window` and miss an event that was recent when the pass began — the
// event "ages out" mid-pass and never alerts. A generous window keeps every event
// visible to every rule for the whole pass; re-matching over the overlap is
// idempotent (dedup on alerts_sigma_dedup), so a wide window is safe and only
// costs cheap indexed re-scans. Override with CATALOG_LOOKBACK_SECONDS.
const INTERVAL_MIN = Math.max(1, Number(process.env.CATALOG_EVAL_INTERVAL_MIN) || 3);
const LOOKBACK_SECONDS = Math.max(
  INTERVAL_MIN * 60 + 60,
  Number(process.env.CATALOG_LOOKBACK_SECONDS) || 1200,
);

let running = false;
export function isCatalogEvalRunning() { return running; }

// Users with at least one enabled category, or an enabled per-rule override.
// Enumerated on the ops pool (cross-user, BYPASSRLS); each user is then
// evaluated in their own RLS context inside runCatalogForUser.
async function usersWithCatalog(deps) {
  const pool = deps.getOpsPool();
  const { rows } = await pool.query(
    `SELECT user_id FROM user_settings WHERE array_length(sigma_enabled_categories, 1) > 0
     UNION
     SELECT DISTINCT user_id FROM sigma_rule_overrides WHERE enabled = true`,
  );
  return rows.map(r => r.user_id);
}

export async function runCatalogEvaluation(deps = db, opts = {}) {
  if (running) return { skipped: true };
  running = true;
  const lookbackSeconds = opts.lookbackSeconds ?? LOOKBACK_SECONDS;
  const started = Date.now();
  let users = 0;
  let created = 0;
  let deduped = 0;
  try {
    const ids = await usersWithCatalog(deps);
    for (const userId of ids) {
      users++;
      try {
        const r = await runCatalogForUser(userId, lookbackSeconds, deps);
        created += r.created;
        deduped += r.deduped;
      } catch (err) {
        console.error(`[catalogCron] user ${userId} failed:`, err.message);
      }
    }
  } finally {
    running = false;
  }
  const ms = Date.now() - started;
  if (created > 0) broadcast('new_alerts', { count: created });
  if (users > 0) {
    console.log(`[catalogCron] evaluated ${users} user(s) in ${ms}ms — ${created} new, ${deduped} deduped`);
  }
  return { users, created, deduped, ms };
}

export function scheduleCatalogCron() {
  const expr = `*/${INTERVAL_MIN} * * * *`;
  nodeCron.schedule(expr, () => {
    runCatalogEvaluation().catch(e => console.error('[catalogCron]', e.message));
  });
  console.log(`[catalogCron] Scheduled: every ${INTERVAL_MIN} min (look-back ${LOOKBACK_SECONDS}s)`);
}
