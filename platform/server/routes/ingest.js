// platform/server/routes/ingest.js
import { Router } from 'express';
import pool from '../services/db.js';
import { normalizeEvent } from '../services/ingest/normalizeEvent.js';

const router = Router();

function requireIngestKey(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || token !== process.env.INGEST_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.post('/beats', requireIngestKey, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Request body must be a JSON object or array' });
  }

  const events = Array.isArray(body) ? body : [body];
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
          file_path, registry_key, raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16,$17,$18,$19,$20,$21
        )`,
        [
          e.source, e.host, e.source_ip, e.dest_ip, e.dest_port, e.protocol,
          e.timestamp, e.level, e.severity, e.event_id, e.event_category,
          e.message, e.username, e.domain, e.logon_type,
          e.process_name, e.process_id, e.parent_process_name,
          e.file_path, e.registry_key, JSON.stringify(e.raw),
        ]
      );

      // Upsert ingest_sources
      await pool.query(
        `INSERT INTO ingest_sources (name, type, last_seen, event_count)
         VALUES ($1, $2, NOW(), 1)
         ON CONFLICT (name) DO UPDATE
         SET last_seen = NOW(), event_count = ingest_sources.event_count + 1`,
        [e.host || e.source, e.source]
      );

      accepted++;
    } catch (err) {
      console.error('Failed to insert event:', err.message, raw?.['@timestamp']);
    }
  }

  res.json({ accepted });
});

export default router;
