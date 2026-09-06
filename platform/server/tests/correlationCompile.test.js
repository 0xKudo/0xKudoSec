import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { compileRule, compileNode, compileMatch, DEFAULT_ROW_LIMIT } from '../services/correlation/compile.js';

const USER = 'test|corr-compile';
const SUPER_URL = 'postgresql://postgres:postgres@localhost:5433/cybertools';

// A tiny parameter accumulator mirroring the compiler's internal one.
function P() { const params = []; return { params, add(v) { params.push(v); return `$${params.length}`; } }; }

describe('compileNode — boolean where-trees', () => {
  it('compiles an any node to a parenthesized OR', () => {
    const p = P();
    const sql = compileNode({ any: [
      { field: 'event_id', op: 'eq', value: 1 }, { field: 'event_id', op: 'eq', value: 2 } ] }, p);
    expect(sql).toBe('(l.event_id = $1 OR l.event_id = $2)');
    expect(p.params).toEqual([1, 2]);
  });

  it('compiles a not node', () => {
    const p = P();
    expect(compileNode({ not: { field: 'username', op: 'eq', value: 'svc' } }, p))
      .toBe('(NOT (l.username = $1))');
    expect(p.params).toEqual(['svc']);
  });

  it('compiles nested all/any', () => {
    const p = P();
    const sql = compileNode({ all: [
      { field: 'event_id', op: 'eq', value: 1 },
      { any: [ { field: 'process_name', op: 'endswith', value: '\\a.exe' } ] } ] }, p);
    expect(sql).toBe('(l.event_id = $1 AND (l.process_name ILIKE $2))');
    expect(p.params).toEqual([1, '%\\a.exe']);
  });

  it('compiles a keyword leaf to an ILIKE over the event-text column', () => {
    const p = P();
    const sql = compileNode({ keyword: true, value: 'mimikatz' }, p);
    expect(sql).toMatch(/ILIKE \$1/);
    expect(p.params).toEqual(['%mimikatz%']);
  });

  it('compiles an any of keyword leaves to an OR of ILIKEs', () => {
    const p = P();
    const sql = compileNode({ any: [
      { keyword: true, value: 'a' }, { keyword: true, value: 'b' } ] }, p);
    expect(sql).toMatch(/ILIKE \$1 OR .*ILIKE \$2/);
    expect(p.params).toEqual(['%a%', '%b%']);
  });

  it('compiles cidr to an inet containment with a bound param', () => {
    const p = P();
    expect(compileNode({ field: 'source_ip', op: 'cidr', value: '10.0.0.0/8' }, p))
      .toBe('l.source_ip::inet <<= $1::inet');
    expect(p.params).toEqual(['10.0.0.0/8']);
  });

  it('compiles re to a case-insensitive posix match', () => {
    const p = P();
    expect(compileNode({ field: 'message', op: 're', value: 'ab.*' }, p)).toBe('l.message ~* $1');
    expect(p.params).toEqual(['ab.*']);
  });

  it('compiles exists to IS NOT NULL / IS NULL with no bound value', () => {
    const p = P();
    expect(compileNode({ field: 'file_path', op: 'exists', value: true }, p)).toBe('l.file_path IS NOT NULL');
    expect(compileNode({ field: 'file_path', op: 'exists', value: false }, p)).toBe('l.file_path IS NULL');
    expect(p.params).toEqual([]);
  });

  it('compiles fieldref to a column-to-column comparison (no user value)', () => {
    const p = P();
    expect(compileNode({ field: 'process_name', op: 'fieldref', value: 'parent_process_name' }, p))
      .toBe('l.process_name = l.parent_process_name');
    expect(p.params).toEqual([]);
  });

  it('compiles cased contains to LIKE (case-sensitive) not ILIKE', () => {
    const p = P();
    expect(compileNode({ field: 'message', op: 'contains_cs', value: 'X' }, p)).toBe('l.message LIKE $1');
    expect(p.params).toEqual(['%X%']);
  });

  it('compiles a raw-field leaf with the field name bound to ->>', () => {
    const p = P();
    const sql = compileNode({ raw: 'ScriptBlockText', op: 'contains', value: 'x' }, p);
    expect(sql).toBe('(l.raw_json ->> $1) ILIKE $2');
    expect(p.params).toEqual(['ScriptBlockText', '%x%']);
  });

  it('raw-field contains adds a trigram search_text prefilter for >=3-char literals', () => {
    const p = P();
    const sql = compileNode({ raw: 'ScriptBlockText', op: 'contains', value: 'mimikatz' }, p);
    expect(sql).toMatch(/l\.search_text ILIKE \$\d+\) AND \(l\.raw_json ->> \$\d+\) ILIKE \$\d+/);
    expect(p.params).toContain('%mimikatz%');
    expect(p.params).toContain('ScriptBlockText');
  });

  it('raw-field eq adds a trigram prefilter and keeps the exact ->> equality', () => {
    const p = P();
    const sql = compileNode({ raw: 'host.scan.vuln', op: 'eq', value: '13532' }, p);
    expect(sql).toMatch(/l\.search_text ILIKE \$\d+\) AND \(l\.raw_json ->> \$\d+\) = \$\d+/);
    expect(p.params).toContain('%13532%');
    expect(p.params).toContain('13532');
    expect(p.params).toContain('host.scan.vuln');
  });

  it('raw-field short literal (<3 chars) skips the trigram prefilter', () => {
    const p = P();
    expect(compileNode({ raw: 'Foo', op: 'contains', value: 'ab' }, p))
      .toBe('(l.raw_json ->> $1) ILIKE $2');
  });

  it('compiles a raw-field exists to a jsonb key test', () => {
    const p = P();
    expect(compileNode({ raw: 'Hashes', op: 'exists', value: true }, p))
      .toBe('l.raw_json ? $1');
    expect(p.params).toEqual(['Hashes']);
  });

  it('compiles a keyword leaf against search_text', () => {
    const p = P();
    expect(compileNode({ keyword: true, value: 'mimikatz' }, p)).toBe('l.search_text ILIKE $1');
    expect(p.params).toEqual(['%mimikatz%']);
  });

  it('a raw-field where stays batch-scoped when logIds are supplied (ingest hot path)', () => {
    const { sql, params } = compileMatch(
      { all: [{ raw: 'ScriptBlockText', op: 'contains', value: 'x' }] },
      USER, { logIds: [1, 2, 3] },
    );
    expect(sql).toMatch(/l\.id = ANY\(\$\d+\)/);      // scan limited to the batch
    expect(sql).not.toMatch(/make_interval/);          // not a full-window scan
    expect(sql).toMatch(/raw_json ->> \$\d+/);
    expect(params).toContain('ScriptBlockText');
    expect(params).toContainEqual([1, 2, 3]);
  });

  it('a rule with a where tree compiles the OR into the WHERE clause', () => {
    const { sql, params } = compileRule(
      { type: 'single_event', name: 'r', where: { any: [
        { field: 'event_id', op: 'eq', value: 1 }, { field: 'event_id', op: 'eq', value: 2 } ] } },
      USER,
    );
    expect(sql).toMatch(/\(l\.event_id = \$\d+ OR l\.event_id = \$\d+\)/);
    expect(params).toContain(1);
    expect(params).toContain(2);
  });
});

