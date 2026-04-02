// platform/server/routes/siem.js
import { Router } from 'express';
import { randomBytes, createHash } from 'crypto';

function hashKey(key) {
  return createHash('sha256').update(key).digest('hex');
}
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import pool from '../services/db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = Router();
router.use(requireAuth);

// Wrap async route handlers so unhandled promise rejections reach the error middleware
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const STATUS_VALUES = ['new', 'acknowledged', 'resolved'];

function hoursParam(req) {
  const h = parseInt(req.query.hours, 10);
  return (!isNaN(h) && h > 0 && h <= 168) ? h : 24;
}

function uid(req) {
  return req.auth.sub;
}

// Fetch active suppress rules and return inline NOT(...) conditions + params to append to any query.
// Pass params array (already containing [$1=userId, ...]) and conditions array to mutate in place.
async function applySuppressFilters(userId, params, conditions) {
  const { rows: rules } = await pool.query(
    `SELECT * FROM detection_rules WHERE user_id = $1 AND enabled = true AND action = 'suppress'`,
    [userId]
  );
  for (const rule of rules) {
    const rc = [];
    if (rule.match_event_id)  { params.push(rule.match_event_id);        rc.push(`event_id = $${params.length}`); }
    if (rule.match_category)  { params.push(rule.match_category);        rc.push(`event_category = $${params.length}`); }
    if (rule.match_severity)  { params.push(rule.match_severity);        rc.push(`severity = $${params.length}`); }
    if (rule.match_username)  { params.push(`%${rule.match_username}%`); rc.push(`username ILIKE $${params.length}`); }
    if (rule.match_host)      { params.push(`%${rule.match_host}%`);     rc.push(`host ILIKE $${params.length}`); }
    if (rule.match_message)   { params.push(`%${rule.match_message}%`);  rc.push(`message ILIKE $${params.length}`); }
    if (rule.match_process)   { params.push(`%${rule.match_process}%`);  rc.push(`process_name ILIKE $${params.length}`); }
    if (rule.match_src_ip)    { params.push(`%${rule.match_src_ip}%`);   rc.push(`source_ip::text ILIKE $${params.length}`); }
    if (rule.match_dest_ip)   { params.push(`%${rule.match_dest_ip}%`);  rc.push(`dest_ip::text ILIKE $${params.length}`); }
    if (rule.match_dest_port) { params.push(rule.match_dest_port);       rc.push(`dest_port = $${params.length}`); }
    if (rc.length) conditions.push(`NOT (${rc.join(' AND ')})`);
  }
}

