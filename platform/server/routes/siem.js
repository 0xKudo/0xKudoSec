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
import { dbContext } from '../middleware/dbContext.js';
import { runDetectionRules } from '../services/detection.js';
import { validateTechniqueIds } from '../../shared/attack.js';
import { audit } from '../services/audit.js';
import { broadcast } from '../services/wsBroadcast.js';
import { ingestKeyLimiter, ruleImportLimiter } from '../middleware/rateLimiter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = Router();
router.use(requireAuth);
router.use(dbContext); // req.db runs every query with RLS app.user_id set

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

// Surface useful sub-objects from the stored raw JSON as flat fields so the UI can
// render them (HTTP request detail, file-integrity hashes, WordPress context)
// without shipping the whole raw blob in list responses.
function enrichFromRaw(row) {
  if (!row || !row.raw) { if (row) delete row.raw; return row; }
  let parsed;
  try { parsed = typeof row.raw === 'string' ? JSON.parse(row.raw) : row.raw; } catch { parsed = null; }
  if (parsed && typeof parsed === 'object') {
    if (parsed.http && typeof parsed.http === 'object') {
      row.http_method = parsed.http.method ?? null;
      row.http_url = parsed.http.uri ?? null;
      row.http_status = parsed.http.status ?? null;
      row.http_ua = parsed.http.ua ?? null;
      row.http_referer = parsed.http.referer ?? null;
    }
    if (parsed.file && typeof parsed.file === 'object') {
      row.fim_hash_expected = parsed.file.hash_expected ?? null;
      row.fim_hash_actual = parsed.file.hash_actual ?? null;
    }
    if (parsed.context && typeof parsed.context === 'object') {
      row.wp_site = parsed.site ?? null;
      row.wp_version = parsed.context.wp_version ?? null;
    }
  }
  delete row.raw;
  return row;
}

// Fetch active suppress rules and return inline NOT(...) conditions + params to append to any query.
// Pass params array (already containing [$1=userId, ...]) and conditions array to mutate in place.
async function applySuppressFilters(userId, params, conditions) {
  const { rows: rules } = await pool.withUserPool(userId).query(
    `SELECT * FROM detection_rules WHERE user_id = $1 AND enabled = true AND action = 'suppress'`,
    [userId]
  );
  for (const rule of rules) {
    const rc = [];
    if (rule.match_event_id)  { params.push(rule.match_event_id);        rc.push(`event_id = $${params.length}`); }
    if (rule.match_category)  { params.push(rule.match_category);        rc.push(`event_category = $${params.length}`); }
    if (rule.match_severity)  { params.push(rule.match_severity);        rc.push(`severity = $${params.length}`); }
    if (rule.match_username)  { params.push(`%${rule.match_username}%`); rc.push(`(username ILIKE $${params.length})`); }
    if (rule.match_host)      { params.push(`%${rule.match_host}%`);     rc.push(`(host ILIKE $${params.length})`); }
    if (rule.match_message)   { params.push(`%${rule.match_message}%`);  rc.push(`(message ILIKE $${params.length})`); }
    if (rule.match_process)   { params.push(`%${rule.match_process}%`);  rc.push(`(process_name IS NOT NULL AND process_name ILIKE $${params.length})`); }
    if (rule.match_src_ip)    { params.push(`%${rule.match_src_ip}%`);   rc.push(`(source_ip IS NOT NULL AND source_ip::text ILIKE $${params.length})`); }
    if (rule.match_dest_ip)   { params.push(`%${rule.match_dest_ip}%`);  rc.push(`(dest_ip IS NOT NULL AND dest_ip::text ILIKE $${params.length})`); }
    if (rule.match_dest_port) { params.push(rule.match_dest_port);       rc.push(`dest_port = $${params.length}`); }
    if (rc.length) conditions.push(`NOT (${rc.join(' AND ')})`);
  }
}