// ---------- structural / security tests (no DB) ----------

describe('compileRule — parameterization & structure', () => {
  it('single_event binds every value and never interpolates user input', () => {
    const malicious = "x'; DROP TABLE logs;--";
    const { sql, params } = compileRule(
      { type: 'single_event', name: 'r', selection: [{ field: 'message', op: 'contains', value: malicious }] },
      USER,
    );
    // The raw value must appear ONLY in params, never in the SQL text.
    expect(sql).not.toContain('DROP TABLE');
    expect(params).toContain(`%${malicious}%`);
    expect(params[0]).toBe(USER);
    expect(sql).toMatch(/FROM logs l/);
    expect(sql).toContain(`LIMIT ${DEFAULT_ROW_LIMIT}`);
  });

  it('single_event with logIds scopes by id array', () => {
    const { sql, params } = compileRule(
      { type: 'single_event', name: 'r', selection: [{ field: 'event_id', op: 'eq', value: 4104 }] },
      USER, { logIds: [1, 2, 3] },
    );
    expect(sql).toMatch(/l\.id = ANY\(\$\d+\)/);
    expect(params).toContainEqual([1, 2, 3]);
    expect(sql).not.toMatch(/make_interval/); // no time bound when ids given
  });

  it('rejects an unknown field at compile time (no passthrough)', () => {
    expect(() => compileRule(
      { type: 'single_event', name: 'r', selection: [{ field: 'evil', op: 'eq', value: 1 }] },
      USER,
    )).toThrow(/Unknown log field/);
  });

  it('threshold compiles GROUP BY / HAVING with bound count and window seconds', () => {
    const { sql, params } = compileRule(
      { type: 'threshold', name: 'r', selection: [{ field: 'event_id', op: 'eq', value: 4625 }],
        group_by: 'source_ip', window: '10m', count: 5 },
      USER,
    );
    expect(sql).toMatch(/GROUP BY l\.source_ip/);
    expect(sql).toMatch(/HAVING count\(\*\) >= \$\d+/);
    expect(params).toContain(600); // 10m in seconds, bound not inlined
    expect(params).toContain(5);
    expect(sql).toMatch(/make_interval\(secs => \$\d+\)/);
  });

  it('integer-column text operators cast to ::text', () => {
    const { sql } = compileRule(
      { type: 'single_event', name: 'r', selection: [{ field: 'event_id', op: 'contains', value: '46' }] },
      USER,
    );
    expect(sql).toMatch(/l\.event_id::text ILIKE/);
  });

  it('sequence compiles a LAG chain, no self-join', () => {
    const { sql, params } = compileRule(
      { type: 'sequence', name: 'r',
        steps: [{ selection: [{ field: 'event_id', op: 'eq', value: 4624 }] },
                { selection: [{ field: 'event_id', op: 'eq', value: 4688 }] }],
        join_on: 'host', window: '5m' },
      USER,
    );
    expect(sql).toMatch(/LAG\(s\.step, 1\) OVER w/);
    expect(sql).toMatch(/PARTITION BY s\.seq_key/);
    expect(sql).not.toMatch(/logs .*JOIN logs/i); // no self-join on logs
    expect(params).toContain(300);
  });

  it('join compiles a CTE-per-selection with a time delta', () => {
    const { sql, params } = compileRule(
      { type: 'join', name: 'r',
        left: { source: 'fluent-bit', selection: [{ field: 'event_id', op: 'eq', value: 1 }] },
        right: { source: 'wordpress', selection: [{ field: 'severity', op: 'eq', value: 'high' }] },
        join_on: 'source_ip', window: '1h' },
      USER,
    );
    expect(sql).toMatch(/WITH a AS/);
    expect(sql).toMatch(/JOIN b ON a\.k = b\.k/);
    expect(params).toContain('fluent-bit');
    expect(params).toContain('wordpress');
    expect(params).toContain(3600);
  });

  it('absence without group_by returns a NOT EXISTS sentinel', () => {
    const { sql } = compileRule(
      { type: 'absence', name: 'r', selection: [{ field: 'event_id', op: 'eq', value: 7045 }], window: '1h' },
      USER,
    );
    expect(sql).toMatch(/NOT EXISTS/);
  });

  it('absence with group_by does a baseline-vs-recent anti-join', () => {
    const { sql } = compileRule(
      { type: 'absence', name: 'r', selection: [{ field: 'source', op: 'eq', value: 'fluent-bit' }],
        window: '1h', group_by: 'host' },
      USER,
    );
    expect(sql).toMatch(/baseline b LEFT JOIN recent r/);
    expect(sql).toMatch(/WHERE r\.k IS NULL/);
  });
});

