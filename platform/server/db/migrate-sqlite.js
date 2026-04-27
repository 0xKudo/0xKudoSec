import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

function addColumnIfMissing(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function migrateLocal(dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);

  // Run column additions BEFORE schema exec so indexes referencing new columns don't fail
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);

  if (tables.includes('detection_rules')) {
    addColumnIfMissing(db, 'detection_rules', 'created_at', "DATETIME DEFAULT (datetime('now'))");
    addColumnIfMissing(db, 'detection_rules', 'updated_at', "DATETIME DEFAULT (datetime('now'))");
  }
  if (tables.includes('alerts')) {
    addColumnIfMissing(db, 'alerts', 'created_at', "DATETIME DEFAULT (datetime('now'))");
    addColumnIfMissing(db, 'alerts', 'updated_at', "DATETIME DEFAULT (datetime('now'))");
  }
  if (tables.includes('cases')) {
    addColumnIfMissing(db, 'cases', 'created_at', "DATETIME DEFAULT (datetime('now'))");
    addColumnIfMissing(db, 'cases', 'updated_at', "DATETIME DEFAULT (datetime('now'))");
  }
  if (tables.includes('noise_candidates')) {
    addColumnIfMissing(db, 'noise_candidates', 'created_at', "DATETIME DEFAULT (datetime('now'))");
    addColumnIfMissing(db, 'noise_candidates', 'updated_at', "DATETIME DEFAULT (datetime('now'))");
  }
  if (tables.includes('realtime_analysis')) {
    addColumnIfMissing(db, 'realtime_analysis', 'created_at', "DATETIME DEFAULT (datetime('now'))");
  }
  if (tables.includes('audit_log')) {
    addColumnIfMissing(db, 'audit_log', 'created_at', "DATETIME DEFAULT (datetime('now'))");
  }

  const schema = readFileSync(resolve(__dirname, 'schema.sqlite.sql'), 'utf8');
  db.exec(schema);

  db.close();
}
