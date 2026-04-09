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

// PATCH /api/siem/noise/candidates/:id
router.patch('/candidates/:id', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }

  const { rows } = await pool().query(`
    UPDATE noise_candidates SET status = $1, updated_at = NOW()
    WHERE id = $2 AND user_id = $3
    RETURNING *
  `, [status, req.params.id, uid(req)]);

  if (!rows.length) return res.status(404).json({ error: 'not found' });

  if (status === 'approved') {
    const sig = rows[0].field_signature;
    const ruleName = `[Auto] Suppress ${sig.event_category} from ${sig.source}`;
    const { rows: ruleRows } = await pool().query(`
      INSERT INTO detection_rules
        (user_id, name, description, action, enabled, match_category, match_host)
      VALUES ($1, $2, $3, 'suppress', true, $4, $5)
      RETURNING id
    `, [
      uid(req),
      ruleName,
      `Approved from Noise Advisor (score: ${rows[0].score})`,
      sig.event_category || null,
      sig.host || null,
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

  const placeholders = safeIds.map((_, i) => `$${i + 3}`).join(',');
  await pool().query(
    `UPDATE noise_candidates SET status = $1, updated_at = NOW()
     WHERE user_id = $2 AND id IN (${placeholders})`,
    [status, uid(req), ...safeIds]
  );

  await audit(uid(req), `noise.bulk_${status}`, { count: safeIds.length }, req.ip);
  res.json({ updated: safeIds.length });
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

// POST /api/siem/noise/run — manual trigger for scoring job
router.post('/run', requireAuth, async (req, res) => {
  const userId = uid(req);
  const result = await scoreNoiseCandidates(userId);
  await runAutoSuppress(userId);
  await audit(userId, 'noise.manual_run', result || {}, req.ip);
  res.json({ ok: true, result });
});

export default router;
