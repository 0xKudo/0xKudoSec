// D2/D4 acceptance: SQL-vs-memory parity harness.
//
// For a set of REAL converted Sigma rules and a shared corpus of log rows, the
// in-memory matcher must flag exactly the same (rule, log) pairs the SQL compiler
// does. The base block seeds a handful of representative converted rules + a
// crafted corpus and runs it on every DB-reachable run. The env-gated block
// (SIGMA_MATCHER_PARITY=1) additionally samples the LIVE sigma_rules catalog, so
// the same harness can be pointed at a fully-synced DB before re-enabling the
// catalog. DB-gated (Docker 5433).

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import { compileMatcher } from '../services/correlation/catalogMatcher.js';
import { compileMatch } from '../services/correlation/compile.js';
import { normalizeToWhere } from '../../shared/correlationRule.js';

const SUPER = 'postgresql://postgres:postgres@localhost:5433/cybertools';
const USER = 'test|matcher-parity';
let pool; let reachable = false; let sigmaToRule;

const YAMLS = [
  `title: Mimikatz\nid: 00000000-0000-0000-0000-0000000000a1\nlevel: high\ndetection:\n  sel:\n    Image|endswith: \\mimikatz.exe\n  condition: sel`,
  `title: Encoded PS\nid: 00000000-0000-0000-0000-0000000000a2\nlevel: high\ndetection:\n  sel:\n    CommandLine|contains: -enc \n  condition: sel`,
  `title: IEX keyword\nid: 00000000-0000-0000-0000-0000000000a3\nlevel: medium\ndetection:\n  keywords:\n    - Invoke-Expression\n  condition: keywords`,
  `title: PS EncodedCommand EID\nid: 00000000-0000-0000-0000-0000000000a4\nlevel: high\ndetection:\n  sel:\n    EventID: 4104\n    CommandLine|contains: EncodedCommand\n  condition: sel`,
  `title: Susp tools\nid: 00000000-0000-0000-0000-0000000000a5\nlevel: high\ndetection:\n  sel:\n    Image|endswith:\n      - \\nc.exe\n      - \\ncat.exe\n  condition: sel`,
];

// A corpus that hits and misses each rule.
const LOGS = [
  { event_id: 1, process_name: 'C:\\tools\\mimikatz.exe', message: 'run mimikatz' },
  { event_id: 1, process_name: 'C:\\Windows\\powershell.exe', message: 'powershell -enc ABCD==' },
  { event_id: 1, process_name: 'C:\\Windows\\powershell.exe', message: 'iex (Invoke-Expression) $x' },
  { event_id: 4104, process_name: 'C:\\Windows\\powershell.exe', message: 'ScriptBlock EncodedCommand foo' },
  { event_id: 4104, process_name: 'C:\\Windows\\powershell.exe', message: 'ScriptBlock plain' },
  { event_id: 1, process_name: 'C:\\tools\\ncat.exe', message: 'listener' },
  { event_id: 1, process_name: 'C:\\Windows\\explorer.exe', message: 'nothing to see' },
];

async function insertLogs() {
  const ids = [];
  for (const l of LOGS) {
    const { rows } = await pool.query(
      `INSERT INTO logs (user_id, source, host, event_id, severity, process_name, message, timestamp)
       VALUES ($1,'fluent-bit','h',$2,'info',$3,$4,NOW()) RETURNING id`,
      [USER, l.event_id, l.process_name, l.message],
    );
    ids.push(rows[0].id);
  }
  return ids;
}

beforeAll(async () => {
  try {
    pool = new pg.Pool({ connectionString: SUPER });
    await pool.query('SELECT 1');
    reachable = true;
    ({ sigmaToRule } = await vi.importActual('../services/correlation/sigma.js'));
    await pool.query('DELETE FROM logs WHERE user_id = $1', [USER]);
  } catch { reachable = false; }
});
afterAll(async () => { if (pool) { await pool.query('DELETE FROM logs WHERE user_id = $1', [USER]).catch(()=>{}); await pool.end(); } });

// Run one corpus through both engines and return a list of per-rule mismatches.
async function findMismatches(rules, logIds) {
  // Build the matcher and evaluate the corpus in memory.
  const compiledRules = rules.map((r) => ({ identity: r.identity, where: normalizeToWhere(r.doc) }));
  const matcher = compileMatcher(compiledRules);
  const { rows: corpus } = await pool.query(
    `SELECT * FROM logs WHERE user_id = $1 AND id = ANY($2)`, [USER, logIds],
  );
  const memHits = new Map(); // identity -> Set(logId)
  for (const row of corpus) {
    for (const id of matcher.match(row)) {
      if (!memHits.has(id)) memHits.set(id, new Set());
      memHits.get(id).add(row.id);
    }
  }
  // For each rule, run its compiled SQL over the same corpus and compare id sets.
  const mismatches = [];
  for (const r of rules) {
    const { sql, params } = compileMatch(normalizeToWhere(r.doc), USER, { logIds });
    const { rows } = await pool.query(sql, params);
    const sqlIds = new Set(rows.map((x) => x.id));
    const memIds = memHits.get(r.identity) || new Set();
    const onlySql = [...sqlIds].filter((x) => !memIds.has(x));
    const onlyMem = [...memIds].filter((x) => !sqlIds.has(x));
    if (onlySql.length || onlyMem.length) mismatches.push({ identity: r.identity, onlySql, onlyMem });
  }
  return mismatches;
}

describe('matcher vs SQL parity — representative converted rules', () => {
  it.runIf(() => reachable)('flags identical (rule, log) pairs for both engines', async () => {
    const rules = YAMLS.map((y, i) => {
      const { rule } = sigmaToRule(y);
      return { identity: `parity-${i}`, doc: rule };
    }).filter((r) => r.doc && r.doc.type === 'single_event');
    const logIds = await insertLogs();
    const mismatches = await findMismatches(rules, logIds);
    expect(mismatches, JSON.stringify(mismatches, null, 2)).toEqual([]);
  });
});

// Full-catalog sampling: point the same harness at the live catalog. Skips unless
// SIGMA_MATCHER_PARITY=1 AND the catalog is populated with single_event rules.
describe('matcher vs SQL parity — live catalog sample', () => {
  it.runIf(() => reachable)('samples the live sigma_rules catalog and finds zero mismatches', async () => {
    if (process.env.SIGMA_MATCHER_PARITY !== '1') return; // opt-in; runs only when explicitly requested
    const sampleSize = Number(process.env.SIGMA_MATCHER_SAMPLE || 300);
    const { rows } = await pool.query(
      `SELECT identity, rule FROM sigma_rules
       WHERE convert_status='converted' AND retired=false AND rule IS NOT NULL
         AND rule->>'type'='single_event'
       ORDER BY random() LIMIT $1`, [sampleSize],
    );
    if (!rows.length) { console.warn('[parity] live catalog empty — skipping'); return; }
    const rules = rows.map((r) => ({ identity: r.identity, doc: r.rule }));
    const logIds = await insertLogs(); // reuse the crafted corpus as the shared events
    const mismatches = await findMismatches(rules, logIds);
    if (mismatches.length) console.error('[parity] mismatches:', JSON.stringify(mismatches.slice(0, 10), null, 2));
    expect(mismatches.length).toBe(0);
  }, 120000);
});