router.get('/stats', wrap(async (req, res) => {
  const hours = hoursParam(req);
  const userId = uid(req);

  const params = [userId];
  const conditions = [`user_id = $1`, `timestamp > NOW() - INTERVAL '${hours} hours'`];
  if (req.query.showSuppressed !== '1') await applySuppressFilters(userId, params, conditions);

  const { rows } = await pool.query(
    `SELECT
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE severity = 'critical')    AS critical,
      COUNT(*) FILTER (WHERE severity = 'high')        AS high,
      COUNT(*) FILTER (WHERE event_id = 4625)          AS failed_logins
     FROM logs
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  res.json(rows[0]);
}));

// Field aliases for field:value search syntax
const FIELD_ALIASES = {
  username: 'username', user: 'username',
  host: 'host',
  src: 'source_ip', source_ip: 'source_ip',
  dst: 'dest_ip', dest_ip: 'dest_ip', dest: 'dest_ip',
  process: 'process_name', process_name: 'process_name',
  event_id: 'event_id', event: 'event_id', id: 'event_id',
  message: 'message', msg: 'message',
  source: 'source',
};

const KEYWORD_TEXT_FIELDS = ['message', 'username', 'host', 'source_ip', 'dest_ip', 'process_name'];

function buildSearchConditions(q, params) {
  if (!q || !q.trim()) return [];
  const conditions = [];
  const token = q.trim();

  // Check for field:value syntax
  const colonIdx = token.indexOf(':');
  if (colonIdx > 0) {
    const alias = token.slice(0, colonIdx).toLowerCase();
    const value = token.slice(colonIdx + 1).trim();
    const field = FIELD_ALIASES[alias];
    if (field && value) {
      if (field === 'event_id') {
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
          params.push(num);
          conditions.push(`event_id = $${params.length}`);
          return conditions;
        }
      }
      params.push(`%${value}%`);
      conditions.push(`${field}::text ILIKE $${params.length}`);
      return conditions;
    }
  }

  // Plain keyword — OR across all text fields + exact event_id match
  const num = parseInt(token, 10);
  const orParts = [];
  for (const field of KEYWORD_TEXT_FIELDS) {
    params.push(`%${token}%`);
    orParts.push(`${field}::text ILIKE $${params.length}`);
  }
  if (!isNaN(num)) {
    params.push(num);
    orParts.push(`event_id = $${params.length}`);
  }
  conditions.push(`(${orParts.join(' OR ')})`);
  return conditions;
}

router.get('/events/recent', wrap(async (req, res) => {
  const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
  const validCategories = ['authentication', 'network', 'process', 'file', 'dns', 'registry', 'system', 'firewall', 'account', 'policy'];
  const validSources = ['node-shipper', 'winlogbeat', 'fluent-bit', 'syslog'];
  const hours = hoursParam(req);
  const userId = uid(req);
  const sev = validSeverities.includes(req.query.severity) ? req.query.severity : null;
  const cat = validCategories.includes(req.query.category) ? req.query.category : null;
  const src = validSources.includes(req.query.source) ? req.query.source : null;
  // Sanitize search query — max 200 chars, strip null bytes
  const rawQ = typeof req.query.q === 'string' ? req.query.q.replace(/\0/g, '').slice(0, 200) : null;
  const q = rawQ && rawQ.trim() ? rawQ.trim() : null;

  const params = [userId];
  const conditions = [`user_id = $1`, `timestamp > NOW() - INTERVAL '${hours} hours'`];
  if (sev) { params.push(sev); conditions.push(`severity = $${params.length}`); }
  if (cat) { params.push(cat); conditions.push(`event_category = $${params.length}`); }
  if (src) { params.push(src); conditions.push(`source = $${params.length}`); }
  for (const c of buildSearchConditions(q, params)) conditions.push(c);
  if (req.query.showSuppressed !== '1') await applySuppressFilters(userId, params, conditions);

  const { rows } = await pool.query(
    `SELECT id, timestamp, severity, event_id, event_category, message,
            host, source_ip, dest_ip, dest_port, protocol,
            username, domain, logon_type,
            process_name, process_id, parent_process_name,
            file_path, registry_key, source
     FROM logs WHERE ${conditions.join(' AND ')}
     ORDER BY timestamp DESC LIMIT 200`,
    params
  );
  res.json(rows);
}));

router.get('/events/by-severity', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT severity, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '${hours} hours'
     GROUP BY severity ORDER BY count DESC`,
    [uid(req)]
  );
  res.json(rows);
});

router.get('/events/by-source', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT host, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '${hours} hours'
     GROUP BY host ORDER BY count DESC LIMIT 10`,
    [uid(req)]
  );
  res.json(rows);
});

router.get('/events/top-event-ids', wrap(async (req, res) => {
  const hours = hoursParam(req);
  const userId = uid(req);
  const params = [userId];
  const conditions = [`user_id = $1`, `timestamp > NOW() - INTERVAL '${hours} hours'`, `event_id IS NOT NULL`];
  if (req.query.showSuppressed !== '1') await applySuppressFilters(userId, params, conditions);
  const { rows } = await pool.query(
    `SELECT event_id, COUNT(*) AS count FROM logs WHERE ${conditions.join(' AND ')} GROUP BY event_id ORDER BY count DESC LIMIT 10`,
    params
  );
  res.json(rows);
}));

router.get('/events/top-usernames', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT username, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '${hours} hours'
       AND username IS NOT NULL
     GROUP BY username ORDER BY count DESC LIMIT 10`,
    [uid(req)]
  );
  res.json(rows);
});

router.get('/events/top-dest-ports', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT dest_port, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '${hours} hours'
       AND dest_port IS NOT NULL
     GROUP BY dest_port ORDER BY count DESC LIMIT 10`,
    [uid(req)]
  );
  res.json(rows);
});

router.get('/events/top-processes', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT process_name, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '${hours} hours'
       AND process_name IS NOT NULL
     GROUP BY process_name ORDER BY count DESC LIMIT 10`,
    [uid(req)]
  );
  res.json(rows);
});

