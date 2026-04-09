# Noise Suppression Engine — Phase 1 Implementation Plan

**Goal:** Server-side noise candidate scoring, Noise Advisor UI, and auto-suppression — no LLM required.

**Architecture:** A daily cron job scores SIEM event patterns and writes candidates to a new `noise_candidates` table. A new `/api/siem/noise` route serves candidates to a new Noise Advisor tab in the SIEM UI. Auto-suppression creates detection rules directly and audit logs every action.

**Tech Stack:** Node.js, PostgreSQL, React, existing platform patterns (wrap, audit, requireAuth, pool)

---

## Files

### New — Server
- `platform/server/services/noiseCron.js` — daily scoring job, writes to noise_candidates
- `platform/server/routes/noise.js` — GET/PATCH/POST noise routes
- `platform/server/tests/noise.test.js` — route tests

### New — Client
- `platform/shell/src/components/NoiseAdvisor.jsx` — full Noise Advisor tab component
- `platform/shell/src/components/NoiseAdvisorMobile.jsx` — mobile layout

### Modified
- `platform/server/index.js` — register noise routes + noiseCron
- `platform/shell/src/components/SiemConfiguration.jsx` — add noise settings keys to user_settings
- `platform/shell/src/App.jsx` — add NoiseAdvisor to SIEM tab routing
- `platform/shell/src/components/TopNav.jsx` — add Noise Advisor to SIEM nav bar

---

## Task 1: Database migration — noise_candidates table

- [ ] SSH into VPS, open psql:
```bash
psql $DATABASE_URL
```

- [ ] Run migration:
```sql
CREATE TABLE noise_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  field_signature JSONB NOT NULL,
  score INTEGER NOT NULL,
  confidence TEXT NOT NULL,
  daily_avg NUMERIC,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  event_count INTEGER,
  llm_explanation TEXT,
  llm_cve_safe BOOLEAN,
  llm_checked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  suppression_rule_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_noise_candidates_user_id ON noise_candidates(user_id);
CREATE INDEX idx_noise_candidates_status ON noise_candidates(status);
```

- [ ] Verify:
```sql
\d noise_candidates
```
Expected: table with all columns listed above.

- [ ] Commit nothing — migration runs on VPS directly.

---

## Task 2: noiseCron.js — scoring job

- [ ] Create `platform/server/services/noiseCron.js`:

