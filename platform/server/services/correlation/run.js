// platform/server/services/correlation/run.js
// Correlation engine runner (XDR Phase 1, Task 1.4).
//
// runCorrelation(userId, logIds) mirrors runDetectionRules(userId, logIds) so the
// ingest call site changes minimally. It:
//   * delegates detection_rules to the existing, proven runDetectionRules — the
//     Task 1.4.4 compatibility shim. (Deliberate deviation from re-evaluating them
//     as single_event docs: delegation is lower-risk and keeps siem-routes.test.js
//     and ingest.test.js green with zero changes. detection_rules can migrate to
//     correlation_rules later on their own timeline.)
//   * runs correlation_rules through the compiler + state engine, writing to the
//     existing alerts table with correlation_rule_id + group_key set.
//
// Ordering (Task 1.4.2): alert generation first; suppression is handled inside
// runDetectionRules exactly as before.

import db from '../db.js';
import { runDetectionRules } from '../detection.js';
import { parseWindowSeconds } from '../../../shared/correlationRule.js';
import { compileRule, compileMatch } from './compile.js';
import { recordThresholdEvent, recordSequenceEvent } from './state.js';
import { catalogRuleMatchesProfile, ruleIsPrefilterable, PREFILTER_FIELDS } from '../sigmaCron.js';

// Upsert one correlation alert, deduping on (user_id, correlation_rule_id, group_key)
// via the alerts_corr_dedup partial unique index. Returns true if newly created.
async function upsertCorrelationAlert(client, userId, rule, groupKey, rep) {
  const sev = rule.rule?.severity || rule.severity || 'medium';
  const { rows } = await client.query(
    `INSERT INTO alerts (user_id, correlation_rule_id, group_key, log_id, title, severity,
                         host, source_ip, username, event_id, message, count, last_seen, occurrence_times)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,NOW(),ARRAY[NOW()])
     ON CONFLICT (user_id, correlation_rule_id, group_key) WHERE correlation_rule_id IS NOT NULL
     DO UPDATE SET count = alerts.count + 1, last_seen = NOW(), log_id = EXCLUDED.log_id,
       occurrence_times = (
         array_append(alerts.occurrence_times, NOW())
       )[greatest(1, coalesce(array_length(alerts.occurrence_times, 1), 0) + 2 - 100):]
     RETURNING (xmax = 0) AS inserted`,
    [userId, rule.id, String(groupKey), rep.log_id ?? null, rule.name, sev,
     rep.host ?? null, rep.source_ip ?? null, rep.username ?? null, rep.event_id ?? null,
     rep.message ? String(rep.message).slice(0, 500) : null],
  );
  return rows[0]?.inserted === true;
}

// Upsert one CATALOG (community Sigma) alert, deduping on
// (user_id, sigma_identity, group_key) via the alerts_sigma_dedup partial index.
// Catalog rules have no correlation_rules row, so they reference sigma_identity.
async function upsertSigmaAlert(client, userId, identity, title, sev, groupKey, rep) {
  const { rows } = await client.query(
    `INSERT INTO alerts (user_id, sigma_identity, group_key, log_id, title, severity,
                         host, source_ip, username, event_id, message, count, last_seen, occurrence_times)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,NOW(),ARRAY[NOW()])
     ON CONFLICT (user_id, sigma_identity, group_key) WHERE sigma_identity IS NOT NULL
     DO UPDATE SET count = alerts.count + 1, last_seen = NOW(), log_id = EXCLUDED.log_id,
       occurrence_times = (
         array_append(alerts.occurrence_times, NOW())
       )[greatest(1, coalesce(array_length(alerts.occurrence_times, 1), 0) + 2 - 100):]
     RETURNING (xmax = 0) AS inserted`,
    [userId, identity, String(groupKey), rep.log_id ?? null, title || 'Sigma rule', sev,
     rep.host ?? null, rep.source_ip ?? null, rep.username ?? null, rep.event_id ?? null,
     rep.message ? String(rep.message).slice(0, 500) : null],
  );
  return rows[0]?.inserted === true;
}

function repFrom(row) {
  return {
    log_id: row.id ?? row.log_id ?? null,
    host: row.host ?? null,
    source_ip: row.source_ip ?? null,
    username: row.username ?? null,
    event_id: row.event_id ?? null,
    message: row.message ?? null,
  };
}