router.get('/events/top-dest-ips', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT dest_ip, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '${hours} hours'
       AND dest_ip IS NOT NULL
     GROUP BY dest_ip ORDER BY count DESC LIMIT 10`,
    [uid(req)]
  );
  res.json(rows);
});

router.get('/events/categories', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT event_category AS category, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1
       AND timestamp > NOW() - INTERVAL '${hours} hours'
       AND event_category IS NOT NULL
     GROUP BY event_category ORDER BY count DESC`,
    [uid(req)]
  );
  res.json(rows);
});

router.get('/events/sources-list', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT source, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1
       AND timestamp > NOW() - INTERVAL '${hours} hours'
       AND source IS NOT NULL
     GROUP BY source ORDER BY count DESC`,
    [uid(req)]
  );
  res.json(rows);
});

router.get('/events/hourly', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT
       date_trunc('hour', timestamp) AS hour,
       severity,
       COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '${hours} hours'
     GROUP BY hour, severity
     ORDER BY hour ASC`,
    [uid(req)]
  );
  res.json(rows);
});

router.get('/events/failed-logins', wrap(async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT timestamp, username, host, source_ip, message
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '${hours} hours'
       AND event_id = '4625'
     ORDER BY timestamp DESC LIMIT 20`,
    [uid(req)]
  );
  res.json(rows);
}));

// GET /api/siem/events/process-tree?process_guid=...&host=...&hours=24
// Walks ancestors (up to root) and all descendants via recursive CTE using process_guid linkage.
// Falls back to PID-based matching on same host/minute window when guids are unavailable.
router.get('/events/process-tree', wrap(async (req, res) => {
  const { process_guid, host, process_name, hours = 24 } = req.query;
  const userId = uid(req);

  if (process_guid) {
    // GUID-based recursive walk — reliable even across PID recycling
    const { rows } = await pool.query(
      `WITH RECURSIVE
        -- One representative row per process_guid: prefer EID 1 (process create), else earliest row
        best_rows AS (
          SELECT DISTINCT ON (UPPER(process_guid))
                 id, process_guid, parent_process_guid, process_name, process_id,
                 parent_process_name, parent_process_id, username, host, timestamp, event_id, message
          FROM logs
          WHERE user_id = $2 AND process_guid IS NOT NULL
          ORDER BY UPPER(process_guid),
                   CASE WHEN event_id = 1 THEN 0 ELSE 1 END,
                   timestamp ASC
        ),
        anchor AS (
          SELECT * FROM best_rows WHERE UPPER(process_guid) = UPPER($1)
        ),
        ancestors AS (
          SELECT a.id, a.process_guid, a.parent_process_guid, a.process_name, a.process_id,
                 a.parent_process_name, a.parent_process_id, a.username, a.host, a.timestamp,
                 a.event_id, a.message, 0 AS depth
          FROM anchor a
          UNION ALL
          SELECT b.id, b.process_guid, b.parent_process_guid, b.process_name, b.process_id,
                 b.parent_process_name, b.parent_process_id, b.username, b.host, b.timestamp,
                 b.event_id, b.message, anc.depth - 1
          FROM best_rows b
          JOIN ancestors anc ON UPPER(b.process_guid) = UPPER(anc.parent_process_guid)
          WHERE anc.depth > -20
        ),
        descendants AS (
          SELECT b.id, b.process_guid, b.parent_process_guid, b.process_name, b.process_id,
                 b.parent_process_name, b.parent_process_id, b.username, b.host, b.timestamp,
                 b.event_id, b.message, 1 AS depth
          FROM best_rows b
          WHERE UPPER(b.parent_process_guid) = UPPER($1)
          UNION ALL
          SELECT b.id, b.process_guid, b.parent_process_guid, b.process_name, b.process_id,
                 b.parent_process_name, b.parent_process_id, b.username, b.host, b.timestamp,
                 b.event_id, b.message, d.depth + 1
          FROM best_rows b
          JOIN descendants d ON UPPER(b.parent_process_guid) = UPPER(d.process_guid)
          WHERE d.depth < 20
        ),
        combined AS (
          SELECT * FROM ancestors
          UNION ALL
          SELECT * FROM descendants
        )
        SELECT * FROM combined ORDER BY depth ASC, timestamp DESC`,
      [process_guid, userId]
    );
    return res.json({ mode: 'guid', nodes: rows });
  }

  // Fallback: no guid available — find events with same process_name on same host in time window
  if (process_name && host) {
    const { rows } = await pool.query(
      `SELECT id, process_guid, parent_process_guid, process_name, process_id,
              parent_process_name, parent_process_id, username, host, timestamp,
              event_id, message, 0 AS depth
       FROM logs
       WHERE user_id = $1 AND host = $2 AND process_name ILIKE $3
         AND timestamp > NOW() - INTERVAL '${parseInt(hours, 10) || 24} hours'
       ORDER BY timestamp ASC LIMIT 50`,
      [userId, host, process_name]
    );
    return res.json({ mode: 'name_fallback', nodes: rows });
  }

  return res.status(400).json({ error: 'process_guid or (process_name + host) required' });
}));

// GET /api/siem/events/:id — must be registered AFTER /events/process-tree to avoid route shadowing
router.get('/events/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const { rows } = await pool.query(
    `SELECT id, timestamp, severity, event_id, event_category, source,
            message, username, domain, host, source_ip, dest_ip, dest_port, protocol,
            process_name, process_id, process_guid,
            parent_process_name, parent_process_id, parent_process_guid,
            file_path, registry_key
     FROM logs WHERE id = $1 AND user_id = $2`,
    [id, uid(req)]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

router.get('/alerts/trend', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
     FROM alerts
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
     GROUP BY day ORDER BY day ASC`,
    [uid(req)]
  );
  res.json(rows);
}));