// ---------- integration tests (real Docker DB, self-skip if unreachable) ----------

let reachable = false;
let superPool;

beforeAll(async () => {
  try {
    superPool = new pg.Pool({ connectionString: SUPER_URL });
    await superPool.query('SELECT 1');
    reachable = true;
  } catch {
    reachable = false;
    return;
  }
  await superPool.query('DELETE FROM logs WHERE user_id = $1', [USER]);
  // single_event / threshold: three 4625 from one source_ip, one 4624 (non-match).
  await superPool.query(
    `INSERT INTO logs (user_id, source, host, source_ip, event_id, message, timestamp) VALUES
       ($1,'fluent-bit','h1','9.9.9.9',4625,'fail1',NOW()),
       ($1,'fluent-bit','h1','9.9.9.9',4625,'fail2',NOW()),
       ($1,'fluent-bit','h1','9.9.9.9',4625,'fail3',NOW()),
       ($1,'fluent-bit','h1','9.9.9.9',4624,'ok',NOW())`,
    [USER],
  );
  // sequence: 4624 then 4688 on host hs, adjacent in time.
  await superPool.query(
    `INSERT INTO logs (user_id, source, host, event_id, message, timestamp) VALUES
       ($1,'fluent-bit','hs',4624,'logon',NOW() - interval '60 seconds'),
       ($1,'fluent-bit','hs',4688,'proc',NOW() - interval '30 seconds')`,
    [USER],
  );
  // join: source s1 and s2 sharing source_ip 5.5.5.5 within the window.
  await superPool.query(
    `INSERT INTO logs (user_id, source, host, source_ip, severity, event_id, message, timestamp) VALUES
       ($1,'fluent-bit','hj','5.5.5.5','info',1,'a',NOW() - interval '20 seconds'),
       ($1,'wordpress','hj','5.5.5.5','high',9001,'b',NOW())`,
    [USER],
  );
});

