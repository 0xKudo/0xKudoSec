// platform/server/services/db.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool;
let ingestAuthPool;
let opsPool;

function getSsl() {
  if (process.env.NODE_ENV !== 'production') return false;
  const caPath = path.resolve(__dirname, '../certs/pg-ca.crt');
  if (fs.existsSync(caPath)) {
    console.log('[db] SSL mode: enabled (CA-verified)');
    return { rejectUnauthorized: true, ca: fs.readFileSync(caPath).toString() };
  }
  // Fallback if cert file missing — encrypted but unverified
  console.warn('[db] SSL mode: enabled (self-signed fallback — pg-ca.crt not found)');
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

// Dedicated pool for ingest key lookups — uses a role with BYPASSRLS so
// requireIngestKey can look up keys cross-user before the user_id is known.
// The cybertools role has NOBYPASSRLS; only ingest_auth bypasses RLS.
function getIngestAuthPool() {
  if (!ingestAuthPool) {
    const connStr = process.env.INGEST_AUTH_DB_URL || process.env.DATABASE_URL;
    const ssl = getSsl();
    ingestAuthPool = new Pool({ connectionString: connStr, ssl });
    if (!process.env.INGEST_AUTH_DB_URL) {
      console.warn('[db] INGEST_AUTH_DB_URL not set — ingest key lookups falling back to main pool (RLS bypass still required on that role)');
    }
  }
  return ingestAuthPool;
}

// Dedicated pool for privileged maintenance operations (audit_log DELETE/UPDATE).
// Uses cybertools_ops role which is a member of cybertools_ops and bypasses the
// append-only trigger. Used by retention cron and GDPR account deletion only.
function getOpsPool() {
  if (!opsPool) {
    const connStr = process.env.OPS_DB_URL || process.env.DATABASE_URL;
    const ssl = getSsl();
    opsPool = new Pool({ connectionString: connStr, ssl });
    if (!process.env.OPS_DB_URL) {
      console.warn('[db] OPS_DB_URL not set — ops queries falling back to main pool (audit_log trigger will block DELETE/UPDATE)');
    }
  }
  return opsPool;
}

// Run queries with RLS user context set for the duration of the transaction.
// Usage:
//   const result = await db.withUser(userId, async (client) => {
//     return client.query('SELECT * FROM logs');
//   });
async function withUser(userId, fn) {
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
  query: (...args) => getPool().query(...args),
  withUser,
  getPool,
  getIngestAuthPool,
  getOpsPool,
};
