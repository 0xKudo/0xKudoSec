import { createRequire } from 'module';
import { join } from 'path';
import pg from 'pg';

const require = createRequire(import.meta.url);

let _pool = null;
let _sqlite = null;

function getSqlitePath() {
  return process.env.SQLITE_PATH || join(
    process.env.APPDATA || process.env.HOME || '.',
    '0xKudo', 'siem.db'
  );
}

async function getPool() {
  if (!_pool) {
    _pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

function getSqlite() {
  if (!_sqlite) {
    const Database = require('better-sqlite3');
    const dbPath = getSqlitePath();
    _sqlite = new Database(dbPath);
    _sqlite.pragma('journal_mode = WAL');
    _sqlite.pragma('foreign_keys = ON');
  }
  return _sqlite;
}

function toSqliteSql(sql) {
  return sql
    .replace(/\$\d+/g, '?')        // $1/$2 → ?
    .replace(/\bILIKE\b/gi, 'LIKE') // ILIKE → LIKE (SQLite LIKE is case-insensitive for ASCII)
    .replace(/::text\b/gi, '')       // remove pg type casts
    .replace(/::integer\b/gi, '')
    .replace(/::bigint\b/gi, '');
}

// Unified query interface — returns { rows: [...] } in both modes.
export async function query(sql, params = []) {
  if (process.env.STORAGE_MODE === 'local') {
    const db = getSqlite();
    const sqliteSql = toSqliteSql(sql);
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
      const rows = db.prepare(sqliteSql).all(...params);
      return { rows };
    } else {
      const info = db.prepare(sqliteSql).run(...params);
      return { rows: [], rowCount: info.changes, lastID: info.lastInsertRowid };
    }
  }
  const pool = await getPool();
  return pool.query(sql, params);
}

export async function getClient() {
  if (process.env.STORAGE_MODE === 'local') {
    return {
      query: (sql, params) => query(sql, params),
      release: () => {},
    };
  }
  const pool = await getPool();
  return pool.connect();
}
