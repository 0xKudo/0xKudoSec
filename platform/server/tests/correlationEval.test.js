// D1: in-memory rule evaluator parity tests.
//
// matchesWhere(node, event) must fire EXACTLY the rows the SQL compiler
// (compile.js) fires. This file locks the per-operator semantics documented in
// docs/plans/2026-09-07-sigma-catalog-phase-d-matcher.md §3. The pure-unit block
// needs no DB; the "SQL parity spot-check" block (runIf reachable) proves the
// trickiest LIKE/backslash/underscore/regex cases agree with Postgres itself.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { matchesWhere } from '../services/correlation/evalRule.js';
import { compileMatch } from '../services/correlation/compile.js';

// Build an event (a logs row shape). raw_json is the parsed jsonb object.
function ev(overrides = {}) {
  return {
    source: 'fluent-bit', host: 'HOST1', source_ip: '10.0.0.5', dest_ip: null,
    dest_port: null, protocol: null, severity: 'info', level: null,
    event_id: 1, event_category: 'process_creation', message: 'the Message Text',
    username: 'Alice', domain: null, logon_type: null,
    process_name: 'C:\\Windows\\System32\\cmd.exe', process_id: 100,
    parent_process_name: 'C:\\Windows\\explorer.exe',
    file_path: null, registry_key: null, timestamp: new Date('2026-09-07T00:00:00Z'),
    search_text: 'the Message Text C:\\Windows\\System32\\cmd.exe',
    raw_json: {},
    ...overrides,
  };
}
describe('matchesWhere — single leaf, first-class columns', () => {
  it('eq is case-sensitive exact (mirrors SQL =)', () => {
    expect(matchesWhere({ field: 'username', op: 'eq', value: 'Alice' }, ev())).toBe(true);
    expect(matchesWhere({ field: 'username', op: 'eq', value: 'alice' }, ev())).toBe(false);
  });

  it('ne negates eq; a NULL column never satisfies ne (SQL NULL <> x is NULL)', () => {
    expect(matchesWhere({ field: 'username', op: 'ne', value: 'Bob' }, ev())).toBe(true);
    expect(matchesWhere({ field: 'file_path', op: 'ne', value: 'x' }, ev())).toBe(false);
  });

  it('contains/startswith/endswith are case-insensitive (ILIKE)', () => {
    expect(matchesWhere({ field: 'message', op: 'contains', value: 'message' }, ev())).toBe(true);
    expect(matchesWhere({ field: 'process_name', op: 'endswith', value: '\\CMD.EXE' }, ev())).toBe(true);
    // A literal backslash in a LIKE value must be escaped as '\\' (Postgres default
    // ESCAPE), so 'C:\\\\Windows' here is one literal backslash; 'c:\\windows' would
    // instead drop the backslash (\w -> literal w) and NOT match, mirroring SQL.
    expect(matchesWhere({ field: 'process_name', op: 'startswith', value: 'C:\\\\Windows' }, ev())).toBe(true);
    expect(matchesWhere({ field: 'process_name', op: 'startswith', value: 'c:\\windows' }, ev())).toBe(false);
    expect(matchesWhere({ field: 'message', op: 'contains', value: 'absent' }, ev())).toBe(false);
  });

  it('_cs variants are case-sensitive (LIKE)', () => {
    expect(matchesWhere({ field: 'message', op: 'contains_cs', value: 'Message' }, ev())).toBe(true);
    expect(matchesWhere({ field: 'message', op: 'contains_cs', value: 'message' }, ev())).toBe(false);
  });

  it('LIKE metacharacters in the value act as wildcards, mirroring the compiler', () => {
    // '_' matches any single char; the compiler wraps the raw value, so this is the
    // real (if surprising) SQL behavior the evaluator must reproduce.
    expect(matchesWhere({ field: 'host', op: 'eq', value: 'HOST1' }, ev())).toBe(true);
    expect(matchesWhere({ field: 'message', op: 'contains', value: 'Mess_ge' }, ev())).toBe(true);  // _ = a
    expect(matchesWhere({ field: 'message', op: 'contains', value: 'M%e' }, ev())).toBe(true);      // % = ssag
    expect(matchesWhere({ field: 'message', op: 'endswith', value: 'Te_t' }, ev())).toBe(true);     // _ = x
  });

  it('a backslash in a LIKE value escapes the next char (Postgres default escape)', () => {
    // '\_' matches a literal underscore, not any char.
    expect(matchesWhere({ field: 'message', op: 'contains', value: 'Mess\\_ge' }, ev())).toBe(false); // literal _
    expect(matchesWhere({ field: 'message', op: 'contains', value: 'Message' }, ev({ message: 'Mess_ge Message' })).valueOf()).toBe(true);
  });

  it('in is exact membership; integer columns compare numerically', () => {
    expect(matchesWhere({ field: 'event_id', op: 'in', value: [4104, 1, 4688] }, ev())).toBe(true);
    expect(matchesWhere({ field: 'event_id', op: 'in', value: [4104, 4688] }, ev())).toBe(false);
    expect(matchesWhere({ field: 'event_id', op: 'eq', value: 1 }, ev())).toBe(true);
  });

  it('numeric comparisons on integer columns', () => {
    expect(matchesWhere({ field: 'process_id', op: 'gt', value: 50 }, ev())).toBe(true);
    expect(matchesWhere({ field: 'process_id', op: 'lte', value: 100 }, ev())).toBe(true);
    expect(matchesWhere({ field: 'process_id', op: 'lt', value: 100 }, ev())).toBe(false);
  });

  it('re is a case-insensitive regex (~*)', () => {
    expect(matchesWhere({ field: 'process_name', op: 're', value: 'cmd\\.exe$' }, ev())).toBe(true);
    expect(matchesWhere({ field: 'process_name', op: 're', value: 'POWERSHELL' }, ev())).toBe(false);
  });

  it('exists checks NULL / NOT NULL on columns', () => {
    expect(matchesWhere({ field: 'username', op: 'exists', value: true }, ev())).toBe(true);
    expect(matchesWhere({ field: 'file_path', op: 'exists', value: true }, ev())).toBe(false);
    expect(matchesWhere({ field: 'file_path', op: 'exists', value: false }, ev())).toBe(true);
  });

  it('fieldref compares two columns for equality', () => {
    const e = ev({ process_name: 'x', parent_process_name: 'x' });
    expect(matchesWhere({ field: 'process_name', op: 'fieldref', value: 'parent_process_name' }, e)).toBe(true);
    expect(matchesWhere({ field: 'process_name', op: 'fieldref', value: 'parent_process_name' }, ev())).toBe(false);
  });

  it('cidr tests IPv4 membership', () => {
    expect(matchesWhere({ field: 'source_ip', op: 'cidr', value: '10.0.0.0/8' }, ev())).toBe(true);
    expect(matchesWhere({ field: 'source_ip', op: 'cidr', value: '192.168.0.0/16' }, ev())).toBe(false);
    expect(matchesWhere({ field: 'source_ip', op: 'cidr', value: '10.0.0.5/32' }, ev())).toBe(true);
  });
});