afterAll(async () => {
  if (superPool) {
    await superPool.query('DELETE FROM logs WHERE user_id = $1', [USER]);
    await superPool.end();
  }
});

async function run(rule, opts) {
  const { sql, params } = compileRule(rule, USER, opts);
  const { rows } = await superPool.query(sql, params);
  return rows;
}

describe('compileRule — execution against seeded logs', () => {
  it.runIf(() => reachable)('single_event matches only the selection', async () => {
    const rows = await run({ type: 'single_event', name: 'r', selection: [{ field: 'event_id', op: 'eq', value: 4625 }] });
    expect(rows.length).toBe(3);
  });

  it.runIf(() => reachable)('threshold fires when count >= N over the window', async () => {
    const rows = await run({ type: 'threshold', name: 'r',
      selection: [{ field: 'event_id', op: 'eq', value: 4625 }], group_by: 'source_ip', window: '1h', count: 3 });
    expect(rows.length).toBe(1);
    expect(rows[0].group_key).toBe('9.9.9.9');
    expect(rows[0].cnt).toBe(3);
  });

  it.runIf(() => reachable)('threshold does NOT fire when count exceeds occurrences', async () => {
    const rows = await run({ type: 'threshold', name: 'r',
      selection: [{ field: 'event_id', op: 'eq', value: 4625 }], group_by: 'source_ip', window: '1h', count: 4 });
    expect(rows.length).toBe(0);
  });

  it.runIf(() => reachable)('sequence matches 4624 then 4688 on the same host', async () => {
    const rows = await run({ type: 'sequence', name: 'r',
      steps: [{ selection: [{ field: 'event_id', op: 'eq', value: 4624 }] },
              { selection: [{ field: 'event_id', op: 'eq', value: 4688 }] }],
      join_on: 'host', window: '5m' });
    expect(rows.length).toBe(1);
    expect(rows[0].group_key).toBe('hs');
  });

  it.runIf(() => reachable)('join correlates two sources on a shared source_ip', async () => {
    const rows = await run({ type: 'join', name: 'r',
      left: { source: 'fluent-bit', selection: [{ field: 'event_id', op: 'eq', value: 1 }] },
      right: { source: 'wordpress', selection: [{ field: 'severity', op: 'eq', value: 'high' }] },
      join_on: 'source_ip', window: '1h' });
    expect(rows.length).toBe(1);
    expect(rows[0].group_key).toBe('5.5.5.5');
  });

  it.runIf(() => reachable)('absence (no group_by) fires when the event is missing', async () => {
    const rows = await run({ type: 'absence', name: 'r',
      selection: [{ field: 'event_id', op: 'eq', value: 999999 }], window: '1h' });
    expect(rows.length).toBe(1);
  });

  it.runIf(() => reachable)('absence (no group_by) is silent when the event is present', async () => {
    const rows = await run({ type: 'absence', name: 'r',
      selection: [{ field: 'event_id', op: 'eq', value: 4625 }], window: '1h' });
    expect(rows.length).toBe(0);
  });
});
