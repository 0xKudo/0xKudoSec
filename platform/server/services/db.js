// platform/server/services/db.js
import pg from 'pg';
const { Pool } = pg;

let pool;
let ingestAuthPool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. Check your .env file.');
    }
    // rejectUnauthorized: false — VPS uses a self-signed cert; connection is still encrypted
    const ssl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
    console.log(`[db] SSL mode: ${ssl ? 'enabled (self-signed allowed)' : 'disabled'}`);
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
    const ssl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
    ingestAuthPool = new Pool({ connectionString: connStr, ssl });
    if (!process.env.INGEST_AUTH_DB_URL) {
      console.warn('[db] INGEST_AUTH_DB_URL not set — ingest key lookups falling back to main pool (RLS bypass still required on that role)');
    }
  }
  return ingestAuthPool;
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
};