describe('matchesWhere — raw fields and keyword', () => {
  it('raw leaf reads raw_json ->> name as text', () => {
    const e = ev({ raw_json: { 'winlog.event_data.TargetObject': 'HKLM\\Software\\Run' } });
    expect(matchesWhere({ raw: 'winlog.event_data.TargetObject', op: 'endswith', value: '\\Run' }, e)).toBe(true);
    expect(matchesWhere({ raw: 'winlog.event_data.TargetObject', op: 'eq', value: 'HKLM\\Software\\Run' }, e)).toBe(true);
  });

  it('raw leaf on an absent key is SQL NULL (no op matches, exists:false does)', () => {
    expect(matchesWhere({ raw: 'not.present', op: 'contains', value: 'x' }, ev())).toBe(false);
    expect(matchesWhere({ raw: 'not.present', op: 'exists', value: true }, ev())).toBe(false);
    expect(matchesWhere({ raw: 'not.present', op: 'exists', value: false }, ev({ raw_json: { other: 1 } })).valueOf()).toBe(true);
  });

  it('raw exists uses the jsonb key-test (present even when the value is null)', () => {
    const e = ev({ raw_json: { k: null } });
    expect(matchesWhere({ raw: 'k', op: 'exists', value: true }, e)).toBe(true);
  });

  it('keyword is a case-insensitive substring on search_text', () => {
    expect(matchesWhere({ keyword: true, value: 'cmd.exe' }, ev())).toBe(true);
    expect(matchesWhere({ keyword: true, value: 'CMD.EXE' }, ev())).toBe(true);
    expect(matchesWhere({ keyword: true, value: 'mimikatz' }, ev())).toBe(false);
  });
});

