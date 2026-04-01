// platform/server/routes/ingest.js
import { Router } from 'express';
import multer from 'multer';
import pool from '../services/db.js';
import { normalizeEvent } from '../services/ingest/normalizeEvent.js';
import { broadcast } from '../services/wsBroadcast.js';
import { requireAuth } from '../middleware/requireAuth.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter(req, file, cb) {
    const ok = /\.(json|ndjson|jsonl)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .json, .ndjson, and .jsonl files are accepted'), ok);
  },
});

const router = Router();

async function requireIngestKey(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Check user_ingest_keys table first, fall back to env key for backwards compat
  try {
    const { rows } = await pool.query(
      'SELECT user_id FROM user_ingest_keys WHERE api_key = $1', [token]
    );
    if (rows.length) {
      req.ingestUserId = rows[0].user_id;
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

router.post('/beats', requireIngestKey, async (req, res) => {
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
  for (const raw of events) {
    try {
      const e = normalizeEvent(raw);
      await pool.query(
        `INSERT INTO logs (
          source, host, source_ip, dest_ip, dest_port, protocol,
          timestamp, level, severity, event_id, event_category,
          message, username, domain, logon_type,
          process_name, process_id, parent_process_name,
          file_path, registry_key, raw, user_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
        )`,
        [
          e.source, e.host, e.source_ip, e.dest_ip, e.dest_port, e.protocol,
          e.timestamp, e.level, e.severity, e.event_id, e.event_category,
          e.message, e.username, e.domain, e.logon_type,
          e.process_name, e.process_id, e.parent_process_name,
          e.file_path, e.registry_key, JSON.stringify(e.raw), userId,
        ]
      );
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
    res.json({ accepted, total: events.length });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON in file' });
    next(err);
  }
});

export default router;