router.get('/rules/hit-counts', wrap(async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.severity,
            r.match_event_id, r.match_category, r.match_severity,
            r.match_username, r.match_host, r.match_message, r.match_process,
            r.match_src_ip, r.match_dest_ip,
            COUNT(a.id) AS hits
     FROM detection_rules r
     LEFT JOIN alerts a ON a.rule_id = r.id
       AND a.user_id = $1
       AND a.created_at > NOW() - INTERVAL '${hours} hours'
     WHERE r.user_id = $1
     GROUP BY r.id
     ORDER BY hits DESC LIMIT 10`,
    [uid(req)]
  );
  res.json(rows);
}));

router.get('/sources', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM ingest_sources WHERE user_id = $1 ORDER BY last_seen DESC`,
    [uid(req)]
  );
  res.json(rows);
});

// Ingest key management
router.get('/ingest-key', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT created_at FROM user_ingest_keys WHERE user_id = $1',
    [uid(req)]
  );
  // Never return the key on GET — only on POST (one-time reveal at generation)
  res.json(rows[0] ? { exists: true, created_at: rows[0].created_at } : null);
});

router.post('/ingest-key', async (req, res) => {
  const key = randomBytes(32).toString('hex');
  const hashed = hashKey(key);
  const { rows } = await pool.query(
    `INSERT INTO user_ingest_keys (user_id, api_key)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET api_key = $2
     RETURNING created_at`,
    [uid(req), hashed]
  );
  // Return the plaintext key once — it is never stored or retrievable again
  res.json({ api_key: key, created_at: rows[0].created_at });
});

router.get('/shipper-download', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT api_key FROM user_ingest_keys WHERE user_id = $1',
    [uid(req)]
  );
  if (!rows[0]) return res.status(400).json({ error: 'Generate an ingest key first.' });

  const apiKey = rows[0].api_key;
  const ingestUrl = process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.replace(/\/$/, '').replace(/^http:/, 'https:') + '/api/ingest/beats'
    : 'https://tools.laynekudo.com/api/ingest/beats';

  const shipperDir = resolve(__dirname, '../../../shipper');
  const indexJs = readFileSync(resolve(shipperDir, 'index.js'), 'utf8');
  const packageJson = readFileSync(resolve(shipperDir, 'package.json'), 'utf8');
  const envContents = `INGEST_URL=${ingestUrl}\nINGEST_API_KEY=${apiKey}\nPOLL_INTERVAL_MS=60000\nBATCH_SIZE=50\nHOURS_BACK=24\n`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="0xkudo-shipper.zip"');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => { throw err; });
  archive.pipe(res);
  archive.append(indexJs, { name: '0xkudo-shipper/index.js' });
  archive.append(packageJson, { name: '0xkudo-shipper/package.json' });
  archive.append(envContents, { name: '0xkudo-shipper/.env' });
  await archive.finalize();
}));

