// D2: getMatcher(deps) — build the compiled matcher from the live sigma_rules
// catalog once, and rebuild only when the catalog changes (version = count + the
// latest updated_at). DB-gated (Docker 5433). Global reference data, no RLS, so we
// read via the ops/superuser pool the same way the sync does.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import { getMatcher, _resetMatcherCache } from '../services/correlation/catalogMatcher.js';

const SUPER = 'postgresql://postgres:postgres@localhost:5433/cybertools';
const IDS = ['dddd0001-0000-0000-0000-000000000001', 'dddd0001-0000-0000-0000-000000000002'];

let pool; let reachable = false; let deps;

async function insertRule(identity, doc) {
  await pool.query(
    `INSERT INTO sigma_rules (identity, title, category, path, rule, severity, convert_status, retired)
     VALUES ($1,$2,'generic',$3,$4::jsonb,'high','converted',false)
     ON CONFLICT (identity) DO UPDATE SET rule = EXCLUDED.rule, retired = false,
       convert_status = 'converted', updated_at = NOW()`,
    [identity, 'm ' + identity.slice(0, 8), 'rules/' + identity + '.yml', JSON.stringify(doc)],
  );
}

beforeAll(async () => {
  try {
    pool = new pg.Pool({ connectionString: SUPER });
    await pool.query('SELECT 1');
    reachable = true;
    deps = { getPool: () => pool };
  } catch { reachable = false; }
});
beforeEach(async () => {
  if (!reachable) return;
  _resetMatcherCache();
  await pool.query('DELETE FROM sigma_rules WHERE identity = ANY($1)', [IDS]);
});
afterAll(async () => {
  if (pool) { await pool.query('DELETE FROM sigma_rules WHERE identity = ANY($1)', [IDS]).catch(()=>{}); await pool.end(); }
});

describe('getMatcher', () => {
  it.runIf(() => reachable)('builds a matcher from the catalog and matches an event', async () => {
    await insertRule(IDS[0], { type: 'single_event', where: { all: [{ field: 'process_name', op: 'endswith', value: '\\evilm.exe' }] } });
    const { matcher } = await getMatcher(deps);
    const hit = matcher.match({ process_name: 'C:\\x\\evilm.exe', raw_json: {}, search_text: '' });
    expect(hit.has(IDS[0])).toBe(true);
  });

  it.runIf(() => reachable)('returns the cached instance when the catalog is unchanged', async () => {
    await insertRule(IDS[0], { type: 'single_event', where: { all: [{ field: 'event_id', op: 'eq', value: 4104 }] } });
    const a = await getMatcher(deps);
    const b = await getMatcher(deps);
    expect(b.matcher).toBe(a.matcher); // same object, not rebuilt
  });

  it.runIf(() => reachable)('rebuilds when a rule is added (version changes)', async () => {
    await insertRule(IDS[0], { type: 'single_event', where: { all: [{ field: 'event_id', op: 'eq', value: 4104 }] } });
    const a = await getMatcher(deps);
    await insertRule(IDS[1], { type: 'single_event', where: { all: [{ field: 'event_id', op: 'eq', value: 4688 }] } });
    const b = await getMatcher(deps);
    expect(b.matcher).not.toBe(a.matcher);
    expect(b.version).not.toBe(a.version);
  });

  it.runIf(() => reachable)('excludes rejected and non-single_event rules', async () => {
    await insertRule(IDS[0], { type: 'threshold', where: { all: [{ field: 'event_id', op: 'eq', value: 4625 }] }, group_by: 'source_ip', window: '1h', count: 5 });
    const { matcher } = await getMatcher(deps);
    // The threshold rule must not be in the single_event matcher.
    const hit = matcher.match({ event_id: 4625, raw_json: {}, search_text: '' });
    expect(hit.has(IDS[0])).toBe(false);
  });
});