router.get('/stats', wrap(async (req, res) => {
  const hours = hoursParam(req);
  const userId = uid(req);

  const params = [userId];
  params.push(hours); const conditions = [`user_id = $1`, `timestamp > NOW() - make_interval(hours := $${params.length})`];
  if (req.query.showSuppressed !== '1') await applySuppressFilters(userId, params, conditions);

  const { rows } = await req.db.query(
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

// Parse a single search token into SQL condition(s). Mutates params in place.
function buildTokenCondition(token, params) {
  // field:value syntax — supports comma-separated values for OR within a field
  const colonIdx = token.indexOf(':');
  if (colonIdx > 0) {
    const alias = token.slice(0, colonIdx).toLowerCase();
    const rawValue = token.slice(colonIdx + 1).trim();
    const field = FIELD_ALIASES[alias];
    if (field && rawValue) {
      // Comma-separated values produce OR within that field
      const values = rawValue.split(',').map(v => v.trim()).filter(Boolean);
      if (field === 'event_id') {
        const nums = values.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
        if (nums.length === 1) {
          params.push(nums[0]);
          return `event_id = $${params.length}`;
        } else if (nums.length > 1) {
          // Use = ANY($n) with an array param
          params.push(nums);
          return `event_id = ANY($${params.length})`;
        }
        return null;
      }
      if (values.length === 1) {
        params.push(`%${values[0]}%`);
        return `${field}::text ILIKE $${params.length}`;
      } else {
        const parts = values.map(v => {
          params.push(`%${v}%`);
          return `${field}::text ILIKE $${params.length}`;
        });
        return `(${parts.join(' OR ')})`;
      }
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
  return `(${orParts.join(' OR ')})`;
}

// Split query into tokens (space-separated), each AND'd together.
// Quoted phrases ("foo bar") are kept as single tokens.
function buildSearchConditions(q, params) {
  if (!q || !q.trim()) return [];

  // Tokenize: quoted strings stay together, otherwise split on whitespace
  const tokens = [];
  const tokenRe = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = tokenRe.exec(q)) !== null) {
    tokens.push((m[1] || m[2]).trim());
  }
  if (!tokens.length) return [];

  const conditions = [];
  for (const token of tokens.slice(0, 10)) { // cap at 10 terms
    const cond = buildTokenCondition(token, params);
    if (cond) conditions.push(cond);
  }
  return conditions;
}

router.get('/events/recent', wrap(async (req, res) => {
  const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
  const validCategories = ['authentication', 'network', 'process', 'file', 'dns', 'registry', 'system', 'firewall', 'account', 'policy'];
  const validSources = ['node-shipper', 'winlogbeat', 'fluent-bit', 'syslog'];
  const hours = hoursParam(req);
  const userId = uid(req);
  // severity accepts a single value or comma-separated list for multi-select
  const rawSev = typeof req.query.severity === 'string' ? req.query.severity : '';
  const sevList = rawSev.split(',').map(s => s.trim()).filter(s => validSeverities.includes(s));
  const cat = validCategories.includes(req.query.category) ? req.query.category : null;
  const src = validSources.includes(req.query.source) ? req.query.source : null;
  // Sanitize search query — max 200 chars, strip null bytes
  const rawQ = typeof req.query.q === 'string' ? req.query.q.replace(/\0/g, '').slice(0, 200) : null;
  const q = rawQ && rawQ.trim() ? rawQ.trim() : null;

  const params = [userId];
  params.push(hours); const conditions = [`user_id = $1`, `timestamp > NOW() - make_interval(hours := $${params.length})`];
  if (sevList.length === 1) {
    params.push(sevList[0]); conditions.push(`severity = $${params.length}`);
  } else if (sevList.length > 1) {
    const placeholders = sevList.map(s => { params.push(s); return `$${params.length}`; }).join(', ');
    conditions.push(`severity IN (${placeholders})`);
  }
  if (cat) { params.push(cat); conditions.push(`event_category = $${params.length}`); }
  if (src) { params.push(src); conditions.push(`source = $${params.length}`); }
  for (const c of buildSearchConditions(q, params)) conditions.push(c);
  if (req.query.showSuppressed !== '1') await applySuppressFilters(userId, params, conditions);

  const { rows } = await req.db.query(
    `SELECT id, timestamp, severity, event_id, event_category, message,
            host, source_ip, dest_ip, dest_port, protocol,
            username, domain, logon_type,
            process_name, process_id, parent_process_name,
            file_path, registry_key, source, raw
     FROM logs WHERE ${conditions.join(' AND ')}
     ORDER BY timestamp DESC LIMIT 200`,
    params
  );
  res.json(rows.map(enrichFromRaw));
}));

router.get('/events/by-severity', wrap(async (req, res) => {
  const hours = hoursParam(req);
  const userId = uid(req);
  const params = [userId];
  params.push(hours); const conditions = [`user_id = $1`, `timestamp > NOW() - make_interval(hours := $${params.length})`];
  if (req.query.showSuppressed !== '1') await applySuppressFilters(userId, params, conditions);
  const { rows } = await req.db.query(
    `SELECT severity, COUNT(*) AS count FROM logs WHERE ${conditions.join(' AND ')} GROUP BY severity ORDER BY count DESC`,
    params
  );
  res.json(rows);
}));

router.get('/events/by-source', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await req.db.query(
    `SELECT host, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - make_interval(hours := $2)
     GROUP BY host ORDER BY count DESC LIMIT 10`,
    [uid(req), hours]
  );
  res.json(rows);
});

router.get('/events/top-event-ids', wrap(async (req, res) => {
  const hours = hoursParam(req);
  const userId = uid(req);
  const params = [userId];
  params.push(hours); const conditions = [`user_id = $1`, `timestamp > NOW() - make_interval(hours := $${params.length})`, `event_id IS NOT NULL`];
  if (req.query.showSuppressed !== '1') await applySuppressFilters(userId, params, conditions);
  const { rows } = await req.db.query(
    `SELECT event_id, COUNT(*) AS count FROM logs WHERE ${conditions.join(' AND ')} GROUP BY event_id ORDER BY count DESC LIMIT 10`,
    params
  );
  res.json(rows);
}));

router.get('/events/top-usernames', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await req.db.query(
    `SELECT username, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - make_interval(hours := $2)
       AND username IS NOT NULL
     GROUP BY username ORDER BY count DESC LIMIT 10`,
    [uid(req), hours]
  );
  res.json(rows);
});

router.get('/events/top-dest-ports', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await req.db.query(
    `SELECT dest_port, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - make_interval(hours := $2)
       AND dest_port IS NOT NULL
     GROUP BY dest_port ORDER BY count DESC LIMIT 10`,
    [uid(req), hours]
  );
  res.json(rows);
});

router.get('/events/top-processes', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await req.db.query(
    `SELECT process_name, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - make_interval(hours := $2)
       AND process_name IS NOT NULL
     GROUP BY process_name ORDER BY count DESC LIMIT 10`,
    [uid(req), hours]
  );
  res.json(rows);
});

router.get('/events/top-dest-ips', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await req.db.query(
    `SELECT dest_ip, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - make_interval(hours := $2)
       AND dest_ip IS NOT NULL
     GROUP BY dest_ip ORDER BY count DESC LIMIT 10`,
    [uid(req), hours]
  );
  res.json(rows);
});

router.get('/events/categories', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await req.db.query(
    `SELECT event_category AS category, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1
       AND timestamp > NOW() - make_interval(hours := $2)
       AND event_category IS NOT NULL
     GROUP BY event_category ORDER BY count DESC`,
    [uid(req), hours]
  );
  res.json(rows);
});

router.get('/events/sources-list', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await req.db.query(
    `SELECT source, COUNT(*) AS count
     FROM logs
     WHERE user_id = $1
       AND timestamp > NOW() - make_interval(hours := $2)
       AND source IS NOT NULL
     GROUP BY source ORDER BY count DESC`,
    [uid(req), hours]
  );
  res.json(rows);
});