// ── DETECTION RULES ─────────────────────────────────────────────────────────

router.get('/rules', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM detection_rules WHERE user_id = $1 ORDER BY created_at DESC',
    [uid(req)]
  );
  res.json(rows);
}));

router.post('/rules', wrap(async (req, res) => {
  const { name, description, enabled, severity, action, match_event_id, match_category,
          match_severity, match_username, match_host, match_message,
          match_process, match_src_ip, match_dest_ip, match_dest_port } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });
  const validSev = ['critical', 'high', 'medium', 'low', 'info'];
  const validActions = ['alert', 'suppress'];
  const ruleSev = validSev.includes(severity) ? severity : 'high';
  const ruleAction = validActions.includes(action) ? action : 'alert';
  const { rows } = await pool.query(
    `INSERT INTO detection_rules
      (user_id, name, description, enabled, severity, action,
       match_event_id, match_category, match_severity, match_username,
       match_host, match_message, match_process, match_src_ip, match_dest_ip, match_dest_port)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [uid(req), name.trim().slice(0, 255),
     description ? String(description).slice(0, 1000) : null,
     enabled !== false,
     ruleSev,
     ruleAction,
     match_event_id ? parseInt(match_event_id, 10) || null : null,
     match_category ? String(match_category).slice(0, 64) : null,
     validSev.includes(match_severity) ? match_severity : null,
     match_username ? String(match_username).slice(0, 255) : null,
     match_host ? String(match_host).slice(0, 255) : null,
     match_message ? String(match_message).slice(0, 500) : null,
     match_process ? String(match_process).slice(0, 255) : null,
     match_src_ip ? String(match_src_ip).slice(0, 64) : null,
     match_dest_ip ? String(match_dest_ip).slice(0, 64) : null,
     match_dest_port ? parseInt(match_dest_port, 10) || null : null,
    ]
  );
  res.json(rows[0]);
}));

router.patch('/rules/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  // Only allow toggling enabled or updating name/description/severity/conditions
  const allowed = ['name','description','enabled','severity','action',
    'match_event_id','match_category','match_severity','match_username',
    'match_host','match_message','match_process','match_src_ip','match_dest_ip','match_dest_port'];
  const updates = [];
  const params = [uid(req), id];
  for (const key of allowed) {
    if (key in req.body) {
      params.push(req.body[key] === '' ? null : req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  updates.push(`updated_at = NOW()`);
  const { rows } = await pool.query(
    `UPDATE detection_rules SET ${updates.join(', ')}
     WHERE user_id = $1 AND id = $2 RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));

router.delete('/rules/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  await pool.query('DELETE FROM alerts WHERE user_id = $1 AND rule_id = $2', [uid(req), id]);
  await pool.query('DELETE FROM detection_rules WHERE user_id = $1 AND id = $2', [uid(req), id]);
  res.json({ ok: true });
}));

// Build match conditions for a rule against the logs table (alias l)
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

