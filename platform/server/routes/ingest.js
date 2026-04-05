// platform/server/routes/ingest.js
import { Router } from 'express';
import { createHash } from 'crypto';
import multer from 'multer';
import pool from '../services/db.js';
import { normalizeEvent } from '../services/ingest/normalizeEvent.js';
import { broadcast } from '../services/wsBroadcast.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { runDetectionRules } from '../services/detection.js';
import { audit } from '../services/audit.js';
import { ingestBeatsLimiter } from '../middleware/rateLimiter.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter(req, file, cb) {
    const ok = /\.(json|ndjson|jsonl)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .json, .ndjson, and .jsonl files are accepted'), ok);
  },
});

const router = Router();

function hashKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

async function requireIngestKey(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Hash the incoming token and compare against stored hashes
  try {
    const { rows } = await pool.query(
      'SELECT user_id, expires_at FROM user_ingest_keys WHERE api_key = $1', [hashKey(token)]
    );
    if (rows.length) {
      // Check expiry
      if (rows[0].expires_at && new Date(rows[0].expires_at) < new Date()) {
        return res.status(401).json({ error: 'Ingest key expired. Rotate your key in Configuration.' });
      }
      req.ingestUserId = rows[0].user_id;
      // Update last_used_at — fire and forget, never block ingest
      // Update by api_key hash (already in scope) to bypass RLS
      pool.query(
        'UPDATE user_ingest_keys SET last_used_at = NOW() WHERE api_key = $1',
        [hashKey(token)]
      ).catch(() => {});
      return next();
    }
  } catch {}

  // Fallback: env key (dev only) — no user scoping
  if (token === process.env.INGEST_API_KEY) {
    req.ingestUserId = null;
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

router.post('/beats', ingestBeatsLimiter, requireIngestKey, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Request body must be a JSON object or array' });
  }

  const events = Array.isArray(body) ? body : [body];
  const accepted = await insertEvents(events, req.ingestUserId);
  if (accepted > 0) broadcast('new_events', { count: accepted });
  res.json({ accepted });
});

async function insertEvents(events, userId) {
  let accepted = 0;
  const insertedIds = [];
  for (const raw of events) {
    try {
      const e = normalizeEvent(raw);
      const { rows } = await pool.query(
        `INSERT INTO logs (
          source, host, source_ip, dest_ip, dest_port, protocol,
          timestamp, level, severity, event_id, event_category,
          message, username, domain, logon_type,
          process_name, process_id, process_guid,
          parent_process_name, parent_process_id, parent_process_guid,
          file_path, registry_key, raw, user_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
        ) RETURNING id`,
        [
          e.source, e.host, e.source_ip, e.dest_ip, e.dest_port, e.protocol,
          e.timestamp, e.level, e.severity, e.event_id, e.event_category,
          e.message, e.username, e.domain, e.logon_type,
          e.process_name, e.process_id, e.process_guid || null,
          e.parent_process_name, e.parent_process_id || null, e.parent_process_guid || null,
          e.file_path, e.registry_key, JSON.stringify(e.raw), userId,
        ]
      );
      insertedIds.push(rows[0].id);
      await pool.query(
        `INSERT INTO ingest_sources (name, type, last_seen, event_count, user_id)
         VALUES ($1, $2, NOW(), 1, $3)
         ON CONFLICT (name, user_id) DO UPDATE
         SET last_seen = NOW(), event_count = ingest_sources.event_count + 1`,
        [e.host || e.source, e.source, userId]
      );
      accepted++;
    } catch (err) {
      console.error('Failed to insert event:', err.message);
    }
  }

  // Run detection rules against only the newly inserted log IDs — fire and forget
  if (insertedIds.length && userId) {
    runDetectionRules(userId, insertedIds).then(({ created }) => {
      if (created > 0) broadcast('new_alerts', { count: created });
    }).catch(err => console.error('Detection error:', err.message));
  }

  return accepted;
}

router.post('/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const text = req.file.buffer.toString('utf-8').trim();
    let events = [];

    // Try JSON array first, then NDJSON/JSONL
    if (text.startsWith('[')) {
      events = JSON.parse(text);
      if (!Array.isArray(events)) return res.status(400).json({ error: 'Expected a JSON array' });
    } else {
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (t) events.push(JSON.parse(t));
      }
    }

    if (events.length === 0) return res.status(400).json({ error: 'No events found in file' });
    if (events.length > 100000) return res.status(400).json({ error: 'File exceeds 100,000 event limit' });

    const userId = req.auth.sub;
    const accepted = await insertEvents(events, userId);
    if (accepted > 0) broadcast('new_events', { count: accepted });
    audit(userId, 'ingest.file_upload', { filename: req.file.originalname, total: events.length, accepted }, req.ip);
    res.json({ accepted, total: events.length });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON in file' });
    next(err);
  }
});

export default router;