router.get('/events/hourly', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await req.db.query(
    `SELECT
       date_trunc('hour', timestamp) AS hour,
       severity,
       COUNT(*) AS count
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - make_interval(hours := $2)
     GROUP BY hour, severity
     ORDER BY hour ASC`,
    [uid(req), hours]
  );
  res.json(rows);
});

router.get('/events/failed-logins', wrap(async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await req.db.query(
    `SELECT timestamp, username, host, source_ip, message
     FROM logs
     WHERE user_id = $1 AND timestamp > NOW() - make_interval(hours := $2)
       AND event_id = '4625'
     ORDER BY timestamp DESC LIMIT 20`,
    [uid(req), hours]
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
    const { rows } = await req.db.query(
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
    const safeHours = parseInt(hours, 10);
    const { rows } = await req.db.query(
      `SELECT id, process_guid, parent_process_guid, process_name, process_id,
              parent_process_name, parent_process_id, username, host, timestamp,
              event_id, message, 0 AS depth
       FROM logs
       WHERE user_id = $1 AND host = $2 AND process_name ILIKE $3
         AND timestamp > NOW() - make_interval(hours := $4)
       ORDER BY timestamp ASC LIMIT 50`,
      [userId, host, process_name, (!isNaN(safeHours) && safeHours > 0 && safeHours <= 168) ? safeHours : 24]
    );
    return res.json({ mode: 'name_fallback', nodes: rows });
  }

  return res.status(400).json({ error: 'process_guid or (process_name + host) required' });
}));

// GET /api/siem/events/:id — must be registered AFTER /events/process-tree to avoid route shadowing
router.get('/events/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const { rows } = await req.db.query(
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
  const { rows } = await req.db.query(
    `SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
     FROM alerts
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
     GROUP BY day ORDER BY day ASC`,
    [uid(req)]
  );
  res.json(rows);
}));

// GET /siem/alerts/hourly — alert counts per bucket for a given time window
// ?hours=1|6|24|48|168 — 1h uses 5-min buckets, 6h uses 30-min, rest use 1-hour buckets
router.get('/alerts/hourly', wrap(async (req, res) => {
  const h = parseInt(req.query.hours, 10);
  const hours = [1, 6, 24, 48, 168].includes(h) ? h : 24;
  // bucket sizes: 1h=5min, 6h=30min, 24h=2hr, 48h=4hr, 7d=1day
  const bucketMinutes = hours === 1 ? 5 : hours === 6 ? 30 : hours === 24 ? 120 : hours === 48 ? 240 : 1440;
  const bucketMs = bucketMinutes * 60000;
  const { rows } = await req.db.query(
    `SELECT date_trunc('minute', last_seen) AS hour, COUNT(*) AS count
     FROM alerts
     WHERE user_id = $1 AND last_seen > NOW() - ($2 || ' hours')::INTERVAL
     GROUP BY hour ORDER BY hour ASC`,
    [uid(req), String(hours)]
  );
  // re-bucket into the target bucket size
  const buckets = {};
  for (const row of rows) {
    const t = new Date(row.hour).getTime();
    const key = Math.floor(t / bucketMs) * bucketMs;
    buckets[key] = (buckets[key] || 0) + Number(row.count);
  }
  res.json(Object.entries(buckets).map(([ts, count]) => ({ hour: new Date(Number(ts)).toISOString(), count })));
}));

// GET /siem/alerts/hourly/detail?hours=N&bucket=<iso-timestamp>
// Returns alerts whose last_seen falls within the bucket containing the given timestamp.
router.get('/alerts/hourly/detail', wrap(async (req, res) => {
  const h = parseInt(req.query.hours, 10);
  const hours = [1, 6, 24, 48, 168].includes(h) ? h : 24;
  const bucketMinutes = hours === 1 ? 5 : hours === 6 ? 15 : hours === 24 ? 120 : hours === 48 ? 240 : 1440;
  const bucketMs = bucketMinutes * 60 * 1000;
  const bucketTs = parseInt(req.query.bucket, 10);
  if (!bucketTs || isNaN(bucketTs)) return res.status(400).json({ error: 'bucket must be a millisecond timestamp' });
  const bucketStart = new Date(bucketTs);
  const bucketEnd = new Date(bucketTs + bucketMs);
  const userId = uid(req);
  const { rows } = await req.db.query(
    `SELECT a.id AS alert_id, a.title, a.severity, a.count, a.last_seen, a.host,
            a.occurrence_times,
            l.id AS log_id, l.event_id, l.event_category, l.source, l.process_name,
            l.username, l.source_ip, l.dest_ip, l.message, l.timestamp
     FROM alerts a
     JOIN logs l ON l.id = a.log_id
     WHERE a.user_id = $1
       AND a.last_seen >= $2 AND a.last_seen < $3
     ORDER BY a.last_seen DESC
     LIMIT 100`,
    [userId, bucketStart.toISOString(), bucketEnd.toISOString()]
  );
  res.json(rows);
}));

router.get('/rules/hit-counts', wrap(async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await req.db.query(
    `SELECT r.id, r.name, r.severity,
            r.match_event_id, r.match_category, r.match_severity,
            r.match_username, r.match_host, r.match_message, r.match_process,
            r.match_src_ip, r.match_dest_ip,
            COUNT(a.id) AS hits
     FROM detection_rules r
     LEFT JOIN alerts a ON a.rule_id = r.id
       AND a.user_id = $1
       AND a.created_at > NOW() - make_interval(hours := $2)
     WHERE r.user_id = $1
     GROUP BY r.id
     ORDER BY hits DESC LIMIT 10`,
    [uid(req), hours]
  );
  res.json(rows);
}));

router.get('/sources', async (req, res) => {
  const { rows } = await req.db.query(
    `SELECT * FROM ingest_sources WHERE user_id = $1 ORDER BY last_seen DESC`,
    [uid(req)]
  );
  res.json(rows);
});

// Ingest key management — multiple named keys per user (one per device/shipper)
const MAX_INGEST_KEYS = 20;