// Run all enabled rules against recent logs
router.post('/rules/run', wrap(async (req, res) => {
  const userId = uid(req);
  const { rows: rules } = await pool.query(
    'SELECT * FROM detection_rules WHERE user_id = $1 AND enabled = true',
    [userId]
  );
  if (!rules.length) return res.json({ created: 0 });

  const suppressRules = rules.filter(r => r.action === 'suppress');
  const alertRules    = rules.filter(r => r.action !== 'suppress');

  // Build a set of suppressed log IDs from all suppress rules
  const suppressedLogIds = new Set();
  for (const rule of suppressRules) {
    const { params, conds } = ruleConditions(rule, userId);
    conds.push(`l.timestamp > NOW() - INTERVAL '24 hours'`);
    const { rows } = await pool.query(
      `SELECT l.id FROM logs l WHERE ${conds.join(' AND ')} LIMIT 10000`,
      params
    );
    rows.forEach(r => suppressedLogIds.add(r.id));
  }

  let created = 0;
  let deduped = 0;

  for (const rule of alertRules) {
    const { params, conds } = ruleConditions(rule, userId);

    // Exclude already-alerted logs for this rule
    conds.push(`l.id NOT IN (SELECT log_id FROM alerts WHERE user_id = $1 AND rule_id = ${rule.id} AND log_id IS NOT NULL)`);
    conds.push(`l.timestamp > NOW() - INTERVAL '24 hours'`);

    const { rows: matches } = await pool.query(
      `SELECT l.id, l.host, l.source_ip, l.username, l.event_id, l.message
       FROM logs l WHERE ${conds.join(' AND ')} LIMIT 500`,
      params
    );

    for (const log of matches) {
      // Skip if suppressed
      if (suppressedLogIds.has(log.id)) continue;

      const result = await pool.query(
        `INSERT INTO alerts (user_id, rule_id, log_id, title, severity, host, source_ip, username, event_id, message, count, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, NOW())
         ON CONFLICT ON CONSTRAINT alerts_dedup
         DO UPDATE SET count = alerts.count + 1, last_seen = NOW(), log_id = EXCLUDED.log_id
         RETURNING (xmax = 0) AS inserted`,
        [userId, rule.id, log.id, rule.name, rule.severity,
         log.host, log.source_ip, log.username, log.event_id,
         log.message ? log.message.slice(0, 500) : null]
      );
      if (result.rows[0]?.inserted) created++;
      else deduped++;
    }
  }
  res.json({ created, deduped, suppressed: suppressedLogIds.size });
}));

// ── ALERTS ───────────────────────────────────────────────────────────────────

router.get('/alerts', wrap(async (req, res) => {
  const validStatuses = ['new', 'acknowledged', 'resolved'];
  const status = validStatuses.includes(req.query.status) ? req.query.status : null;
  const params = [uid(req)];
  const conds = ['a.user_id = $1'];
  if (status) { params.push(status); conds.push(`a.status = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT a.*, r.name AS rule_name
     FROM alerts a
     LEFT JOIN detection_rules r ON r.id = a.rule_id
     WHERE ${conds.join(' AND ')}
     ORDER BY a.created_at DESC LIMIT 200`,
    params
  );
  res.json(rows);
}));

router.get('/alerts/counts', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*) AS count FROM alerts a WHERE a.user_id = $1 GROUP BY status`,
    [uid(req)]
  );
  res.json(rows);
}));

router.patch('/alerts/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const validStatuses = ['new', 'acknowledged', 'resolved'];
  const status = validStatuses.includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: 'valid status required' });
  const { rows } = await pool.query(
    `UPDATE alerts SET status = $1, updated_at = NOW()
     WHERE user_id = $2 AND id = $3 RETURNING *`,
    [status, uid(req), id]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));

router.post('/alerts/bulk', wrap(async (req, res) => {
  const { ids, action, status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
  const safeIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  if (!safeIds.length) return res.status(400).json({ error: 'no valid ids' });
  const placeholders = safeIds.map((_, i) => `$${i + 2}`).join(', ');
  if (action === 'delete') {
    await pool.query(`DELETE FROM alerts WHERE user_id = $1 AND id IN (${placeholders})`, [uid(req), ...safeIds]);
  } else if (action === 'status' && STATUS_VALUES.includes(status)) {
    await pool.query(`UPDATE alerts SET status = $2 WHERE user_id = $1 AND id IN (${placeholders})`, [uid(req), status, ...safeIds]);
  } else {
    return res.status(400).json({ error: 'invalid action' });
  }
  res.json({ ok: true, count: safeIds.length });
}));

router.delete('/alerts/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  await pool.query('DELETE FROM alerts WHERE user_id = $1 AND id = $2', [uid(req), id]);
  res.json({ ok: true });
}));

// ── CASES ────────────────────────────────────────────────────────────────────

router.get('/cases', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*,
       COUNT(ca.alert_id) AS alert_count
     FROM cases c
     LEFT JOIN case_alerts ca ON ca.case_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY c.updated_at DESC`,
    [uid(req)]
  );
  res.json(rows);
}));

