import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { query } from '../db/index.js';

const router = Router();

router.use(requireAuth);

function toCSV(rows, columns) {
  if (!rows.length) return columns.join(',') + '\n';
  const header = columns.join(',');
  const lines = rows.map(row =>
    columns.map(col => {
      const val = row[col] ?? '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  );
  return [header, ...lines].join('\n') + '\n';
}

function toJSONL(rows) {
  return rows.map(r => JSON.stringify(r)).join('\n') + '\n';
}

router.get('/logs', async (req, res) => {
  const fmt = req.query.format || 'json';
  const { rows } = await query(
    `SELECT id, timestamp, source_type, source_host, severity, message, raw_event, user_id
     FROM logs ORDER BY timestamp DESC LIMIT 100000`,
    []
  );
  return sendExport(res, rows, fmt, 'logs', ['id','timestamp','source_type','source_host','severity','message','raw_event','user_id']);
});

router.get('/alerts', async (req, res) => {
  const fmt = req.query.format || 'json';
  const { rows } = await query(
    `SELECT id, rule_id, rule_name, severity, status, first_seen, last_seen, hit_count, sample_event, user_id
     FROM alerts ORDER BY last_seen DESC LIMIT 100000`,
    []
  );
  return sendExport(res, rows, fmt, 'alerts', ['id','rule_id','rule_name','severity','status','first_seen','last_seen','hit_count','sample_event','user_id']);
});

router.get('/cases', async (req, res) => {
  const fmt = req.query.format || 'json';
  const { rows } = await query(
    `SELECT id, title, severity, status, created_at, updated_at, description, user_id
     FROM cases ORDER BY created_at DESC LIMIT 100000`,
    []
  );
  return sendExport(res, rows, fmt, 'cases', ['id','title','severity','status','created_at','updated_at','description','user_id']);
});

function sendExport(res, rows, fmt, name, columns) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (fmt === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${ts}.csv"`);
    return res.send(toCSV(rows, columns));
  }
  if (fmt === 'jsonl') {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${ts}.jsonl"`);
    return res.send(toJSONL(rows));
  }
  // default: json
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${ts}.json"`);
  return res.json(rows);
}

export default router;