router.get('/ingest-key', async (req, res) => {
  const { rows } = await req.db.query(
    `SELECT id, name, created_at, expires_at, expiry_days, last_used_at
     FROM user_ingest_keys WHERE user_id = $1
     ORDER BY created_at DESC`,
    [uid(req)]
  );
  // Never return the key hash on GET — plaintext is revealed only once on POST.
  res.json({ keys: rows });
});

router.post('/ingest-key', ingestKeyLimiter, async (req, res) => {
  const key = randomBytes(32).toString('hex');
  const hashed = hashKey(key);

  // Validate expiry_days — optional, defaults to 365, range 1-3650
  let expiryDays = 365;
  if (req.body.expiry_days !== undefined) {
    expiryDays = parseInt(req.body.expiry_days, 10);
    if (isNaN(expiryDays) || expiryDays < 1 || expiryDays > 3650) {
      return res.status(400).json({ error: 'expiry_days must be between 1 and 3650' });
    }
  }

  // Optional label so users can tell keys apart per device
  let name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
  if (!name) name = 'Unnamed key';

  const { rows: countRows } = await req.db.query(
    'SELECT COUNT(*)::int AS n FROM user_ingest_keys WHERE user_id = $1', [uid(req)]
  );
  if (countRows[0].n >= MAX_INGEST_KEYS) {
    return res.status(400).json({ error: `Maximum of ${MAX_INGEST_KEYS} keys reached. Revoke one first.` });
  }

  const { rows } = await req.db.query(
    `INSERT INTO user_ingest_keys (user_id, api_key, name, expiry_days, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(days := $4))
     RETURNING id, name, created_at, expires_at, expiry_days`,
    [uid(req), hashed, name, expiryDays]
  );
  audit(uid(req), 'ingest_key.create', { name, expiry_days: expiryDays }, req.ip);
  res.json({
    id: rows[0].id,
    api_key: key,
    name: rows[0].name,
    created_at: rows[0].created_at,
    expires_at: rows[0].expires_at,
    expiry_days: rows[0].expiry_days,
  });
});

// Revoke a single named key
router.delete('/ingest-key/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid key id.' });
  const { rowCount } = await req.db.query(
    'DELETE FROM user_ingest_keys WHERE user_id = $1 AND id = $2', [uid(req), id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Key not found.' });
  audit(uid(req), 'ingest_key.revoke', { id }, req.ip);
  broadcast('ingest_key_rotated', { userId: uid(req) });
  res.json({ ok: true });
});

// --- WordPress protection rules (pushed down to the kudosec-siem plugin) ---

const WP_RULE_TYPES = ['ip', 'cidr', 'ua', 'uri', 'rate', 'action', 'allow'];
const WP_RULE_ACTIONS = ['block', 'log'];
const WP_ACTION_PATTERNS = ['disable_xmlrpc', 'disable_file_editor', 'disable_registration', 'disable_app_passwords', 'block_admin_promotion'];

function validateWpRulePattern(type, pattern) {
  if (typeof pattern !== 'string') return null;
  const p = pattern.trim();
  if (!p || p.length > 512) return null;
  const ipRe = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/;
  switch (type) {
    case 'ip':
    case 'allow':
      return ipRe.test(p) ? p : null;
    case 'cidr': {
      const m = p.match(/^([0-9a-fA-F:.]+)\/(\d{1,3})$/);
      if (!m || !ipRe.test(m[1])) return null;
      const max = m[1].includes(':') ? 128 : 32;
      return Number(m[2]) <= max ? p : null;
    }
    case 'ua':
    case 'uri':
      try { new RegExp(p); return p; } catch { return null; }
    case 'rate':
      return /^[a-z0-9._-]+:\d{1,4}:\d{1,5}$/i.test(p) ? p : null;
    case 'action':
      return WP_ACTION_PATTERNS.includes(p) ? p : null;
    default:
      return null;
  }
}

router.get('/wp-rules', wrap(async (req, res) => {
  const { rows } = await req.db.query(
    'SELECT id, rule_type, pattern, action, enabled, created_at FROM wp_protection_rules WHERE user_id = $1 ORDER BY id DESC',
    [uid(req)]
  );
  res.json(rows);
}));

router.post('/wp-rules', wrap(async (req, res) => {
  const { rule_type, pattern, action } = req.body || {};
  if (!WP_RULE_TYPES.includes(rule_type)) {
    return res.status(400).json({ error: 'Invalid rule_type' });
  }
  const act = action === undefined ? 'block' : action;
  if (!WP_RULE_ACTIONS.includes(act)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  const clean = validateWpRulePattern(rule_type, pattern);
  if (clean === null) {
    return res.status(400).json({ error: 'Invalid pattern for rule type' });
  }
  const { rows: countRows } = await req.db.query(
    'SELECT COUNT(*)::int AS n FROM wp_protection_rules WHERE user_id = $1', [uid(req)]
  );
  if (countRows[0].n >= 200) {
    return res.status(400).json({ error: 'Rule limit reached (200)' });
  }
  const { rows } = await req.db.query(
    `INSERT INTO wp_protection_rules (user_id, rule_type, pattern, action, enabled)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, rule_type, pattern, action, enabled, created_at`,
    [uid(req), rule_type, clean, act]
  );
  audit(uid(req), 'wp_rule.create', { rule_type, pattern: clean }, req.ip);
  res.json(rows[0]);
}));

router.patch('/wp-rules/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || typeof req.body?.enabled !== 'boolean') {
    return res.status(400).json({ error: 'Expected { enabled: boolean }' });
  }
  const { rows } = await req.db.query(
    'UPDATE wp_protection_rules SET enabled = $1 WHERE id = $2 AND user_id = $3 RETURNING id, enabled',
    [req.body.enabled, id, uid(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Rule not found' });
  res.json(rows[0]);
}));

router.delete('/wp-rules/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const { rowCount } = await req.db.query(
    'DELETE FROM wp_protection_rules WHERE id = $1 AND user_id = $2', [id, uid(req)]
  );
  if (!rowCount) return res.status(404).json({ error: 'Rule not found' });
  audit(uid(req), 'wp_rule.delete', { rule_id: id }, req.ip);
  res.json({ deleted: true });
}));

