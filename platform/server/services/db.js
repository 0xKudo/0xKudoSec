// platform/server/services/db.js
import pg from 'pg';
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Check your .env file.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export default pool;