router.post('/cases', wrap(async (req, res) => {
  const { title, description, severity } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title required' });
  const validSev = ['critical', 'high', 'medium', 'low', 'info'];
  const { rows } = await pool.query(
    `INSERT INTO cases (user_id, title, description, severity)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [uid(req), title.trim().slice(0, 255),
     description ? String(description).slice(0, 2000) : null,
     validSev.includes(severity) ? severity : 'medium']
  );
  res.json(rows[0]);
}));

router.patch('/cases/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const allowed = ['title', 'description', 'severity', 'status'];
  const updates = [];
  const params = [uid(req), id];
  for (const key of allowed) {
    if (key in req.body) {
      params.push(req.body[key] === '' ? null : req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  updates.push('updated_at = NOW()');
  const { rows } = await pool.query(
    `UPDATE cases SET ${updates.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));

router.delete('/cases/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  await pool.query('DELETE FROM cases WHERE user_id = $1 AND id = $2', [uid(req), id]);
  res.json({ ok: true });
}));

router.post('/cases/:id/alerts', wrap(async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  const alertId = parseInt(req.body.alert_id, 10);
  if (isNaN(caseId) || isNaN(alertId)) return res.status(400).json({ error: 'invalid ids' });
  // Verify case belongs to user
  const { rows: caseRows } = await pool.query('SELECT id FROM cases WHERE id = $1 AND user_id = $2', [caseId, uid(req)]);
  if (!caseRows.length) return res.status(404).json({ error: 'case not found' });
  await pool.query(
    'INSERT INTO case_alerts (case_id, alert_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [caseId, alertId]
  );
  await pool.query('UPDATE cases SET updated_at = NOW() WHERE id = $1', [caseId]);
  res.json({ ok: true });
}));

router.get('/cases/:id/alerts', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows } = await pool.query(
    `SELECT a.* FROM alerts a
     JOIN case_alerts ca ON ca.alert_id = a.id
     WHERE ca.case_id = $1 AND a.user_id = $2
     ORDER BY a.created_at DESC`,
    [id, uid(req)]
  );
  res.json(rows);
}));

// ── USER SETTINGS ────────────────────────────────────────────────────────────

router.get('/settings', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM user_settings WHERE user_id = $1',
    [uid(req)]
  );
  res.json(rows[0] || { log_retention_days: 90 });
}));

router.patch('/settings', wrap(async (req, res) => {
  const days = parseInt(req.body.log_retention_days, 10);
  if (isNaN(days) || days < 1 || days > 3650) {
    return res.status(400).json({ error: 'log_retention_days must be between 1 and 3650' });
  }
  const { rows } = await pool.query(
    `INSERT INTO user_settings (user_id, log_retention_days)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET log_retention_days = $2, updated_at = NOW()
     RETURNING *`,
    [uid(req), days]
  );
  res.json(rows[0]);
}));

// ── LOG EXPORT ───────────────────────────────────────────────────────────────

router.get('/logs/export', wrap(async (req, res) => {
  const { from, to } = req.query;

  // Parse and validate dates
  const fromDate = from ? new Date(from) : null;
  const toDate   = to   ? new Date(to)   : null;
  if (!fromDate || isNaN(fromDate.getTime())) return res.status(400).json({ error: 'valid "from" date required (ISO 8601)' });
  if (!toDate   || isNaN(toDate.getTime()))   return res.status(400).json({ error: 'valid "to" date required (ISO 8601)' });
  if (toDate <= fromDate) return res.status(400).json({ error: '"to" must be after "from"' });

  const { rows } = await pool.query(
    `SELECT id, timestamp, severity, event_id, event_category, source,
            host, source_ip, dest_ip, dest_port, protocol,
            username, domain, logon_type,
            process_name, process_id, parent_process_name,
            file_path, registry_key, message, raw
     FROM logs
     WHERE user_id = $1 AND timestamp >= $2 AND timestamp < $3
     ORDER BY timestamp ASC`,
    [uid(req), fromDate.toISOString(), toDate.toISOString()]
  );

  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr   = toDate.toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="logs-${fromStr}-to-${toStr}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.json(rows);
}));

export default router;