router.get('/shipper-download', wrap(async (req, res) => {
  const { rows } = await req.db.query(
    'SELECT api_key FROM user_ingest_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [uid(req)]
  );
  if (!rows[0]) return res.status(400).json({ error: 'Generate an ingest key first.' });

  const apiKey = rows[0].api_key;
  const ingestUrl = process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.replace(/\/$/, '').replace(/^http:/, 'https:') + '/api/ingest/beats'
    : 'https://0xkudo.com/api/ingest/beats';

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
  const { rows } = await req.db.query(
    'SELECT * FROM detection_rules WHERE user_id = $1 ORDER BY created_at DESC',
    [uid(req)]
  );
  res.json(rows);
}));

router.post('/rules', wrap(async (req, res) => {
  const { name, description, enabled, severity, action, match_event_id, match_category,
          match_severity, match_username, match_host, match_message,
          match_process, match_src_ip, match_dest_ip, match_dest_port,
          attack_techniques } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });
  const validSev = ['critical', 'high', 'medium', 'low', 'info'];
  const validActions = ['alert', 'suppress'];
  const ruleSev = validSev.includes(severity) ? severity : 'high';
  const ruleAction = validActions.includes(action) ? action : 'alert';
  // Only store recognized ATT&CK technique IDs; silently drop unknown ones.
  const techniques = Array.isArray(attack_techniques)
    ? validateTechniqueIds(attack_techniques.map(String)).valid.slice(0, 50)
    : [];
  const { rows: existing } = await req.db.query(
    `SELECT id FROM detection_rules WHERE user_id = $1 AND action = $2
     AND COALESCE(match_event_id, -1) = COALESCE($3, -1)
     AND COALESCE(match_category, '') = COALESCE($4, '')
     AND COALESCE(match_severity, '') = COALESCE($5, '')
     AND COALESCE(match_host, '') = COALESCE($6, '')
     AND COALESCE(match_process, '') = COALESCE($7, '')
     AND COALESCE(match_username, '') = COALESCE($8, '')
     AND COALESCE(match_message, '') = COALESCE($9, '')
     AND COALESCE(match_src_ip::text, '') = COALESCE($10, '')
     AND COALESCE(match_dest_ip::text, '') = COALESCE($11, '')
     AND COALESCE(match_dest_port, -1) = COALESCE($12, -1)`,
    [uid(req), ruleAction,
     match_event_id ? parseInt(match_event_id, 10) || null : null,
     match_category ? String(match_category).slice(0, 64) : null,
     validSev.includes(match_severity) ? match_severity : null,
     match_host ? String(match_host).slice(0, 255) : null,
     match_process ? String(match_process).slice(0, 500) : null,
     match_username ? String(match_username).slice(0, 255) : null,
     match_message ? String(match_message).slice(0, 500) : null,
     match_src_ip ? String(match_src_ip) : null,
     match_dest_ip ? String(match_dest_ip) : null,
     match_dest_port ? parseInt(match_dest_port, 10) || null : null,
    ]
  );
  if (existing.length) return res.status(409).json({ error: 'A rule with identical match conditions already exists.' });
  const { rows } = await req.db.query(
    `INSERT INTO detection_rules
      (user_id, name, description, enabled, severity, action,
       match_event_id, match_category, match_severity, match_username,
       match_host, match_message, match_process, match_src_ip, match_dest_ip, match_dest_port,
       attack_techniques)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
     techniques,
    ]
  );
  audit(uid(req), 'rule.create', { name: rows[0].name, action: ruleAction, severity: ruleSev }, req.ip);
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
  // attack_techniques is an array field, validated against the known set before storing.
  if ('attack_techniques' in req.body) {
    const techniques = Array.isArray(req.body.attack_techniques)
      ? validateTechniqueIds(req.body.attack_techniques.map(String)).valid.slice(0, 50)
      : [];
    params.push(techniques);
    updates.push(`attack_techniques = $${params.length}`);
  }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  updates.push(`updated_at = NOW()`);
  const { rows } = await req.db.query(
    `UPDATE detection_rules SET ${updates.join(', ')}
     WHERE user_id = $1 AND id = $2 RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  // Distinguish toggle (enabled only) from full edit
  const isToggle = Object.keys(req.body).length === 1 && 'enabled' in req.body;
  if (isToggle) {
    audit(uid(req), 'rule.toggle', { id, name: rows[0].name, enabled: rows[0].enabled }, req.ip);
  } else {
    audit(uid(req), 'rule.update', { id, name: rows[0].name }, req.ip);
  }
  res.json(rows[0]);
}));

router.delete('/rules/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows: ruleRows } = await req.db.query('SELECT name FROM detection_rules WHERE user_id = $1 AND id = $2', [uid(req), id]);
  await req.db.query('DELETE FROM alerts WHERE user_id = $1 AND rule_id = $2', [uid(req), id]);
  await req.db.query('DELETE FROM detection_rules WHERE user_id = $1 AND id = $2', [uid(req), id]);
  audit(uid(req), 'rule.delete', { id, name: ruleRows[0]?.name }, req.ip);
  res.json({ ok: true });
}));


router.get('/rules/export', wrap(async (req, res) => {
  const { rows } = await req.db.query(
    `SELECT name, description, enabled, severity, action,
            match_event_id, match_category, match_severity, match_username,
            match_host, match_message, match_process, match_src_ip, match_dest_ip, match_dest_port
     FROM detection_rules WHERE user_id = $1 ORDER BY created_at ASC`,
    [uid(req)]
  );
  res.setHeader('Content-Disposition', 'attachment; filename="detection-rules.json"');
  res.setHeader('Content-Type', 'application/json');
  res.json(rows);
}));