// Run one correlation rule. `client` is an RLS-scoped client (inside withUser).
// Returns { created, deduped }.
async function runOneCorrelationRule(client, userId, rule, logIds) {
  const doc = rule.rule; // jsonb rule document
  let created = 0;
  let deduped = 0;
  const bump = (isNew) => { if (isNew) created++; else deduped++; };

  if (doc.type === 'single_event') {
    const { sql, params } = compileMatch(doc.where ?? doc.selection, userId, { logIds, limit: 500 });
    const { rows } = await client.query(sql, params);
    for (const row of rows) {
      const isNew = await upsertCorrelationAlert(client, userId, rule, row.event_id ?? row.id, repFrom(row));
      bump(isNew);
    }
    return { created, deduped };
  }

  if (doc.type === 'threshold') {
    const windowSecs = parseWindowSeconds(doc.window);
    const { sql, params } = compileMatch(doc.where ?? doc.selection, userId, {
      logIds, windowSecs, keyField: doc.group_by, limit: 1000,
    });
    const { rows } = await client.query(sql, params); // already ordered by timestamp asc
    for (const row of rows) {
      if (row._key === null || row._key === undefined) continue;
      const r = await recordThresholdEventOn(client, userId, rule.id, String(row._key), row.timestamp, windowSecs, doc.count);
      if (r.fired) {
        const isNew = await upsertCorrelationAlert(client, userId, rule, row._key, repFrom(row));
        bump(isNew);
      }
    }
    return { created, deduped };
  }

  if (doc.type === 'sequence') {
    const windowSecs = parseWindowSeconds(doc.window);
    const numSteps = doc.steps.length;
    // Gather (step, key, ts, rep) for every new log matching any step, then feed
    // the state machine in timestamp order.
    const events = [];
    for (let i = 0; i < numSteps; i++) {
      const sel = doc.steps[i].where ?? doc.steps[i].selection ?? doc.steps[i];
      const { sql, params } = compileMatch(sel, userId, { logIds, windowSecs, keyField: doc.join_on, limit: 1000 });
      const { rows } = await client.query(sql, params);
      for (const row of rows) {
        if (row._key === null || row._key === undefined) continue;
        events.push({ step: i + 1, key: String(row._key), ts: row.timestamp, rep: repFrom(row) });
      }
    }
    events.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    for (const ev of events) {
      const r = await recordSequenceEventOn(client, userId, rule.id, ev.key, ev.step, ev.ts, windowSecs, numSteps);
      if (r.fired) {
        const isNew = await upsertCorrelationAlert(client, userId, rule, ev.key, ev.rep);
        bump(isNew);
      }
    }
    return { created, deduped };
  }

  if (doc.type === 'join') {
    const { sql, params } = compileRule(doc, userId, { limit: 1000 });
    const { rows } = await client.query(sql, params);
    for (const row of rows) {
      const isNew = await upsertCorrelationAlert(client, userId, rule, row.group_key, repFrom(row));
      bump(isNew);
    }
    return { created, deduped };
  }

  if (doc.type === 'absence') {
    // Absence is schedule-evaluated, not ingest-triggered. Only run on a full pass
    // (logIds === null); at ingest there is nothing to do.
    if (logIds) return { created, deduped };
    const { sql, params } = compileRule(doc, userId, { limit: 1000 });
    const { rows } = await client.query(sql, params);
    for (const row of rows) {
      const key = row.group_key ?? 'absent';
      const isNew = await upsertCorrelationAlert(client, userId, rule, key, {});
      bump(isNew);
    }
    return { created, deduped };
  }

  return { created, deduped };
}

