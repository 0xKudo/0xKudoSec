import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

export function migrateLocal(dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  const schema = readFileSync(resolve(__dirname, 'schema.sqlite.sql'), 'utf8');
  db.exec(schema);
  db.close();
}