router.post('/rules/import', ruleImportLimiter, wrap(async (req, res) => {
  // Reject anything that isn't application/json — prevents multipart/file-based attacks
  if (!req.is('application/json')) return res.status(415).json({ error: 'content-type must be application/json' });
  const rules = req.body;
  if (!Array.isArray(rules) || !rules.length) return res.status(400).json({ error: 'expected non-empty array' });
  if (rules.length > 500) return res.status(400).json({ error: 'max 500 rules per import' });

  const validSev = ['critical', 'high', 'medium', 'low', 'info'];
  const validActions = ['alert', 'suppress'];
  const userId = uid(req);
  let imported = 0, skipped = 0;

  for (const rule of rules) {
    if (!rule.name || typeof rule.name !== 'string' || !rule.name.trim()) { skipped++; continue; }
    const name = rule.name.trim().slice(0, 255);
    // Skip duplicates by name
    const { rows: existing } = await req.db.query(
      'SELECT id FROM detection_rules WHERE user_id = $1 AND name = $2', [userId, name]
    );
    if (existing.length) { skipped++; continue; }

    await req.db.query(
      `INSERT INTO detection_rules
        (user_id, name, description, enabled, severity, action,
         match_event_id, match_category, match_severity, match_username,
         match_host, match_message, match_process, match_src_ip, match_dest_ip, match_dest_port)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        userId, name,
        rule.description ? String(rule.description).slice(0, 1000) : null,
        rule.enabled !== false,
        validSev.includes(rule.severity) ? rule.severity : 'high',
        validActions.includes(rule.action) ? rule.action : 'alert',
        rule.match_event_id ? parseInt(rule.match_event_id, 10) || null : null,
        rule.match_category ? String(rule.match_category).slice(0, 64) : null,
        validSev.includes(rule.match_severity) ? rule.match_severity : null,
        rule.match_username ? String(rule.match_username).slice(0, 255) : null,
        rule.match_host ? String(rule.match_host).slice(0, 255) : null,
        rule.match_message ? String(rule.match_message).slice(0, 500) : null,
        rule.match_process ? String(rule.match_process).slice(0, 255) : null,
        rule.match_src_ip ? String(rule.match_src_ip).slice(0, 64) : null,
        rule.match_dest_ip ? String(rule.match_dest_ip).slice(0, 64) : null,
        rule.match_dest_port ? parseInt(rule.match_dest_port, 10) || null : null,
      ]
    );
    imported++;
  }
  audit(uid(req), 'rules.import', { imported, skipped }, req.ip);
  res.json({ imported, skipped });
}));

// Run all enabled rules against last 24 hours of logs (manual trigger)
router.post('/rules/run', wrap(async (req, res) => {
  const { created, deduped } = await runDetectionRules(uid(req), null);
  res.json({ created, deduped });
}));

// ── ALERTS ───────────────────────────────────────────────────────────────────

router.get('/alerts', wrap(async (req, res) => {
  const validStatuses = ['new', 'acknowledged', 'resolved'];
  const status = validStatuses.includes(req.query.status) ? req.query.status : null;
  const params = [uid(req)];
  const conds = ['a.user_id = $1'];
  if (status) { params.push(status); conds.push(`a.status = $${params.length}`); }
  const { rows } = await req.db.query(
    `SELECT a.*, r.name AS rule_name, r.attack_techniques
     FROM alerts a
     LEFT JOIN detection_rules r ON r.id = a.rule_id
     WHERE ${conds.join(' AND ')}
     ORDER BY a.created_at DESC LIMIT 200`,
    params
  );
  res.json(rows);
}));

router.get('/alerts/counts', wrap(async (req, res) => {
  const { rows } = await req.db.query(
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
  const { rows } = await req.db.query(
    `UPDATE alerts SET status = $1, updated_at = NOW()
     WHERE user_id = $2 AND id = $3 RETURNING *`,
    [status, uid(req), id]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  audit(uid(req), 'alert.status_change', { id, status: rows[0].status }, req.ip);
  res.json(rows[0]);
}));

router.post('/alerts/bulk', wrap(async (req, res) => {
  const { ids, action, status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
  const safeIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  if (!safeIds.length) return res.status(400).json({ error: 'no valid ids' });
  const placeholders = safeIds.map((_, i) => `$${i + 2}`).join(', ');
  if (action === 'delete') {
    await req.db.query(`DELETE FROM alerts WHERE user_id = $1 AND id IN (${placeholders})`, [uid(req), ...safeIds]);
    audit(uid(req), 'alerts.bulk_delete', { count: safeIds.length }, req.ip);
  } else if (action === 'status' && STATUS_VALUES.includes(status)) {
    await req.db.query(`UPDATE alerts SET status = $2 WHERE user_id = $1 AND id IN (${placeholders})`, [uid(req), status, ...safeIds]);
    audit(uid(req), 'alerts.bulk_status', { count: safeIds.length, status }, req.ip);
  } else {
    return res.status(400).json({ error: 'invalid action' });
  }
  res.json({ ok: true, count: safeIds.length });
}));

router.delete('/alerts/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  await req.db.query('DELETE FROM alerts WHERE user_id = $1 AND id = $2', [uid(req), id]);
  audit(uid(req), 'alert.delete', { id }, req.ip);
  res.json({ ok: true });
}));

// ── CASES ────────────────────────────────────────────────────────────────────

router.get('/cases', wrap(async (req, res) => {
  const { rows } = await req.db.query(
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
  const { rows } = await req.db.query(
    `INSERT INTO cases (user_id, title, description, severity)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [uid(req), title.trim().slice(0, 255),
     description ? String(description).slice(0, 2000) : null,
     validSev.includes(severity) ? severity : 'medium']
  );
  audit(uid(req), 'case.create', { id: rows[0].id, title: rows[0].title }, req.ip);
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
  const { rows } = await req.db.query(
    `UPDATE cases SET ${updates.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  if ('status' in req.body) {
    audit(uid(req), 'case.status_change', { id, status: rows[0].status }, req.ip);
  } else {
    audit(uid(req), 'case.update', { id, title: rows[0].title }, req.ip);
  }
  res.json(rows[0]);
}));

router.delete('/cases/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  await req.db.query('DELETE FROM cases WHERE user_id = $1 AND id = $2', [uid(req), id]);
  audit(uid(req), 'case.delete', { id }, req.ip);
  res.json({ ok: true });
}));

router.post('/cases/:id/alerts', wrap(async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  const alertId = parseInt(req.body.alert_id, 10);
  if (isNaN(caseId) || isNaN(alertId)) return res.status(400).json({ error: 'invalid ids' });
  // Verify case belongs to user
  const { rows: caseRows } = await req.db.query('SELECT id FROM cases WHERE id = $1 AND user_id = $2', [caseId, uid(req)]);
  if (!caseRows.length) return res.status(404).json({ error: 'case not found' });
  await req.db.query(
    'INSERT INTO case_alerts (case_id, alert_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [caseId, alertId]
  );
  await req.db.query('UPDATE cases SET updated_at = NOW() WHERE id = $1', [caseId]);
  res.json({ ok: true });
}));

router.get('/cases/:id/alerts', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows } = await req.db.query(
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
  const { rows } = await req.db.query(
    'SELECT * FROM user_settings WHERE user_id = $1',
    [uid(req)]
  );
  res.json(rows[0] || { log_retention_days: 90, audit_log_retention_enabled: true, audit_log_retention_days: 365 });
}));

router.patch('/settings', wrap(async (req, res) => {
  const days = parseInt(req.body.log_retention_days, 10);
  if (isNaN(days) || days < 1 || days > 3650) {
    return res.status(400).json({ error: 'log_retention_days must be between 1 and 3650' });
  }

  // Audit log retention fields — optional, only updated if present in body
  let auditEnabled = null;
  let auditDays = null;
  if (req.body.audit_log_retention_enabled !== undefined) {
    auditEnabled = req.body.audit_log_retention_enabled === true || req.body.audit_log_retention_enabled === 'true';
  }
  if (req.body.audit_log_retention_days !== undefined) {
    auditDays = parseInt(req.body.audit_log_retention_days, 10);
    if (isNaN(auditDays) || auditDays < 1 || auditDays > 3650) {
      return res.status(400).json({ error: 'audit_log_retention_days must be between 1 and 3650' });
    }
  }

  const { rows } = await req.db.query(
    `INSERT INTO user_settings (user_id, log_retention_days, audit_log_retention_enabled, audit_log_retention_days)
     VALUES ($1, $2, COALESCE($3, true), COALESCE($4, 365))
     ON CONFLICT (user_id) DO UPDATE SET
       log_retention_days          = $2,
       audit_log_retention_enabled = COALESCE($3, user_settings.audit_log_retention_enabled),
       audit_log_retention_days    = COALESCE($4, user_settings.audit_log_retention_days),
       updated_at                  = NOW()
     RETURNING *`,
    [uid(req), days, auditEnabled, auditDays]
  );
  audit(uid(req), 'settings.update', {
    log_retention_days: rows[0].log_retention_days,
    audit_log_retention_enabled: rows[0].audit_log_retention_enabled,
    audit_log_retention_days: rows[0].audit_log_retention_days,
  }, req.ip);
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

  const { rows } = await req.db.query(
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
  audit(uid(req), 'export.logs', { from: fromStr, to: toStr, count: rows.length }, req.ip);
  res.setHeader('Content-Disposition', `attachment; filename="logs-${fromStr}-to-${toStr}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.json(rows);
}));

// ── Change password (email/password accounts only) ────────────────────────────
router.post('/change-password', wrap(async (req, res) => {
  const sub = uid(req);

  // Only auth0 database connection users can change password
  if (!sub.startsWith('auth0|')) {
    const provider = sub.startsWith('google-oauth2|') ? 'Google'
                   : sub.startsWith('github|') ? 'GitHub'
                   : 'your social provider';
    return res.status(400).json({ error: `Password is managed by ${provider}. Change it there.` });
  }

  const domain      = process.env.AUTH0_DOMAIN;
  const clientId    = process.env.AUTH0_MGMT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;

  // Get M2M token
  const tokenRes = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${process.env.AUTH0_TENANT_DOMAIN}/api/v2/`,
    }),
  });
  if (!tokenRes.ok) return res.status(500).json({ error: 'Failed to obtain management token.' });
  const { access_token } = await tokenRes.json();

  // Look up user's email via Management API
  const userRes = await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(sub)}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) return res.status(500).json({ error: 'Failed to look up user.' });
  const { email } = await userRes.json();

  // Send password change email
  const changeRes = await fetch(`https://${domain}/dbconnections/change_password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.AUTH0_CLIENT_ID,
      email,
      connection: 'Username-Password-Authentication',
    }),
  });
  if (!changeRes.ok) return res.status(500).json({ error: 'Failed to send password reset email.' });

  res.json({ ok: true });
}));

