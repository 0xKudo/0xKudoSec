// platform/server/services/db.js
import pg from 'pg';
const { Pool } = pg;

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. Check your .env file.');
    }
    const ssl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false;
    console.log(`[db] SSL mode: ${ssl ? 'enabled' : 'disabled'}`);
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });
  }
  return pool;
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
};
