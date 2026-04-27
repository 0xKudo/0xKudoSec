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
  const schema = readFileSync(resolve(__dirname, 'schema.sqlite.sql'), 'utf8');
  db.exec(schema);

  // Add columns that may be missing from databases created before schema updates
  addColumnIfMissing(db, 'detection_rules', 'created_at', "DATETIME DEFAULT (datetime('now'))");
  addColumnIfMissing(db, 'detection_rules', 'updated_at', "DATETIME DEFAULT (datetime('now'))");
  addColumnIfMissing(db, 'alerts', 'created_at', "DATETIME DEFAULT (datetime('now'))");
  addColumnIfMissing(db, 'alerts', 'updated_at', "DATETIME DEFAULT (datetime('now'))");
  addColumnIfMissing(db, 'cases', 'created_at', "DATETIME DEFAULT (datetime('now'))");
  addColumnIfMissing(db, 'cases', 'updated_at', "DATETIME DEFAULT (datetime('now'))");
  addColumnIfMissing(db, 'noise_candidates', 'created_at', "DATETIME DEFAULT (datetime('now'))");
  addColumnIfMissing(db, 'noise_candidates', 'updated_at', "DATETIME DEFAULT (datetime('now'))");

  db.close();
}