```js
import { getPool } from './db.js';
import { audit } from './audit.js';

const HIGH_THRESHOLD = 70;
const MEDIUM_THRESHOLD = 40;

async function scoreNoiseCandidates(userId) {
  const pool = getPool();

  // Check if user meets learning threshold (7 days OR 10k events)
  const { rows: thresholdRows } = await pool.query(`
    SELECT
      COUNT(*) AS total_events,
      MIN(timestamp) AS first_event,
      EXTRACT(EPOCH FROM (NOW() - MIN(timestamp))) / 86400 AS days_ingested
    FROM siem_events
    WHERE user_id = $1
  `, [userId]);

  const { total_events, days_ingested } = thresholdRows[0];
  if (parseInt(total_events) < 10000 && parseFloat(days_ingested) < 7) {
    return { skipped: true, reason: 'threshold_not_met', total_events, days_ingested };
  }

  // Find high-frequency patterns in last 7 days
  const { rows: patterns } = await pool.query(`
    SELECT
      source,
      event_type,
      jsonb_build_object('source', source, 'event_type', event_type, 'host', host) AS field_signature,
      COUNT(*) AS event_count,
      COUNT(*) / 7.0 AS daily_avg,
      MIN(timestamp) AS first_seen,
      MAX(timestamp) AS last_seen,
      COUNT(DISTINCT DATE(timestamp)) AS active_days,
      STDDEV(EXTRACT(EPOCH FROM timestamp) % 3600) AS time_stddev
    FROM siem_events
    WHERE user_id = $1
      AND timestamp > NOW() - INTERVAL '7 days'
    GROUP BY source, event_type, host
    HAVING COUNT(*) / 7.0 > 10
  `, [userId]);

  for (const pattern of patterns) {
    let score = 0;

    // Signal 1: fires > 50 times/day
    if (parseFloat(pattern.daily_avg) > 50) score += 30;
    else if (parseFloat(pattern.daily_avg) > 20) score += 15;

    // Signal 2: consistent time intervals (low stddev = scheduled)
    if (pattern.time_stddev !== null && parseFloat(pattern.time_stddev) < 300) score += 25;

    // Signal 3: zero analyst actions
    const { rows: actionRows } = await pool.query(`
      SELECT COUNT(*) AS actions
      FROM alerts a
      WHERE a.user_id = $1
        AND a.source = $2
        AND a.event_type = $3
        AND a.status != 'new'
        AND a.created_at > NOW() - INTERVAL '7 days'
    `, [userId, pattern.source, pattern.event_type]);
    if (parseInt(actionRows[0].actions) === 0) score += 20;

    // Signal 4: no severity escalation in 30 days
    const { rows: sevRows } = await pool.query(`
      SELECT COUNT(*) AS high_sev
      FROM siem_events
      WHERE user_id = $1
        AND source = $2
        AND event_type = $3
        AND severity IN ('critical', 'high')
        AND timestamp > NOW() - INTERVAL '30 days'
    `, [userId, pattern.source, pattern.event_type]);
    if (parseInt(sevRows[0].high_sev) === 0) score += 10;

    // Signal 5: same host every time (low cardinality)
    score += 15; // already grouped by host in query above

    if (score < MEDIUM_THRESHOLD) continue;

    const confidence = score >= HIGH_THRESHOLD ? 'high' : 'medium';

    // Upsert — don't re-create if already pending/approved
    await pool.query(`
      INSERT INTO noise_candidates
        (user_id, field_signature, score, confidence, daily_avg, first_seen, last_seen, event_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING
    `, [
      userId,
      pattern.field_signature,
      score,
      confidence,
      pattern.daily_avg,
      pattern.first_seen,
      pattern.last_seen,
      pattern.event_count
    ]);
  }

  return { scored: patterns.length };
}

async function runAutoSuppress(userId) {
  const pool = getPool();

  // Get user auto-suppress setting
  const { rows: settingRows } = await pool.query(`
    SELECT value FROM user_settings WHERE user_id = $1 AND key = 'noise_auto_suppress'
  `, [userId]);

  const setting = settingRows[0]?.value || 'off';
  if (setting === 'off') return;

  const confidenceFilter = setting === 'high_only' ? `confidence = 'high'` : `confidence IN ('high', 'medium')`;

  const { rows: candidates } = await pool.query(`
    SELECT * FROM noise_candidates
    WHERE user_id = $1
      AND status = 'pending'
      AND llm_cve_safe IS NOT FALSE
      AND ${confidenceFilter}
  `, [userId]);

  for (const candidate of candidates) {
    const sig = candidate.field_signature;
    const ruleName = `[Auto] Suppress ${sig.event_type} from ${sig.source}`;

    // Create suppression rule
    const { rows: ruleRows } = await pool.query(`
      INSERT INTO detection_rules
        (user_id, name, description, conditions, action, enabled)
      VALUES ($1, $2, $3, $4, 'suppress', true)
      RETURNING id
    `, [
      userId,
      ruleName,
      `Auto-created by Noise Advisor (score: ${candidate.score})`,
      JSON.stringify([
        { field: 'source', operator: 'equals', value: sig.source },
        { field: 'event_type', operator: 'equals', value: sig.event_type }
      ])
    ]);

    const ruleId = ruleRows[0].id;

    await pool.query(`
      UPDATE noise_candidates
      SET status = 'auto_created', suppression_rule_id = $2, updated_at = NOW()
      WHERE id = $1
    `, [candidate.id, ruleId]);

    audit(userId, 'noise.auto_suppress', {
      candidate_id: candidate.id,
      rule_id: ruleId,
      score: candidate.score,
      confidence: candidate.confidence,
      field_signature: sig
    }, 'system');
  }
}

export async function scheduleNoiseCron(app) {
  // Run daily at 02:30
  const CronJob = (await import('cron')).CronJob;
  new CronJob('0 30 2 * * *', async () => {
    const pool = getPool();
    const { rows: users } = await pool.query(`SELECT DISTINCT user_id FROM siem_events`);
    for (const { user_id } of users) {
      try {
        await scoreNoiseCandidates(user_id);
        await runAutoSuppress(user_id);
      } catch (err) {
        console.error(`[noise] Error processing user ${user_id}:`, err.message);
      }
    }
  }, null, true);

  console.log('[noise] Noise scoring cron scheduled (daily at 02:30)');
}
```

- [ ] Commit:
```bash
git add platform/server/services/noiseCron.js
git commit -m "feat: add noise candidate scoring cron job"
```

---

## Task 3: noise routes

- [ ] Create `platform/server/routes/noise.js`:

```js
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getPool } from '../services/db.js';
import { audit } from '../services/audit.js';

const router = Router();
const pool = () => getPool();
const uid = req => req.user.sub;

// GET /api/siem/noise/candidates
router.get('/candidates', requireAuth, async (req, res) => {
  const { status = 'pending', confidence } = req.query;
  let query = `
    SELECT * FROM noise_candidates
    WHERE user_id = $1 AND status = $2
  `;
  const params = [uid(req), status];
  if (confidence) {
    query += ` AND confidence = $3`;
    params.push(confidence);
  }
  query += ` ORDER BY score DESC`;
  const { rows } = await pool().query(query, params);
  res.json(rows);
});

// GET /api/siem/noise/status
router.get('/status', requireAuth, async (req, res) => {
  const { rows: eventRows } = await pool().query(`
    SELECT
      COUNT(*) AS total_events,
      EXTRACT(EPOCH FROM (NOW() - MIN(timestamp))) / 86400 AS days_ingested
    FROM siem_events WHERE user_id = $1
  `, [uid(req)]);

  const { rows: candidateRows } = await pool().query(`
    SELECT confidence, COUNT(*) AS count
    FROM noise_candidates
    WHERE user_id = $1 AND status = 'pending'
    GROUP BY confidence
  `, [uid(req)]);

  res.json({
    total_events: parseInt(eventRows[0].total_events),
    days_ingested: parseFloat(eventRows[0].days_ingested || 0),
    threshold_met: parseInt(eventRows[0].total_events) >= 10000 || parseFloat(eventRows[0].days_ingested || 0) >= 7,
    candidates: candidateRows
  });
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
    const { rows: ruleRows } = await pool().query(`
      INSERT INTO detection_rules (user_id, name, description, conditions, action, enabled)
      VALUES ($1, $2, $3, $4, 'suppress', true)
      RETURNING id
    `, [
      uid(req),
      `[Auto] Suppress ${sig.event_type} from ${sig.source}`,
      `Approved from Noise Advisor (score: ${rows[0].score})`,
      JSON.stringify([
        { field: 'source', operator: 'equals', value: sig.source },
        { field: 'event_type', operator: 'equals', value: sig.event_type }
      ])
    ]);
    await pool().query(
      `UPDATE noise_candidates SET suppression_rule_id = $1 WHERE id = $2`,
      [ruleRows[0].id, req.params.id]
    );
    audit(uid(req), 'noise.approved', { candidate_id: req.params.id, rule_id: ruleRows[0].id }, req.ip);
  } else {
    audit(uid(req), 'noise.rejected', { candidate_id: req.params.id }, req.ip);
  }

  res.json(rows[0]);
});

// POST /api/siem/noise/candidates/bulk
router.post('/candidates/bulk', requireAuth, async (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' });
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'invalid status' });

  const safeIds = ids.filter(id => typeof id === 'string' && id.length === 36);
  const placeholders = safeIds.map((_, i) => `$${i + 3}`).join(',');

  await pool().query(
    `UPDATE noise_candidates SET status = $1, updated_at = NOW()
     WHERE user_id = $2 AND id IN (${placeholders})`,
    [status, uid(req), ...safeIds]
  );

  audit(uid(req), `noise.bulk_${status}`, { count: safeIds.length }, req.ip);
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

  audit(uid(req), 'noise.undo', { candidate_id: req.params.id }, req.ip);
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

export default router;
```

- [ ] Register routes in `platform/server/index.js` — add after siemRoutes:
```js
import noiseRoutes from './routes/noise.js';
// ...
app.use('/api/siem/noise', apiRateLimiter, noiseRoutes);
```

- [ ] Register noiseCron in `platform/server/index.js` — add after retentionCron:
```js
import { scheduleNoiseCron } from './services/noiseCron.js';
// ...
scheduleNoiseCron(app);
```

- [ ] Commit:
```bash
git add platform/server/routes/noise.js platform/server/index.js
git commit -m "feat: add noise routes and register noiseCron"
```

---

## Task 4: user_settings keys for noise

- [ ] Add noise setting keys to the user settings initializer. Find where `user_settings` defaults are set in `platform/server/routes/siem.js` and add:

```js
const NOISE_DEFAULTS = {
  noise_auto_suppress: 'off',
  noise_llm_enabled: true,
  noise_llm_trigger: 'manual',
  llm_model: 'phi-3.5-mini-q4',
  llm_custom_model_path: null,
  noise_min_score: 40,
  noise_learning_days: 7,
  noise_learning_events: 10000,
  kb_auto_update: true
};
```

- [ ] Commit:
```bash
git add platform/server/routes/siem.js
git commit -m "feat: add noise user_settings defaults"
```

---

## Task 5: NoiseAdvisor.jsx — desktop UI

- [ ] Create `platform/shell/src/components/NoiseAdvisor.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

const API = '/api/siem/noise';

const s = {
  container: { padding: '24px', fontFamily: 'var(--font)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' },
  settingsBar: { display: 'flex', gap: '16px', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', marginBottom: '20px', flexWrap: 'wrap' },
  label: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '6px' },
  select: { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '12px', padding: '4px 8px', fontFamily: 'var(--font)' },
  btn: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', padding: '6px 14px', fontSize: '11px', fontFamily: 'var(--font)', cursor: 'pointer', letterSpacing: '0.04em' },
  btnSmall: { background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '4px 10px', fontSize: '11px', fontFamily: 'var(--font)', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', verticalAlign: 'top' },
  badge: (color) => ({ display: 'inline-block', padding: '2px 8px', fontSize: '10px', border: `1px solid ${color}`, color, letterSpacing: '0.06em' }),
  progress: { width: '100%', height: '4px', background: 'var(--border)', marginTop: '8px' },
  progressFill: (pct) => ({ height: '100%', width: `${Math.min(pct, 100)}%`, background: 'var(--accent-amber)' }),
  empty: { padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' },
  section: { marginBottom: '32px' },
  sectionTitle: { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' },
};

export default function NoiseAdvisor() {
  const { getAccessTokenSilently } = useAuth0();
  const [status, setStatus] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [activity, setActivity] = useState([]);
  const [settings, setSettings] = useState({ noise_auto_suppress: 'off' });
  const [view, setView] = useState('candidates'); // 'candidates' | 'activity'
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const headers = useCallback(async () => {
    const token = await getAccessTokenSilently();
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, [getAccessTokenSilently]);

  const load = useCallback(async () => {
    const h = await headers();
    const [statusRes, candidatesRes, activityRes] = await Promise.all([
      fetch(`${API}/status`, { headers: h }),
      fetch(`${API}/candidates`, { headers: h }),
      fetch(`${API}/activity`, { headers: h }),
    ]);
    setStatus(await statusRes.json());
    setCandidates(await candidatesRes.json());
    setActivity(await activityRes.json());
    setLoading(false);
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, newStatus) => {
    const h = await headers();
    await fetch(`${API}/candidates/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: newStatus }) });
    load();
  };

  const bulkUpdate = async (newStatus) => {
    const h = await headers();
    await fetch(`${API}/candidates/bulk`, { method: 'POST', headers: h, body: JSON.stringify({ ids: [...selected], status: newStatus }) });
    setSelected(new Set());
    load();
  };

  const undo = async (id) => {
    const h = await headers();
    await fetch(`${API}/candidates/${id}/undo`, { method: 'POST', headers: h });
    load();
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) return <div style={s.empty}>Loading...</div>;

  const eventsPct = Math.min((status?.total_events / 10000) * 100, 100);
  const daysPct = Math.min((status?.days_ingested / 7) * 100, 100);
  const thresholdMet = status?.threshold_met;

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.title}>Noise Advisor</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={{ ...s.btnSmall, color: view === 'candidates' ? 'var(--accent-amber)' : undefined }} onClick={() => setView('candidates')}>Candidates</button>
          <button style={{ ...s.btnSmall, color: view === 'activity' ? 'var(--accent-amber)' : undefined }} onClick={() => setView('activity')}>Activity Log</button>
        </div>
      </div>

      {/* Settings bar */}
      <div style={s.settingsBar}>
        <span style={s.label}>Auto-suppress</span>
        <select style={s.select} value={settings.noise_auto_suppress} onChange={e => setSettings(p => ({ ...p, noise_auto_suppress: e.target.value }))}>
          <option value="off">Suggest only</option>
          <option value="high_only">Auto-create (high confidence)</option>
          <option value="all">Auto-create (all)</option>
        </select>
      </div>

      {!thresholdMet && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Learning period in progress</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Events: {status?.total_events?.toLocaleString()} / 10,000
          </div>
          <div style={s.progress}><div style={s.progressFill(eventsPct)} /></div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', marginTop: '12px' }}>
            Days: {Math.floor(status?.days_ingested || 0)} / 7
          </div>
          <div style={s.progress}><div style={s.progressFill(daysPct)} /></div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>Suggestions appear when either threshold is met.</div>
        </div>
      )}

      {thresholdMet && view === 'candidates' && (
        <div style={s.section}>
          {selected.size > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button style={s.btn} onClick={() => bulkUpdate('approved')}>Approve {selected.size}</button>
              <button style={s.btnSmall} onClick={() => bulkUpdate('rejected')}>Reject {selected.size}</button>
            </div>
          )}
          {candidates.length === 0 ? (
            <div style={s.empty}>No noise candidates found. Check back after the next daily analysis.</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}></th>
                  <th style={s.th}>Pattern</th>
                  <th style={s.th}>Daily Avg</th>
                  <th style={s.th}>Confidence</th>
                  <th style={s.th}>Score</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => (
                  <tr key={c.id}>
                    <td style={s.td}><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                    <td style={s.td}>
                      <div style={{ fontWeight: 600 }}>{c.field_signature.event_type}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{c.field_signature.source} / {c.field_signature.host}</div>
                    </td>
                    <td style={s.td}>{parseFloat(c.daily_avg).toFixed(1)}/day</td>
                    <td style={s.td}>
                      <span style={s.badge(c.confidence === 'high' ? 'var(--severity-critical)' : 'var(--severity-medium)')}>
                        {c.confidence.toUpperCase()}
                      </span>
                    </td>
                    <td style={s.td}>{c.score}</td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button style={s.btnSmall} onClick={() => updateStatus(c.id, 'approved')}>Approve</button>
                        <button style={s.btnSmall} onClick={() => updateStatus(c.id, 'rejected')}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === 'activity' && (
        <div style={s.section}>
          {activity.length === 0 ? (
            <div style={s.empty}>No suppression activity in the last 30 days.</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Pattern</th>
                  <th style={s.th}>Rule Created</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activity.map(c => (
                  <tr key={c.id}>
                    <td style={s.td}>
                      <div>{c.field_signature.event_type}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{c.field_signature.source}</div>
                    </td>
                    <td style={s.td}>{c.rule_name || 'None'}</td>
                    <td style={s.td}><span style={s.badge('var(--severity-low)')}>{c.status}</span></td>
                    <td style={s.td}>{new Date(c.updated_at).toLocaleDateString()}</td>
                    <td style={s.td}><button style={s.btnSmall} onClick={() => undo(c.id)}>Undo</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] Commit:
```bash
git add platform/shell/src/components/NoiseAdvisor.jsx
git commit -m "feat: add NoiseAdvisor desktop UI component"
```

---

## Task 6: Wire NoiseAdvisor into SIEM nav

- [ ] In `platform/shell/src/components/TopNav.jsx`, find the SIEM views array and add `'noise'`:
```js
// Find the SIEM_VIEWS or siemTabs array and add:
{ key: 'noise', label: 'NOISE ADVISOR' }
```

- [ ] In `platform/shell/src/App.jsx`, find where SIEM views are rendered and add:
```jsx
import NoiseAdvisor from './components/NoiseAdvisor';
// ...
{siemView === 'noise' && <NoiseAdvisor />}
```

- [ ] Commit:
```bash
git add platform/shell/src/components/TopNav.jsx platform/shell/src/App.jsx
git commit -m "feat: add Noise Advisor to SIEM nav"
```

---

## Task 7: Deploy and verify

- [ ] Push to GitHub:
```bash
git push
```

- [ ] On VPS:
```bash
cd /var/www/cybertools && git pull && npm run build --workspace=platform/shell && pm2 restart cybertools
```

- [ ] Open the app, go to SIEM > Noise Advisor.
- [ ] Verify: if under threshold, progress bars show correctly.
- [ ] Verify: settings bar renders with auto-suppress dropdown.
- [ ] Check server logs: `pm2 logs cybertools --lines 10 --nostream` — confirm `[noise] Noise scoring cron scheduled` appears.

---

## Phase 1 Complete

Once deployed, the system will:
- Score noise candidates daily at 02:30
- Surface them in the Noise Advisor tab after threshold is met
- Allow manual approve/reject/bulk actions
- Auto-suppress based on user setting
- Log all actions to audit log with undo capability

Phase 2 (LLM integration) and Phase 3 (Vulnerability KB) are separate plans.
