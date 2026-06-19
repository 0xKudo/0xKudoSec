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

// Map of PostgreSQL date_trunc() unit -> equivalent SQLite strftime() format.
const DATE_TRUNC_FORMATS = {
  day: '%Y-%m-%d 00:00:00',
  hour: '%Y-%m-%d %H:00:00',
  minute: '%Y-%m-%d %H:%M:00',
};

// Mechanical, parameter-free text substitutions — safe to apply unconditionally.
// Postgres-specific constructs that DO need parameter values (make_interval,
// ANY($N)) are handled separately in sqliteQuery(), since this function only
// ever sees the SQL text, not the bound params.
function toSqliteSql(sql) {
  return sql
    .replace(/\$\d+/g, '?')
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/::text\b/gi, '')
    .replace(/::integer\b/gi, '')
    .replace(/::bigint\b/gi, '')
    .replace(/::numeric\b/gi, '')
    .replace(/::jsonb\b/gi, '')
    .replace(/::timestamptz\b/gi, '')
    .replace(/\bNOW\(\)/gi, "datetime('now')")
    // Literal interval, e.g. INTERVAL '7 days' -> '-7 days' (for use as a
    // datetime() modifier — these always appear as NOW() - INTERVAL '...'
    // in this codebase, so negating here matches that usage).
    .replace(/INTERVAL\s+'(-?\d+)\s+(day|days|hour|hours|minute|minutes)'/gi, (_m, n, unit) => `'-${n} ${unit}'`)
    // date_trunc('day'|'hour'|'minute', col) -> strftime(<format>, col)
    .replace(/date_trunc\(\s*'(day|hour|minute)'\s*,\s*([^)]+)\)/gi, (_m, unit, col) => `strftime('${DATE_TRUNC_FORMATS[unit.toLowerCase()]}', ${col.trim()})`)
    // EXTRACT(EPOCH FROM (NOW() - MIN(col))) / 86400 -> day count via julianday
    // (julianday() already returns a day-count, so no /86400 needed — strip
    // it). The inner expr commonly contains its own nested parens (e.g.
    // MIN(timestamp)) — match up to one level of nesting explicitly, since
    // plain [^)]+ stops at the first inner ")" and breaks the match.
    .replace(/EXTRACT\(EPOCH FROM \(datetime\('now'\)\s*-\s*((?:[^()]|\([^()]*\))+)\)\)\s*\/\s*86400/gi, (_m, expr) => `(julianday('now') - julianday(${expr.trim()}))`)
    // EXTRACT(EPOCH FROM col) % 3600 (noiseCron.js time-of-day stddev calc) —
    // same nested-paren allowance, and must run after the more specific
    // pattern above so that one gets first refusal on the same EXTRACT(...) text.
    .replace(/EXTRACT\(EPOCH FROM ((?:[^()]|\([^()]*\))+)\)/gi, (_m, col) => `(julianday(${col.trim()}) * 86400.0)`);
}

// Rewrites Postgres-only constructs that need access to the actual bound
// parameter values, not just the SQL text — make_interval(hours/days := $N)
// and l.col = ANY($N). Returns the rewritten SQL and a possibly-expanded
// params array (ANY($N) explodes one array param into N scalar placeholders).
function rewriteParamDependentSql(sql, params) {
  let sqliteSql = sql;
  let sqliteParams = params;

  // make_interval(hours := $N) / make_interval(days := $N), with NOW() +/- on
  // either side. $N stays a bound param — datetime()'s modifier argument
  // accepts a computed string built via concatenation at call time.
  sqliteSql = sqliteSql.replace(
    /NOW\(\)\s*([+-])\s*make_interval\(\s*(hours|days)\s*:=\s*\$(\d+)\s*\)/gi,
    (_m, sign, unit, idx) => `datetime('now', '${sign === '-' ? '-' : '+'}' || $${idx} || ' ${unit}')`
  );

  // ($N || ' hours')::INTERVAL form (a second, distinct way the codebase
  // builds a parameterized interval — siem.js's /alerts/hourly query uses
  // this instead of make_interval()). Same NOW() +/- prefix handling.
  sqliteSql = sqliteSql.replace(
    /NOW\(\)\s*([+-])\s*\(\$(\d+)\s*\|\|\s*'\s*(hours|days|minutes)\s*'\)::INTERVAL/gi,
    (_m, sign, idx, unit) => `datetime('now', '${sign === '-' ? '-' : '+'}' || $${idx} || ' ${unit}')`
  );

  // l.id = ANY($N) -> l.id IN (?,?,...) — expand the bound array param into
  // one scalar placeholder per element, splicing the params array to match.
  const anyMatch = sqliteSql.match(/(\w+(?:\.\w+)?)\s*=\s*ANY\(\$(\d+)\)/i);
  if (anyMatch) {
    const [full, col, idxStr] = anyMatch;
    const idx = parseInt(idxStr, 10) - 1; // $N is 1-indexed -> 0-indexed array position
    const arrVal = sqliteParams[idx];
    const arr = Array.isArray(arrVal) ? arrVal : [arrVal];
    const shift = arr.length - 1; // net params added by exploding 1 array param into N scalars

    // Renumber every $N strictly after the ANY(...) one FIRST, before touching
    // the ANY(...) text itself — otherwise the new $(idx+1+i) placeholders
    // just inserted below would themselves get caught by this same renumbering.
    if (shift !== 0) {
      sqliteSql = sqliteSql.replace(/\$(\d+)/g, (_m, n) => {
        const num = parseInt(n, 10);
        return num > idx + 1 ? `$${num + shift}` : `$${num}`;
      });
    }
    const newPlaceholders = arr.map((_, i) => `$${idx + 1 + i}`).join(',');
    sqliteSql = sqliteSql.replace(full, `${col} IN (${newPlaceholders})`);
    sqliteParams = [...sqliteParams.slice(0, idx), ...arr, ...sqliteParams.slice(idx + 1)];
  }

  // PostgreSQL allows referencing the same $N multiple times in one query
  // (e.g. user_ingest_keys' INSERT reuses $3 for both the expiry_days column
  // and inside make_interval(days := $3)). SQLite's positional (unnumbered)
  // ? placeholders need one value per textual occurrence, not per unique
  // index — expand sqliteParams to match every occurrence, in the order they
  // appear in the final SQL text, so positional binding lines up correctly.
  const allRefs = [...sqliteSql.matchAll(/\$(\d+)/g)].map(m => parseInt(m[1], 10));
  const uniqueIndices = new Set(allRefs);
  if (allRefs.length > uniqueIndices.size) {
    sqliteParams = allRefs.map(n => sqliteParams[n - 1]);
  }

  return { sqliteSql, sqliteParams };
}

// Convert $1/$2 PostgreSQL params to ? for SQLite and run the query.
// Returns { rows, rowCount, lastID } to match the pg Pool interface.
function sqliteQuery(sql, params = []) {
  const db = getSqlite();
  const { sqliteSql: rewrittenSql, sqliteParams } = rewriteParamDependentSql(sql, params);
  const sqliteSql = toSqliteSql(rewrittenSql);
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
    const rows = db.prepare(sqliteSql).all(...sqliteParams);
    return { rows };
  }
  const info = db.prepare(sqliteSql).run(...sqliteParams);
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
