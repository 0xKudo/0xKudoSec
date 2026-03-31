// platform/server/routes/siem.js
import { Router } from 'express';
import pool from '../services/db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

function hoursParam(req) {
  const h = parseInt(req.query.hours, 10);
  return (!isNaN(h) && h > 0 && h <= 168) ? h : 24;
}

router.get('/stats', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE severity = 'critical')    AS critical,
      COUNT(*) FILTER (WHERE severity = 'high')        AS high,
      COUNT(*) FILTER (WHERE event_id = 4625)          AS failed_logins
     FROM logs
     WHERE timestamp > NOW() - INTERVAL '${hours} hours'`
  );
  res.json(rows[0]);
});

router.get('/events/recent', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, timestamp, severity, event_id, event_category, message, host, username, source
     FROM logs ORDER BY timestamp DESC LIMIT 50`
  );
  res.json(rows);
});

router.get('/events/by-severity', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT severity, COUNT(*) AS count
     FROM logs
     WHERE timestamp > NOW() - INTERVAL '${hours} hours'
     GROUP BY severity ORDER BY count DESC`
  );
  res.json(rows);
});

router.get('/events/by-source', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT host, COUNT(*) AS count
     FROM logs
     WHERE timestamp > NOW() - INTERVAL '${hours} hours'
     GROUP BY host ORDER BY count DESC LIMIT 10`
  );
  res.json(rows);
});

router.get('/events/top-event-ids', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT event_id, COUNT(*) AS count
     FROM logs
     WHERE timestamp > NOW() - INTERVAL '${hours} hours'
       AND event_id IS NOT NULL
     GROUP BY event_id ORDER BY count DESC LIMIT 10`
  );
  res.json(rows);
});

router.get('/events/top-usernames', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT username, COUNT(*) AS count
     FROM logs
     WHERE timestamp > NOW() - INTERVAL '${hours} hours'
       AND username IS NOT NULL
     GROUP BY username ORDER BY count DESC LIMIT 10`
  );
  res.json(rows);
});

router.get('/events/top-dest-ports', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT dest_port, COUNT(*) AS count
     FROM logs
     WHERE timestamp > NOW() - INTERVAL '${hours} hours'
       AND dest_port IS NOT NULL
     GROUP BY dest_port ORDER BY count DESC LIMIT 10`
  );
  res.json(rows);
});

router.get('/events/top-processes', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT process_name, COUNT(*) AS count
     FROM logs
     WHERE timestamp > NOW() - INTERVAL '${hours} hours'
       AND process_name IS NOT NULL
     GROUP BY process_name ORDER BY count DESC LIMIT 10`
  );
  res.json(rows);
});

router.get('/events/top-dest-ips', async (req, res) => {
  const hours = hoursParam(req);
  const { rows } = await pool.query(
    `SELECT dest_ip, COUNT(*) AS count
     FROM logs
     WHERE timestamp > NOW() - INTERVAL '${hours} hours'
       AND dest_ip IS NOT NULL
     GROUP BY dest_ip ORDER BY count DESC LIMIT 10`
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
     WHERE timestamp > NOW() - INTERVAL '${hours} hours'
     GROUP BY hour, severity
     ORDER BY hour ASC`
  );
  res.json(rows);
});

router.get('/sources', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM ingest_sources ORDER BY last_seen DESC`
  );
  res.json(rows);
});

export default router;
