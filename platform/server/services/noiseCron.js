import db from './db.js';
import { audit } from './audit.js';

const HIGH_THRESHOLD = 70;
const MEDIUM_THRESHOLD = 40;

export async function scoreNoiseCandidates(userId, onProgress = null) {
  const pool = db.getPool();

  const { rows: thresholdRows } = await pool.query(`
    SELECT
      COUNT(*) AS total_events,
      EXTRACT(EPOCH FROM (NOW() - MIN(timestamp))) / 86400 AS days_ingested
    FROM logs
    WHERE user_id = $1
  `, [userId]);

  const { total_events, days_ingested } = thresholdRows[0];
  if (parseInt(total_events) < 10000 && parseFloat(days_ingested || 0) < 7) {
    return { skipped: true, reason: 'threshold_not_met', total_events, days_ingested };
  }

  const { rows: patterns } = await pool.query(`
    SELECT
      source,
      event_category,
      event_id,
      process_name,
      username,
      host,
      jsonb_build_object(
        'source', source,
        'event_category', event_category,
        'event_id', event_id,
        'process_name', process_name,
        'username', username
      ) AS field_signature,
      COUNT(*) AS event_count,
      COUNT(*) / 7.0 AS daily_avg,
      MIN(timestamp) AS first_seen,
      MAX(timestamp) AS last_seen,
      STDDEV(EXTRACT(EPOCH FROM timestamp) % 3600) AS time_stddev
    FROM logs
    WHERE user_id = $1
      AND timestamp > NOW() - INTERVAL '7 days'
    GROUP BY source, event_category, event_id, process_name, username, host
    HAVING COUNT(*) / 7.0 > 10
  `, [userId]);

  // Skip patterns already scored and actioned (approved, rejected, auto_created)
  const { rows: existing } = await pool.query(`
    SELECT field_signature FROM noise_candidates
    WHERE user_id = $1 AND status IN ('approved', 'rejected', 'auto_created')
  `, [userId]);
  const existingSigs = new Set(existing.map(r => JSON.stringify(r.field_signature)));
  const newPatterns = patterns.filter(p => !existingSigs.has(JSON.stringify(p.field_signature)));

  let scored = 0;
  const total = newPatterns.length;
  let checked = 0;

  for (const pattern of newPatterns) {
    checked++;
    let score = 0;

    if (parseFloat(pattern.daily_avg) > 50) score += 30;
    else if (parseFloat(pattern.daily_avg) > 20) score += 15;

    if (pattern.time_stddev !== null && parseFloat(pattern.time_stddev) < 300) score += 25;

    // Zero analyst actions: no alerts acknowledged/resolved for this category in 7 days
    const { rows: actionRows } = await pool.query(`
      SELECT COUNT(*) AS actions
      FROM alerts a
      JOIN logs l ON l.id = a.log_id
      WHERE a.user_id = $1
        AND l.event_category = $2
        AND a.status != 'new'
        AND a.created_at > NOW() - INTERVAL '7 days'
    `, [userId, pattern.event_category]);
    if (parseInt(actionRows[0].actions) === 0) score += 20;

    // No high/critical severity events in 30 days for this category
    const { rows: sevRows } = await pool.query(`
      SELECT COUNT(*) AS high_sev
      FROM logs
      WHERE user_id = $1
        AND event_category = $2
        AND severity IN ('critical', 'high')
        AND timestamp > NOW() - INTERVAL '30 days'
    `, [userId, pattern.event_category]);
    if (parseInt(sevRows[0].high_sev) === 0) score += 10;

    // Grouped by host already — same host each time
    score += 15;

    if (score < MEDIUM_THRESHOLD) continue;

    const confidence = score >= HIGH_THRESHOLD ? 'high' : 'medium';

    const { rowCount } = await pool.query(`
      INSERT INTO noise_candidates
        (user_id, field_signature, score, confidence, daily_avg, first_seen, last_seen, event_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id, field_signature) DO NOTHING
    `, [
      userId,
      pattern.field_signature,
      score,
      confidence,
      pattern.daily_avg,
      pattern.first_seen,
      pattern.last_seen,
      pattern.event_count,
    ]);

    if (rowCount > 0) scored++;
    if (onProgress) onProgress({ checked, total, scored });
  }

  return { scored, total };
}

export async function runAutoSuppress(userId) {
  const pool = db.getPool();

  const { rows: settingRows } = await pool.query(
    `SELECT noise_auto_suppress FROM user_settings WHERE user_id = $1`,
    [userId]
  );

  const setting = settingRows[0]?.noise_auto_suppress || 'off';
  if (setting === 'off') return;

  const confidenceFilter = setting === 'high_only'
    ? `confidence = 'high'`
    : `confidence IN ('high', 'medium')`;

  const { rows: candidates } = await pool.query(`
    SELECT * FROM noise_candidates
    WHERE user_id = $1
      AND status = 'pending'
      AND llm_cve_safe IS NOT FALSE
      AND ${confidenceFilter}
  `, [userId]);

  for (const candidate of candidates) {
    const sig = candidate.field_signature;
    const eventIdLabel = sig.event_id ? ` (Event ID ${sig.event_id})` : '';
    const processLabel = sig.process_name ? ` [${sig.process_name}]` : '';
    const ruleName = `[Auto] Suppress ${sig.event_category}${eventIdLabel}${processLabel} from ${sig.source}`;

    const { rows: ruleRows } = await pool.query(`
      INSERT INTO detection_rules
        (user_id, name, description, action, enabled, match_category, match_event_id, match_process, match_username)
      VALUES ($1, $2, $3, 'suppress', true, $4, $5, $6, $7)
      RETURNING id
    `, [
      userId,
      ruleName,
      `Auto-created by Noise Advisor (score: ${candidate.score})`,
      sig.event_category || null,
      sig.event_id || null,
      sig.process_name || null,
      sig.username || null,
    ]);

    const ruleId = ruleRows[0].id;

    await pool.query(`
      UPDATE noise_candidates
      SET status = 'auto_created', suppression_rule_id = $2, updated_at = NOW()
      WHERE id = $1
    `, [candidate.id, ruleId]);

    await audit(userId, 'noise.auto_suppress', {
      candidate_id: candidate.id,
      rule_id: ruleId,
      score: candidate.score,
      confidence: candidate.confidence,
      field_signature: sig,
    }, 'system');
  }
}

export async function scheduleNoiseCron() {
  const cron = (await import('node-cron')).default;
  cron.schedule('30 2 * * *', async () => {
    const pool = db.getPool();
    const { rows: users } = await pool.query(`SELECT DISTINCT user_id FROM logs`);
    for (const { user_id } of users) {
      try {
        await scoreNoiseCandidates(user_id);
        await runAutoSuppress(user_id);
      } catch (err) {
        console.error(`[noise] Error processing user ${user_id}:`, err.message);
      }
    }
  });

  console.log('[noise] Noise scoring cron scheduled (daily at 02:30)');
}