// ── ACCOUNT DELETION (GDPR Art. 17 right to erasure) ─────────────────────────
// Deletes all user data across all tables. Audit log entries are anonymized
// (user_id set to '[deleted]') rather than deleted — required for legal traceability.
// Also deletes the Auth0 user via Management API.
router.delete('/account', wrap(async (req, res) => {
  const userId = uid(req);
  const domain       = process.env.AUTH0_DOMAIN;
  const clientId     = process.env.AUTH0_MGMT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Account deletion is not configured on this server.' });
  }

  // Write a final audit entry before anonymizing
  await audit(userId, 'account.delete', { initiated_by: userId }, req.ip);

  // Delete all user data in dependency order. Runs on the ops (BYPASSRLS) pool:
  // deletes are explicitly WHERE user_id = $1 scoped, and the audit_log
  // anonymization both re-writes user_id (would fail a strict RLS WITH CHECK)
  // and must bypass the append-only trigger. Same role the retention cron uses.
  const client = await pool.getOpsPool().connect();
  try {
    await client.query('BEGIN');

    // case_alerts cascade-deletes when alerts or cases are deleted
    await client.query('DELETE FROM alerts WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM cases WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM detection_rules WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM logs WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM ingest_sources WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM user_ingest_keys WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);

    // Anonymize audit log — retain entries for legal traceability, remove PII
    await client.query(
      `UPDATE audit_log SET user_id = '[deleted]', ip = NULL WHERE user_id = $1`,
      [userId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Delete Auth0 user via Management API
  try {
    const tokenRes = await fetch(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        audience: `https://${domain}/api/v2/`,
      }),
    });
    if (tokenRes.ok) {
      const { access_token } = await tokenRes.json();
      await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${access_token}` },
      });
    }
  } catch {
    // Auth0 deletion failure is non-fatal — local data already deleted
    console.error(`[account.delete] Auth0 deletion failed for ${userId}`);
  }

  res.json({ ok: true });
}));

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────
router.get('/audit-log', wrap(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const validActions = Object.keys({
    'ingest_key.create': 1, 'ingest_key.rotate': 1, 'ingest_key.revoke': 1,
    'rule.create': 1, 'rule.delete': 1, 'rules.import': 1,
    'alerts.bulk_delete': 1, 'alerts.bulk_status': 1, 'case.create': 1, 'case.delete': 1,
  });
  const action = validActions.includes(req.query.action) ? req.query.action : null;

  const params = [uid(req), limit];
  const conds = ['user_id = $1'];
  if (action) { params.splice(2, 0, action); conds.push(`action = $2`); params[params.length - 1] = limit; }

  // Build query safely
  const whereAction = action ? `AND action = $2` : '';
  const limitParam = action ? '$3' : '$2';
  const { rows } = await req.db.query(
    `SELECT id, action, meta, ip, created_at
     FROM audit_log
     WHERE user_id = $1 ${whereAction}
     ORDER BY created_at DESC
     LIMIT ${limitParam}`,
    action ? [uid(req), action, limit] : [uid(req), limit]
  );
  res.json(rows);
}));

// ── Phase 5: Real-time LLM analysis ──────────────────────────────────────────

// GET /siem/realtime/alerts?since=<alert_id>
// Returns new alerts updated in the last 5 minutes that haven't been analyzed yet.
// Uses last_seen instead of id so deduplicated alerts (count++) still get picked up.
// Used by Electron llmWorker after receiving new_alerts WS broadcast.
router.get('/realtime/alerts', wrap(async (req, res) => {
  const sinceId = parseInt(req.query.since, 10);
  if (isNaN(sinceId) || sinceId < 0) return res.status(400).json({ error: 'since must be a non-negative integer' });
  const userId = uid(req);
  const { rows } = await req.db.query(
    `SELECT a.id AS alert_id, a.title, a.severity, a.rule_id,
            l.id AS log_id, l.event_id, l.event_category, l.host, l.source,
            l.process_name, l.process_id, l.username, l.source_ip, l.dest_ip,
            l.dest_port, l.message, l.timestamp
     FROM alerts a
     JOIN logs l ON l.id = a.log_id
     WHERE a.user_id = $1
       AND a.status = 'new'
       AND a.last_seen > NOW() - INTERVAL '5 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM realtime_analysis ra
         WHERE ra.log_id = l.id AND ra.user_id = $1
       )
     ORDER BY a.last_seen ASC
     LIMIT 20`,
    [userId]
  );
  res.json(rows);
}));

// POST /siem/realtime/result
// Called by Electron after LLM analysis of a single event.
// Stores the result and broadcasts to all WS clients.
router.post('/realtime/result', wrap(async (req, res) => {
  const { signal_type, explanation, cve_safe, cve_note } = req.body || {};
  const log_id = Number(req.body?.log_id);
  const userId = uid(req);

  const VALID_SIGNALS = ['critical', 'conflict', 'noise'];
  if (!Number.isInteger(log_id) || log_id <= 0) return res.status(400).json({ error: 'log_id must be a positive integer' });
  if (!VALID_SIGNALS.includes(signal_type)) return res.status(400).json({ error: 'invalid signal_type' });

  // Verify log belongs to this user
  const { rows: logRows } = await req.db.query('SELECT id FROM logs WHERE id = $1 AND user_id = $2', [log_id, userId]);
  if (!logRows.length) return res.status(404).json({ error: 'log not found' });

  // Upsert — overwrite if already analyzed (re-analysis should update the result)
  await req.db.query(
    `INSERT INTO realtime_analysis (user_id, log_id, signal_type, explanation, cve_safe, cve_note)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, log_id) DO UPDATE SET
       signal_type = EXCLUDED.signal_type,
       explanation = EXCLUDED.explanation,
       cve_safe    = EXCLUDED.cve_safe,
       cve_note    = EXCLUDED.cve_note,
       analyzed_at = NOW()`,
    [userId, log_id, signal_type, explanation || null, cve_safe ?? null, cve_note || null]
  );

  broadcast('realtime_analysis', { user_id: userId, log_id, signal_type });
  res.json({ ok: true });
}));

// GET /siem/realtime/results
// Returns the last 50 realtime_analysis rows for the dashboard panel, joined with log data.
router.get('/realtime/results', wrap(async (req, res) => {
  const userId = uid(req);
  const { rows } = await req.db.query(
    `SELECT ra.id, ra.log_id, ra.signal_type, ra.explanation, ra.cve_safe, ra.cve_note, ra.analyzed_at,
            l.event_id, l.severity, l.host, l.process_name, l.username, l.message, l.timestamp
     FROM realtime_analysis ra
     JOIN logs l ON l.id = ra.log_id
     WHERE ra.user_id = $1
     ORDER BY ra.analyzed_at DESC
     LIMIT 50`,
    [userId]
  );
  res.json(rows);
}));

export default router;
