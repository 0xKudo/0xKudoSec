// detection.js — shared detection rule runner
// Called at ingest time (scoped to new log IDs) and from the manual /rules/run endpoint.
//
// Order of operations:
//   1. Run alert rules first — collect alerted log IDs
//   2. Run suppress rules — but never suppress a log that already triggered an alert

import pool from './db.js';

function ruleConditions(rule, userId) {
  const params = [userId];
  const conds = ['l.user_id = $1'];
  if (rule.match_event_id) { params.push(rule.match_event_id); conds.push(`l.event_id = $${params.length}`); }
  if (rule.match_category) { params.push(rule.match_category); conds.push(`l.event_category = $${params.length}`); }
  if (rule.match_severity) { params.push(rule.match_severity); conds.push(`l.severity = $${params.length}`); }
  if (rule.match_username) { params.push(`%${rule.match_username}%`); conds.push(`l.username ILIKE $${params.length}`); }
  if (rule.match_host)     { params.push(`%${rule.match_host}%`);     conds.push(`l.host ILIKE $${params.length}`); }
  if (rule.match_message)  { params.push(`%${rule.match_message}%`);  conds.push(`l.message ILIKE $${params.length}`); }
  if (rule.match_process)  { params.push(`%${rule.match_process}%`);  conds.push(`l.process_name ILIKE $${params.length}`); }
  if (rule.match_src_ip)   { params.push(`%${rule.match_src_ip}%`);   conds.push(`l.source_ip::text ILIKE $${params.length}`); }
  if (rule.match_dest_ip)  { params.push(`%${rule.match_dest_ip}%`);  conds.push(`l.dest_ip::text ILIKE $${params.length}`); }
  if (rule.match_dest_port){ params.push(rule.match_dest_port);        conds.push(`l.dest_port = $${params.length}`); }
  return { params, conds };
}

// Run all enabled detection rules for a user.
// If logIds is provided, only evaluate those specific log rows (ingest-time detection).
// If logIds is null, scans last 24 hours (manual run).
export async function runDetectionRules(userId, logIds = null) {
  const { rows: rules } = await pool.query(
    'SELECT * FROM detection_rules WHERE user_id = $1 AND enabled = true',
    [userId]
  );
  if (!rules.length) return { created: 0, deduped: 0 };

  const suppressRules = rules.filter(r => r.action === 'suppress');
  const alertRules    = rules.filter(r => r.action !== 'suppress');

  // Step 1: Run alert rules first, track which log IDs triggered alerts
  let created = 0;
  let deduped = 0;
  const alertedLogIds = new Set();

  for (const rule of alertRules) {
    const { params, conds } = ruleConditions(rule, userId);

    if (logIds) {
      params.push(logIds);
      conds.push(`l.id = ANY($${params.length})`);
    } else {
      conds.push(`l.id NOT IN (SELECT log_id FROM alerts WHERE user_id = $1 AND rule_id = ${rule.id} AND log_id IS NOT NULL)`);
      conds.push(`l.timestamp > NOW() - INTERVAL '24 hours'`);
    }

    const { rows: matches } = await pool.query(
      `SELECT l.id, l.host, l.source_ip, l.username, l.event_id, l.message
       FROM logs l WHERE ${conds.join(' AND ')} LIMIT 500`,
      params
    );
    for (const log of matches) {
      const alertValues = [userId, rule.id, log.id, rule.name, rule.severity,
        log.host, log.source_ip, log.username, log.event_id,
        log.message ? log.message.slice(0, 500) : null];

      let inserted;
      if (process.env.STORAGE_MODE === 'local') {
        // SQLite has no equivalent to Postgres's xmax system column (used
        // below to distinguish insert-vs-update from a single upsert
        // statement), so check existence first via the same unique key the
        // alerts_dedup constraint covers (user_id, rule_id, event_id), then
        // branch. Two statements instead of one, but only on the local path —
        // the Postgres/cloud path keeps its existing single-statement upsert.
        const { rows: existingRows } = await pool.query(
          'SELECT id FROM alerts WHERE user_id = $1 AND rule_id = $2 AND event_id = $3',
          [userId, rule.id, log.event_id]
        );
        if (existingRows.length) {
          await pool.query(
            'UPDATE alerts SET count = count + 1, last_seen = NOW(), log_id = $1 WHERE id = $2',
            [log.id, existingRows[0].id]
          );
          inserted = false;
        } else {
          await pool.query(
            `INSERT INTO alerts (user_id, rule_id, log_id, title, severity, host, source_ip, username, event_id, message, count, last_seen)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, NOW())`,
            alertValues
          );
          inserted = true;
        }
      } else {
        const result = await pool.query(
          `INSERT INTO alerts (user_id, rule_id, log_id, title, severity, host, source_ip, username, event_id, message, count, last_seen)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, NOW())
           ON CONFLICT ON CONSTRAINT alerts_dedup
           DO UPDATE SET count = alerts.count + 1, last_seen = NOW(), log_id = EXCLUDED.log_id
           RETURNING (xmax = 0) AS inserted`,
          alertValues
        );
        inserted = result.rows[0]?.inserted;
      }

      alertedLogIds.add(log.id);
      if (inserted) created++;
      else deduped++;
    }
  }

  // Step 2: Build suppressed log ID set — never suppress a log that triggered an alert
  const suppressedLogIds = new Set();
  for (const rule of suppressRules) {
    const { params, conds } = ruleConditions(rule, userId);
    if (logIds) {
      params.push(logIds);
      conds.push(`l.id = ANY($${params.length})`);
    } else {
      conds.push(`l.timestamp > NOW() - INTERVAL '24 hours'`);
    }
    const { rows } = await pool.query(
      `SELECT l.id FROM logs l WHERE ${conds.join(' AND ')} LIMIT 10000`,
      params
    );
    rows.forEach(r => {
      if (!alertedLogIds.has(r.id)) suppressedLogIds.add(r.id);
    });
  }

  return { created, deduped, suppressed: suppressedLogIds.size };
}