// Evaluate the user's ENABLED catalog (community Sigma) rules against this batch.
// `client` is RLS-scoped (inside withUser). Catalog rules from sigmaToRule are only
// single_event or threshold, both compiled statelessly — no correlation_state, so
// the state FK to correlation_rules is never involved.
//
// Effective set: a converted, non-retired catalog rule is active for the user when
//   (its category is enabled AND not disabled by an override)  OR  (explicitly enabled).
//
// SCALING (Phase 3): this runs one query per enabled rule against the batch. With
// large categories that is many queries; Phase 3 adds a prefilter that selects only
// rules whose signature intersects the batch. Correct now, optimized later.
// Evaluate the user's enabled community-catalog (Sigma) rules.
//  - logIds set  → ingest-batch scope (fast, real-time). NOTE: no longer called
//    from the ingest path; kept for completeness/tests.
//  - logIds null → time-window scope via opts.lookbackSeconds, used by the
//    scheduled evaluator (catalogCron) so the ~3.6k catalog rules never run on
//    the ingest hot path. See how enterprise SIEMs schedule analytics rules.
async function runCatalogRules(client, userId, logIds, opts = {}) {
  let created = 0;
  let deduped = 0;

  const { rows: settings } = await client.query(
    'SELECT sigma_enabled_categories FROM user_settings WHERE user_id = $1', [userId],
  );
  const categories = settings[0]?.sigma_enabled_categories || [];

  // Prefilter (Phase 3): at ingest, restrict to rules whose coarse signature could
  // match this batch — a rule is skipped only when EVERY dimension it pins (via
  // eq/in) has no value present in the batch. Unpinned dimensions ('{}') never
  // exclude. On a full pass (logIds null) there is no batch to profile, so all
  // enabled rules run (the scheduled, infrequent path).
  const params = [userId, categories];
  let prefilter = '';
  if (logIds && logIds.length) {
    const { rows: sig } = await client.query(
      `SELECT
         coalesce(array_agg(DISTINCT event_id)      FILTER (WHERE event_id IS NOT NULL), '{}') AS eids,
         coalesce(array_agg(DISTINCT event_category) FILTER (WHERE event_category IS NOT NULL), '{}') AS cats,
         coalesce(array_agg(DISTINCT source)        FILTER (WHERE source IS NOT NULL), '{}') AS srcs
       FROM logs WHERE user_id = $1 AND id = ANY($2)`,
      [userId, logIds],
    );
    params.push(sig[0].eids, sig[0].cats, sig[0].srcs);
    prefilter =
      ` AND (s.sig_event_ids  = '{}' OR s.sig_event_ids  && $3::integer[])
        AND (s.sig_categories = '{}' OR s.sig_categories && $4::text[])
        AND (s.sig_sources    = '{}' OR s.sig_sources    && $5::text[])`;
  }

  const { rows: rules } = await client.query(
    `SELECT s.identity, s.title, s.rule, s.severity,
            s.sig_event_ids, s.sig_categories, s.sig_sources, s.sig_terms, s.has_regex,
            o.enabled AS o_enabled, o.severity AS o_severity
     FROM sigma_rules s
     LEFT JOIN sigma_rule_overrides o ON o.user_id = $1 AND o.sigma_identity = s.identity
     WHERE s.convert_status = 'converted' AND s.retired = false AND s.rule IS NOT NULL
       AND ( (s.category = ANY($2::text[]) AND COALESCE(o.enabled, true) = true)
             OR o.enabled = true )${prefilter}`,
    params,
  );
  if (!rules.length) return { created, deduped };

  // Phase C window-mode prefilter. On the scheduled full pass (logIds null) there
  // is no batch for the SQL prefilter above, so profile the recent window ONCE and
  // skip, in application code, every rule whose required fields/dimensions are
  // absent from it. This turns "run all ~3.6k enabled rules" into "run the handful
  // whose fields appear in recent telemetry". See docs/plans/2026-09-06-sigma-catalog-performance.md Phase C.
  let activeRules = rules;
  if (!logIds) {
    const profile = await buildWindowProfile(client, userId, opts.lookbackSeconds);
    activeRules = rules.filter((r) => {
      // Deferred until the in-memory matcher (Phase D): a regex rule that pins
      // nothing prefilterable can only be found by a seq scan, which has no SQL
      // index answer and pegs the box. Skip it here.
      if (r.has_regex && !ruleIsPrefilterable(r)) return false;
      // Coarse dimensions (event_id/category/source): if pinned but none present
      // in the window, the rule cannot match.
      if (!coarseDimsPresent(r, profile)) return false;
      // High-selectivity fields (process_name/file_path/…): same test, per field.
      if (!catalogRuleMatchesProfile(r.sig_terms, profile)) return false;
      return true;
    });
    if (!activeRules.length) return { created, deduped };
  }

  for (const r of activeRules) {
    // SAVEPOINT-isolate every rule. A rule whose SQL raises a real Postgres error
    // (a bad `re` regex, a numeric/text mismatch, a statement timeout) aborts the
    // surrounding transaction; without a savepoint, EVERY rule evaluated after it
    // fails with "current transaction is aborted" and is silently skipped. Rolling
    // back to the savepoint recovers the transaction so the remaining rules run.
    // This is what makes good the promise "one bad catalog rule must not sink the batch."
    await client.query('SAVEPOINT cat_rule');
    try {
      const doc = r.rule; // jsonb correlation rule document
      const sev = r.o_severity || r.severity || doc.severity || 'medium';
      const bump = (isNew) => { if (isNew) created++; else deduped++; };

      if (doc.type === 'single_event') {
        const { sql, params } = compileMatch(doc.where ?? doc.selection, userId, { logIds, lookbackSeconds: opts.lookbackSeconds, limit: 500 });
        const { rows } = await client.query(sql, params);
        for (const row of rows) {
          bump(await upsertSigmaAlert(client, userId, r.identity, r.title, sev, row.event_id ?? row.id, repFrom(row)));
        }
      } else if (doc.type === 'threshold') {
        const { sql, params } = compileRule(doc, userId, { limit: 1000 });
        const { rows } = await client.query(sql, params);
        for (const row of rows) {
          bump(await upsertSigmaAlert(client, userId, r.identity, r.title, sev, row.group_key, repFrom(row)));
        }
      }
      // sigmaToRule emits only single_event/threshold; any other type is skipped.
      await client.query('RELEASE SAVEPOINT cat_rule');
    } catch (err) {
      // Recover the aborted transaction so subsequent rules still evaluate.
      await client.query('ROLLBACK TO SAVEPOINT cat_rule');
      console.error(`[correlation] catalog rule ${r.identity} failed:`, err.message);
    }
  }
  return { created, deduped };
}

