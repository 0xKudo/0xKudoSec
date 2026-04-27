// platform/server/services/db.js
import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;

// ── SQLite adapter (local mode) ───────────────────────────────────────────
// Loaded lazily so the pg dependency is never touched in local mode.
import { createRequire } from 'module';
import { join } from 'path';
const require = createRequire(import.meta.url);

let _sqlite = null;

function getSqlite() {
  if (!_sqlite) {
    const Database = require('better-sqlite3');
    const dbPath = process.env.SQLITE_PATH || join(
      process.env.APPDATA || process.env.HOME || '.',
      '0xKudo', 'siem.db'
    );
    _sqlite = new Database(dbPath);
    _sqlite.pragma('journal_mode = WAL');
    _sqlite.pragma('foreign_keys = ON');
  }
  return _sqlite;
}

function toSqliteSql(sql) {
  return sql
    .replace(/\$\d+/g, '?')
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/::text\b/gi, '')
    .replace(/::integer\b/gi, '')
    .replace(/::bigint\b/gi, '');
}

// Convert $1/$2 PostgreSQL params to ? for SQLite and run the query.
// Returns { rows, rowCount, lastID } to match the pg Pool interface.
function sqliteQuery(sql, params = []) {
  const db = getSqlite();
  const sqliteSql = toSqliteSql(sql);
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
    const rows = db.prepare(sqliteSql).all(...params);
    return { rows };
  }
  const info = db.prepare(sqliteSql).run(...params);
  return { rows: [], rowCount: info.changes, lastID: info.lastInsertRowid };
}

// Fake client for SQLite — matches the pg client interface used in withUser.
function sqliteClient() {
  return {
    query: (sql, params) => sqliteQuery(sql, params),
    release: () => {},
  };
}

// ── PostgreSQL pools ──────────────────────────────────────────────────────
let pool;
let ingestAuthPool;
let opsPool;

function getSsl() {
  if (process.env.NODE_ENV !== 'production') return false;
  const caPath = process.env.DATABASE_CA_CERT;
  if (caPath && fs.existsSync(caPath)) {
    console.log('[db] SSL mode: enabled (CA-verified)');
    return { rejectUnauthorized: true, ca: fs.readFileSync(caPath).toString() };
  }
  console.warn('[db] SSL mode: enabled (self-signed fallback — DATABASE_CA_CERT not set or file not found)');
  return { rejectUnauthorized: false };
}

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. Check your .env file.');
    }
    const ssl = getSsl();
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });
  }
  return pool;
}

function getIngestAuthPool() {
  if (!ingestAuthPool) {
    const connStr = process.env.INGEST_AUTH_DB_URL || process.env.DATABASE_URL;
    const ssl = getSsl();
    ingestAuthPool = new Pool({ connectionString: connStr, ssl });
    if (!process.env.INGEST_AUTH_DB_URL) {
      console.warn('[db] INGEST_AUTH_DB_URL not set — ingest key lookups falling back to main pool');
    }
  }
  return ingestAuthPool;
}

function getOpsPool() {
  if (!opsPool) {
    const connStr = process.env.OPS_DB_URL || process.env.DATABASE_URL;
    const ssl = getSsl();
    opsPool = new Pool({ connectionString: connStr, ssl });
    if (!process.env.OPS_DB_URL) {
      console.warn('[db] OPS_DB_URL not set — ops queries falling back to main pool');
    }
  }
  return opsPool;
}

// ── Unified interface ─────────────────────────────────────────────────────
const isLocal = () => process.env.STORAGE_MODE === 'local';

// withUser: in local mode, SQLite is single-user so no SET LOCAL needed.
async function withUser(userId, fn) {
  if (isLocal()) {
    return fn(sqliteClient());
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.user_id = $1', [userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default {
  query: (sql, params) => isLocal() ? sqliteQuery(sql, params) : getPool().query(sql, params),
  withUser,
  getPool,
  // In local mode, ingest key auth is done via LOCAL_INGEST_KEY_HASH env var in ingest.js —
  // these pool getters should not be called in local mode.
  getIngestAuthPool,
  getOpsPool,
};