describe('matchesWhere — boolean tree', () => {
  it('all is AND, any is OR, not negates', () => {
    const e = ev();
    expect(matchesWhere({ all: [
      { field: 'event_id', op: 'eq', value: 1 },
      { field: 'process_name', op: 'endswith', value: '\\cmd.exe' },
    ] }, e)).toBe(true);
    expect(matchesWhere({ all: [
      { field: 'event_id', op: 'eq', value: 1 },
      { field: 'process_name', op: 'endswith', value: '\\powershell.exe' },
    ] }, e)).toBe(false);
    expect(matchesWhere({ any: [
      { field: 'event_id', op: 'eq', value: 999 },
      { field: 'username', op: 'eq', value: 'Alice' },
    ] }, e)).toBe(true);
    expect(matchesWhere({ not: { field: 'username', op: 'eq', value: 'Bob' } }, e)).toBe(true);
  });

  it('nested all/any/not compose', () => {
    const e = ev();
    expect(matchesWhere({ all: [
      { any: [{ field: 'event_id', op: 'eq', value: 1 }, { field: 'event_id', op: 'eq', value: 2 }] },
      { not: { field: 'username', op: 'eq', value: 'Bob' } },
    ] }, e)).toBe(true);
  });
});

// ── SQL parity spot-check: prove the JS evaluator agrees with Postgres itself on
// the edge cases most likely to diverge (LIKE wildcards, backslash escape, regex).
describe('matchesWhere vs Postgres (SQL parity spot-check)', () => {
  const SUPER = 'postgresql://postgres:postgres@localhost:5433/cybertools';
  const USER = 'test|eval-parity';
  let pool; let reachable = false;

  const row = {
    source: 'fluent-bit', host: 'HOST1', source_ip: '10.0.0.5', event_id: 1,
    severity: 'info', message: 'the Message_Text', username: 'Alice',
    process_name: 'C:\\Windows\\System32\\cmd.exe',
  };

  beforeAll(async () => {
    try {
      pool = new pg.Pool({ connectionString: SUPER });
      await pool.query('SELECT 1');
      reachable = true;
      await pool.query('DELETE FROM logs WHERE user_id = $1', [USER]);
      await pool.query(
        `INSERT INTO logs (user_id, source, host, source_ip, event_id, severity, message, username, process_name, timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
        [USER, row.source, row.host, row.source_ip, row.event_id, row.severity, row.message, row.username, row.process_name],
      );
    } catch { reachable = false; }
  });
  afterAll(async () => { if (pool) { await pool.query('DELETE FROM logs WHERE user_id = $1', [USER]).catch(()=>{}); await pool.end(); } });

  const CASES = [
    { field: 'message', op: 'contains', value: 'Message_Text' },   // _ wildcard
    { field: 'message', op: 'contains', value: 'Message\\_Text' },  // escaped literal _
    { field: 'message', op: 'contains', value: 'M%t' },            // % wildcard
    { field: 'process_name', op: 'endswith', value: '\\cmd.exe' },
    { field: 'process_name', op: 'endswith', value: '\\CMD.EXE' }, // ILIKE ci
    { field: 'process_name', op: 'contains_cs', value: 'System32' },
    { field: 'process_name', op: 'contains_cs', value: 'system32' },// cs miss
    { field: 'process_name', op: 're', value: 'cmd\\.exe$' },
    { field: 'source_ip', op: 'cidr', value: '10.0.0.0/8' },
    { field: 'event_id', op: 'in', value: [1, 4104] },
  ];

  it.runIf(() => reachable)('agrees with Postgres on every edge case', async () => {
    const e = ev(row);
    for (const leaf of CASES) {
      const { sql, params } = compileMatch([leaf], USER, { logIds: null, windowSecs: 3600 });
      const { rows } = await pool.query(sql, params);
      const sqlMatched = rows.length > 0;
      const jsMatched = matchesWhere({ all: [leaf] }, e);
      expect(jsMatched, `op=${leaf.op} value=${JSON.stringify(leaf.value)} — JS ${jsMatched} vs SQL ${sqlMatched}`).toBe(sqlMatched);
    }
  });
});
