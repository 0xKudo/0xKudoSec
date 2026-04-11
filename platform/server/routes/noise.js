import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import db from '../services/db.js';
import { audit } from '../services/audit.js';
import { scoreNoiseCandidates, runAutoSuppress } from '../services/noiseCron.js';

const router = Router();
const pool = () => db.getPool();
const uid = req => req.auth.sub;

// GET /api/siem/noise/status
router.get('/status', requireAuth, async (req, res) => {
  const { rows: eventRows } = await pool().query(`
    SELECT
      COUNT(*) AS total_events,
      EXTRACT(EPOCH FROM (NOW() - MIN(timestamp))) / 86400 AS days_ingested
    FROM logs WHERE user_id = $1
  `, [uid(req)]);

  const { rows: candidateRows } = await pool().query(`
    SELECT confidence, COUNT(*) AS count
    FROM noise_candidates
    WHERE user_id = $1 AND status = 'pending'
    GROUP BY confidence
  `, [uid(req)]);

  const total = parseInt(eventRows[0].total_events);
  const days = parseFloat(eventRows[0].days_ingested || 0);

  res.json({
    total_events: total,
    days_ingested: days,
    threshold_met: total >= 10000 || days >= 7,
    candidates: candidateRows,
  });
});

// GET /api/siem/noise/candidates
router.get('/candidates', requireAuth, async (req, res) => {
  const { status = 'pending', confidence } = req.query;
  const params = [uid(req), status];
  let query = `SELECT * FROM noise_candidates WHERE user_id = $1 AND status = $2`;
  if (confidence) {
    query += ` AND confidence = $3`;
    params.push(confidence);
  }
  query += ` ORDER BY score DESC`;
  const { rows } = await pool().query(query, params);
  res.json(rows);
});

// PATCH /api/siem/noise/candidates/:id/llm-result
// Called by Electron after LLM analysis completes — writes explanation + CVE verdict back to the server.
router.patch('/candidates/:id/llm-result', requireAuth, async (req, res) => {
  const { llm_explanation, llm_cve_safe, llm_cve_note } = req.body;

  if (typeof llm_explanation !== 'string' || llm_explanation.length > 2000) {
    return res.status(400).json({ error: 'llm_explanation must be a string under 2000 chars' });
  }
  if (typeof llm_cve_safe !== 'boolean') {
    return res.status(400).json({ error: 'llm_cve_safe must be a boolean' });
  }

  const note = typeof llm_cve_note === 'string' ? llm_cve_note.slice(0, 1000) : null;

  const { rows } = await pool().query(`
    UPDATE noise_candidates
    SET llm_explanation = $1,
        llm_cve_safe = $2::boolean,
        llm_cve_note = $3,
        llm_checked_at = NOW(),
        updated_at = NOW()
    WHERE id = $4 AND user_id = $5
    RETURNING id, llm_cve_safe
  `, [llm_explanation, llm_cve_safe, note, req.params.id, uid(req)]);

  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true, id: rows[0].id, llm_cve_safe: rows[0].llm_cve_safe });
});

