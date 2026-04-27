// platform/server/services/forwardBuffer.js
// Durable catch-up buffer for VPS forwarding. Writes batches to SQLite so they
// survive a local server restart. Flushed oldest-first when the WS reconnects.
import { createRequire } from 'module';
import { join } from 'path';
import { randomUUID } from 'crypto';

const require = createRequire(import.meta.url);

const MAX_EVENTS = parseInt(process.env.MAX_BUFFER_EVENTS || '50000', 10);

let _db = null;

function getDb() {
  if (_db) return _db;
  const Database = require('better-sqlite3');
  const dbPath = process.env.SQLITE_PATH || join(
    process.env.APPDATA || process.env.HOME || '.',
    '0xKudo', 'siem.db'
  );
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.prepare(`
    CREATE TABLE IF NOT EXISTS forward_buffer (
      id TEXT PRIMARY KEY,
      events TEXT NOT NULL,
      event_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
  return _db;
}

// Returns total buffered event count across all rows.
function totalBufferedEvents() {
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(SUM(event_count), 0) AS total FROM forward_buffer').get();
  return row.total;
}

// Drop oldest batches until total buffered events is under MAX_EVENTS.
function enforceLimit() {
  const db = getDb();
  while (totalBufferedEvents() > MAX_EVENTS) {
    const oldest = db.prepare('SELECT id, event_count FROM forward_buffer ORDER BY created_at ASC LIMIT 1').get();
    if (!oldest) break;
    db.prepare('DELETE FROM forward_buffer WHERE id = ?').run(oldest.id);
    console.warn(`[forward-buffer] limit exceeded — dropped oldest batch (${oldest.event_count} events)`);
  }
}

export function bufferEvents(events) {
  const db = getDb();
  enforceLimit();
  const id = randomUUID();
  db.prepare('INSERT INTO forward_buffer (id, events, event_count) VALUES (?, ?, ?)').run(
    id, JSON.stringify(events), events.length
  );
}

// Flush all buffered batches oldest-first. For each batch, calls wsSend(events)
// which must return a Promise that resolves when the VPS has ACKed the batch.
// Deletes each row after a successful send.
export async function flushBuffer(wsSend) {
  const db = getDb();
  const rows = db.prepare('SELECT id, events FROM forward_buffer ORDER BY created_at ASC').all();
  for (const row of rows) {
    let events;
    try { events = JSON.parse(row.events); } catch {
      db.prepare('DELETE FROM forward_buffer WHERE id = ?').run(row.id);
      continue;
    }
    try {
      await wsSend(events);
      db.prepare('DELETE FROM forward_buffer WHERE id = ?').run(row.id);
    } catch {
      // Stop flushing on send error — will retry on next reconnect
      break;
    }
  }
}

export function bufferSize() {
  return totalBufferedEvents();
}