// Profile the recent look-back window ONCE: the distinct values present for each
// coarse dimension and each prefilterable field. One aggregation replaces a
// per-rule scan. Values are lowercased for the case-insensitive term match; the
// per-field DISTINCT set over a short window is small (dozens to low hundreds).
const PROFILE_VALUE_CAP = 5000;
async function buildWindowProfile(client, userId, lookbackSeconds) {
  const secs = Number.isFinite(lookbackSeconds) && lookbackSeconds > 0 ? Math.floor(lookbackSeconds) : 1200;
  const fields = [...PREFILTER_FIELDS];
  const fieldAggs = fields
    .map((f, i) => `coalesce(array_agg(DISTINCT lower(${f})) FILTER (WHERE ${f} IS NOT NULL), '{}') AS f${i}`)
    .join(',\n         ');
  const { rows } = await client.query(
    `SELECT
         coalesce(array_agg(DISTINCT event_id)       FILTER (WHERE event_id IS NOT NULL), '{}')       AS eids,
         coalesce(array_agg(DISTINCT event_category) FILTER (WHERE event_category IS NOT NULL), '{}') AS cats,
         coalesce(array_agg(DISTINCT source)         FILTER (WHERE source IS NOT NULL), '{}')         AS srcs,
         ${fieldAggs}
       FROM logs
       WHERE user_id = $1 AND timestamp >= NOW() - make_interval(secs => $2)`,
    [userId, secs],
  );
  const row = rows[0] || {};
  const profile = {
    event_ids: (row.eids || []).map(Number),
    event_categories: (row.cats || []).map(String),
    sources: (row.srcs || []).map(String),
  };
  fields.forEach((f, i) => { profile[f] = (row[`f${i}`] || []).slice(0, PROFILE_VALUE_CAP); });
  return profile;
}

// Coarse-dimension presence check, mirroring the ingest SQL prefilter: a rule is
// admissible unless it pins a dimension (via eq/in) whose values are all absent
// from the window. An empty sig array never excludes.
function coarseDimsPresent(r, profile) {
  const has = (sig, present) => !sig || sig.length === 0 || sig.some(v => present.includes(v));
  return has((r.sig_event_ids || []).map(Number), profile.event_ids)
    && has((r.sig_categories || []).map(String), profile.event_categories)
    && has((r.sig_sources || []).map(String), profile.sources);
}