// PATCH /api/siem/noise/candidates/:id
router.patch('/candidates/:id', requireAuth, async (req, res) => {
  const { status, llm_override, llm_override_note } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }
  if (llm_override && (typeof llm_override_note !== 'string' || llm_override_note.trim().length < 1)) {
    return res.status(400).json({ error: 'llm_override_note is required when overriding LLM verdict' });
  }

  // Fetch the candidate first — we need to check CVE safety before approving
  const { rows: existing } = await pool().query(
    `SELECT * FROM noise_candidates WHERE id = $1 AND user_id = $2`,
    [req.params.id, uid(req)]
  );
  if (!existing.length) return res.status(404).json({ error: 'not found' });

  // Hard block: CVE-flagged candidates cannot be approved unless analyst explicitly overrides with a note
  if (status === 'approved' && existing[0].llm_cve_safe === false && !llm_override) {
    return res.status(409).json({
      error: 'This pattern was flagged as CVE-unsafe by LLM analysis and cannot be suppressed.',
      llm_cve_note: existing[0].llm_cve_note || null,
    });
  }

  // If overriding, update the CVE verdict and log the analyst's reasoning
  if (llm_override && llm_override_note) {
    const safeNote = llm_override_note.slice(0, 1000);
    await pool().query(
      `UPDATE noise_candidates SET llm_cve_safe = true, llm_cve_note = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
      [`[Analyst override] ${safeNote}`, req.params.id, uid(req)]
    );
    await audit(uid(req), 'noise.llm_override', { candidate_id: req.params.id, note: safeNote }, req.ip);
  }

  const { rows } = await pool().query(`
    UPDATE noise_candidates SET status = $1, updated_at = NOW()
    WHERE id = $2 AND user_id = $3
    RETURNING *
  `, [status, req.params.id, uid(req)]);

  if (!rows.length) return res.status(404).json({ error: 'not found' });

  if (status === 'approved') {
    const sig = rows[0].field_signature;
    const eventIdLabel = sig.event_id ? ` (Event ID ${sig.event_id})` : '';
    const processLabel = sig.process_name ? ` [${sig.process_name}]` : '';
    const ruleName = `[Auto] Suppress ${sig.event_category}${eventIdLabel}${processLabel} from ${sig.source}`;
    const { rows: ruleRows } = await pool().query(`
      INSERT INTO detection_rules
        (user_id, name, description, action, enabled, match_category, match_event_id, match_process, match_username)
      VALUES ($1, $2, $3, 'suppress', true, $4, $5::integer, $6, $7)
      RETURNING id
    `, [
      uid(req),
      ruleName,
      `Approved from Noise Advisor (score: ${rows[0].score})`,
      sig.event_category || null,
      sig.event_id ?? null,
      sig.process_name || null,
      sig.username || null,
    ]);
    await pool().query(
      `UPDATE noise_candidates SET suppression_rule_id = $1 WHERE id = $2`,
      [ruleRows[0].id, req.params.id]
    );
    await audit(uid(req), 'noise.approved', { candidate_id: req.params.id, rule_id: ruleRows[0].id }, req.ip);
  } else {
    await audit(uid(req), 'noise.rejected', { candidate_id: req.params.id }, req.ip);
  }

  res.json(rows[0]);
});

// POST /api/siem/noise/candidates/bulk
router.post('/candidates/bulk', requireAuth, async (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' });
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'invalid status' });

  const safeIds = ids.filter(id => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id));
  if (!safeIds.length) return res.status(400).json({ error: 'no valid ids' });

  // For approvals, strip out any CVE-flagged candidates before touching the DB
  let approveIds = safeIds;
  const cveBlocked = [];
  if (status === 'approved') {
    const selectPh = safeIds.map((_, i) => `$${i + 2}`).join(',');
    const { rows: candidates } = await pool().query(
      `SELECT id FROM noise_candidates WHERE user_id = $1 AND id IN (${selectPh}) AND llm_cve_safe = false`,
      [uid(req), ...safeIds]
    );
    const blockedSet = new Set(candidates.map(r => r.id));
    cveBlocked.push(...blockedSet);
    approveIds = safeIds.filter(id => !blockedSet.has(id));
  }

  if (!approveIds.length && status === 'approved') {
    return res.status(409).json({
      error: 'All selected candidates were flagged as CVE-unsafe and cannot be suppressed.',
      cve_blocked: cveBlocked,
    });
  }

  const placeholders = approveIds.map((_, i) => `$${i + 3}`).join(',');
  await pool().query(
    `UPDATE noise_candidates SET status = $1, updated_at = NOW()
     WHERE user_id = $2 AND id IN (${placeholders})`,
    [status, uid(req), ...approveIds]
  );

  if (status === 'approved') {
    const selectPlaceholders = approveIds.map((_, i) => `$${i + 2}`).join(',');
    const { rows: candidates } = await pool().query(
      `SELECT * FROM noise_candidates WHERE user_id = $1 AND id IN (${selectPlaceholders})`,
      [uid(req), ...approveIds]
    );
    for (const candidate of candidates) {
      const sig = candidate.field_signature;
      const eventIdLabel = sig.event_id ? ` (Event ID ${sig.event_id})` : '';
      const processLabel = sig.process_name ? ` [${sig.process_name}]` : '';
      const { rows: ruleRows } = await pool().query(`
        INSERT INTO detection_rules (user_id, name, description, action, enabled, match_category, match_event_id, match_process, match_username)
        VALUES ($1, $2, $3, 'suppress', true, $4, $5::integer, $6, $7)
        RETURNING id
      `, [
        uid(req),
        `[Auto] Suppress ${sig.event_category || 'unknown'}${eventIdLabel}${processLabel} from ${sig.source || 'unknown'}`,
        `Approved from Noise Advisor (score: ${candidate.score})`,
        sig.event_category || null,
        sig.event_id ?? null,
        sig.process_name || null,
        sig.username || null,
      ]);
      await pool().query(
        `UPDATE noise_candidates SET suppression_rule_id = $1 WHERE id = $2`,
        [ruleRows[0].id, candidate.id]
      );
    }
  }

  await audit(uid(req), `noise.bulk_${status}`, { count: approveIds.length, cve_blocked: cveBlocked.length }, req.ip);
  res.json({ updated: approveIds.length, cve_blocked: cveBlocked });
});

// POST /api/siem/noise/candidates/:id/undo
router.post('/candidates/:id/undo', requireAuth, async (req, res) => {
  const { rows } = await pool().query(
    `SELECT * FROM noise_candidates WHERE id = $1 AND user_id = $2`,
    [req.params.id, uid(req)]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });

  const candidate = rows[0];
  if (candidate.suppression_rule_id) {
    await pool().query(
      `DELETE FROM detection_rules WHERE id = $1 AND user_id = $2`,
      [candidate.suppression_rule_id, uid(req)]
    );
  }

  await pool().query(
    `UPDATE noise_candidates SET status = 'pending', suppression_rule_id = NULL, updated_at = NOW()
     WHERE id = $1`,
    [req.params.id]
  );

  await audit(uid(req), 'noise.undo', { candidate_id: req.params.id }, req.ip);
  res.json({ ok: true });
});

// GET /api/siem/noise/activity
router.get('/activity', requireAuth, async (req, res) => {
  const { rows } = await pool().query(`
    SELECT nc.*, dr.name AS rule_name
    FROM noise_candidates nc
    LEFT JOIN detection_rules dr ON dr.id = nc.suppression_rule_id
    WHERE nc.user_id = $1
      AND nc.status IN ('approved', 'auto_created')
      AND nc.updated_at > NOW() - INTERVAL '30 days'
    ORDER BY nc.updated_at DESC
  `, [uid(req)]);
  res.json(rows);
});

// GET /api/siem/noise/settings
router.get('/settings', requireAuth, async (req, res) => {
  const { rows } = await pool().query(
    `SELECT noise_auto_suppress, noise_llm_enabled, noise_llm_trigger, llm_model,
            llm_custom_model_path, noise_min_score, noise_learning_days,
            noise_learning_events, kb_auto_update
     FROM user_settings WHERE user_id = $1`,
    [uid(req)]
  );
  res.json(rows[0] || {
    noise_auto_suppress: 'off',
    noise_llm_enabled: true,
    noise_llm_trigger: 'manual',
    llm_model: 'phi-3.5-mini-q4',
    llm_custom_model_path: null,
    noise_min_score: 40,
    noise_learning_days: 7,
    noise_learning_events: 10000,
    kb_auto_update: true,
  });
});

// PATCH /api/siem/noise/settings
router.patch('/settings', requireAuth, async (req, res) => {
  const allowed = ['noise_auto_suppress', 'noise_llm_enabled', 'noise_llm_trigger',
    'llm_model', 'llm_custom_model_path', 'noise_min_score',
    'noise_learning_days', 'noise_learning_events', 'kb_auto_update'];

  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'no valid fields' });

  const keys = Object.keys(updates);
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = [uid(req), ...Object.values(updates)];
  const insertCols = keys.join(', ');
  const insertVals = keys.map((_, i) => `$${i + 2}`).join(', ');

  await pool().query(
    `INSERT INTO user_settings (user_id, ${insertCols})
     VALUES ($1, ${insertVals})
     ON CONFLICT (user_id) DO UPDATE SET ${setClauses}, updated_at = NOW()`,
    values
  );

  await audit(uid(req), 'noise.settings_update', updates, req.ip);
  res.json({ ok: true });
});

// GET /api/siem/noise/context — fetch analyst decision history for similar patterns
// Used by llmProcess.js to inject few-shot examples into the LLM prompt before each candidate analysis.
router.get('/context', requireAuth, async (req, res) => {
  const { event_category, source, process_name } = req.query;
  if (!event_category && !source) return res.status(400).json({ error: 'event_category or source required' });

  const userId = uid(req);

  // 1. Past noise candidate decisions (approved + rejected + overrides)
  const { rows: candidateRows } = await pool().query(`
    SELECT
      field_signature,
      status,
      llm_explanation,
      llm_cve_note,
      score,
      daily_avg,
      updated_at
    FROM noise_candidates
    WHERE user_id = $1
      AND status IN ('approved', 'rejected')
      AND (
        field_signature->>'event_category' = $2
        OR field_signature->>'source' = $3
        OR ($4::text IS NOT NULL AND field_signature->>'process_name' = $4::text)
      )
    ORDER BY
      CASE WHEN field_signature->>'event_category' = $2 AND field_signature->>'source' = $3 THEN 0
           WHEN field_signature->>'event_category' = $2 THEN 1
           ELSE 2 END,
      updated_at DESC
    LIMIT 8
  `, [userId, event_category || null, source || null, process_name || null]);

  // 2. Active suppression rules (manually created ones too, not just Noise Advisor)
  const { rows: ruleRows } = await pool().query(`
    SELECT name, description, match_category, match_event_id, match_process, match_username, created_at
    FROM detection_rules
    WHERE user_id = $1
      AND action = 'suppress'
      AND enabled = true
      AND (
        match_category = $2
        OR ($3 IS NOT NULL AND match_process = $3)
      )
    ORDER BY created_at DESC
    LIMIT 5
  `, [userId, event_category || null, process_name || null]);

  // Format as structured context for prompt injection
  const decisions = candidateRows.map(r => {
    const sig = r.field_signature;
    const isOverride = r.llm_cve_note && r.llm_cve_note.startsWith('[Analyst override]');
    return {
      pattern: `${sig.event_category || 'unknown'} / ${sig.source || 'unknown'}${sig.event_id ? ` / Event ID ${sig.event_id}` : ''}${sig.process_name ? ` / ${sig.process_name}` : ''}`,
      decision: r.status,
      override: isOverride,
      analyst_note: isOverride ? r.llm_cve_note.replace('[Analyst override] ', '') : null,
      llm_explanation: r.llm_explanation || null,
      daily_avg: r.daily_avg,
      score: r.score,
    };
  });

  const suppressionRules = ruleRows.map(r => ({
    name: r.name,
    description: r.description,
    match_category: r.match_category,
    match_process: r.match_process,
  }));

  res.json({ decisions, suppressionRules });
});

// POST /api/siem/noise/run — manual trigger for scoring job
router.post('/run', requireAuth, async (req, res) => {
  const userId = uid(req);
  try {
    const result = await scoreNoiseCandidates(userId);
    await runAutoSuppress(userId);
    await audit(userId, 'noise.manual_run', result || {}, req.ip);
    res.json({ ok: true, result });
  } catch (e) {
    console.error('[noise] /run error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
