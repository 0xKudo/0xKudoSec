/**
 * Loads db/schema.sql into the database at DATABASE_URL.
 * Uses the `pg` driver (no local psql required) — cross-platform.
 *
 *   npm run db:schema
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set (check your .env).');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
// Strip psql-only meta-commands (pg_dump 16 emits \restrict / \unrestrict);
// they're not valid SQL and the pg driver would choke on them.
const sql = readFileSync(join(here, 'schema.sql'), 'utf8')
  .split('\n')
  .filter(line => !line.startsWith('\\'))
  .join('\n');

if (!/create\s+table/i.test(sql)) {
  console.error('db/schema.sql has no CREATE TABLE statements — it is still the placeholder.');
  console.error('Export the real schema from the VPS first:  pg_dump --schema-only --no-owner --no-privileges cybertools > schema.sql');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(sql);
  console.log('Schema applied to', process.env.DATABASE_URL.replace(/:[^:@/]+@/, ':****@'));
} catch (e) {
  console.error('Schema load failed:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