// State helpers accept a `deps` with withUser; here we already hold a client, so
// wrap it to run the same read-modify-write on this transaction's client.
async function recordThresholdEventOn(client, userId, ruleId, stateKey, eventTs, windowSecs, count) {
  const wrap = { withUser: (_uid, fn) => fn(client) };
  return recordThresholdEvent(userId, ruleId, stateKey, eventTs, windowSecs, count, wrap);
}
async function recordSequenceEventOn(client, userId, ruleId, stateKey, step, eventTs, windowSecs, numSteps) {
  const wrap = { withUser: (_uid, fn) => fn(client) };
  return recordSequenceEvent(userId, ruleId, stateKey, step, eventTs, windowSecs, numSteps, wrap);
}

// Public API — mirrors runDetectionRules(userId, logIds).
export async function runCorrelation(userId, logIds = null, deps = db) {
  // 1) detection_rules via the existing engine (unchanged behavior + suppression).
  const det = await runDetectionRules(userId, logIds);

  // 2) correlation_rules + catalog rules through the new engine, one RLS txn.
  let corrCreated = 0;
  let corrDeduped = 0;
  let catCreated = 0;
  let catDeduped = 0;
  try {
    await deps.withUser(userId, async (client) => {
      // statement_timeout guards every correlation query in this txn.
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      const { rows: rules } = await client.query(
        'SELECT id, name, severity, rule FROM correlation_rules WHERE user_id = $1 AND enabled = true',
        [userId],
      );
      for (const rule of rules) {
        try {
          const { created, deduped } = await runOneCorrelationRule(client, userId, rule, logIds);
          corrCreated += created;
          corrDeduped += deduped;
        } catch (err) {
          // One bad rule must not sink the batch.
          console.error(`[correlation] rule ${rule.id} failed:`, err.message);
        }
      }

      // NOTE: community-catalog (Sigma) rules are intentionally NOT evaluated here.
      // With ~3.6k enabled rules, running them per ingest batch pegged the CPU
      // (thousands of queries per flush). They are now evaluated by the scheduled
      // catalogCron over a recent time window. The user's own detection_rules and
      // correlation_rules above stay real-time on ingest.
    });
  } catch (err) {
    console.error('[correlation] run failed:', err.message);
  }

  return {
    created: (det.created || 0) + corrCreated + catCreated,
    deduped: (det.deduped || 0) + corrDeduped + catDeduped,
    suppressed: det.suppressed || 0,
    correlation: { created: corrCreated, deduped: corrDeduped },
    catalog: { created: catCreated, deduped: catDeduped },
  };
}

// Scheduled evaluation of one user's enabled community-catalog rules over the
// last `lookbackSeconds` of logs. Called by catalogCron off the ingest hot path.
// Idempotent: re-matching the same events dedupes via alerts_sigma_dedup, so an
// overlapping lookback window is safe.
export async function evaluateCatalog(userId, { logIds = null, lookbackSeconds } = {}, deps = db) {
  let created = 0;
  let deduped = 0;
  await deps.withUser(userId, async (client) => {
    // Per-rule timeout. Kept deliberately tight: a pass evaluates ~3,600 rules,
    // and a rule that cannot finish in 2s over a short look-back window (many are
    // unindexed raw `->> ILIKE` seq scans) would otherwise stall the whole pass
    // for up to 20s each, pushing pass duration past the look-back window so later
    // rules never see recent events and alerts commit minutes late. A slow rule
    // fails fast in isolation (savepoint) and the pass keeps moving. The durable
    // fix is indexing raw fields / an in-memory compiled matcher (see notes above).
    await client.query("SET LOCAL statement_timeout = '2000ms'");
    const c = await runCatalogRules(client, userId, logIds, { lookbackSeconds });
    created += c.created;
    deduped += c.deduped;
  });
  return { created, deduped };
}

export function runCatalogForUser(userId, lookbackSeconds, deps = db) {
  return evaluateCatalog(userId, { lookbackSeconds }, deps);
}
