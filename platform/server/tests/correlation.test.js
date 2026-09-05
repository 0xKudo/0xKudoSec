import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import pg from 'pg';

// tests/setup.js globally mocks ../services/db.js. This is a real-DB integration
// suite, so we obtain the actual pool via vi.importActual and pass it as `deps`.
// (runCorrelation delegates detection_rules to runDetectionRules, which uses the
// mocked db and finds no rules — no interference with these correlation-only tests.)

const SUPER_URL = 'postgresql://postgres:postgres@localhost:5433/cybertools';
const APP_URL = 'postgresql://cybertools_app:app@localhost:5433/cybertools';
const USER = 'test|corr-run';

let reachable = false;
let superPool;
let db;
let runCorrelation;

async function makeRule(doc, name = 'r', severity = 'high') {
  const { rows } = await superPool.query(
    `INSERT INTO correlation_rules (user_id, name, severity, rule, enabled)
     VALUES ($1, $2, $3, $4::jsonb, true) RETURNING id`,
    [USER, name, severity, JSON.stringify(doc)],
  );
  return rows[0].id;
}

async function insertLogs(values) {
  // values: array of column objects; returns inserted ids.
  const ids = [];
  for (const v of values) {
    const { rows } = await superPool.query(
      `INSERT INTO logs (user_id, source, host, source_ip, event_id, severity, message, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [USER, v.source || 'fluent-bit', v.host || 'h', v.source_ip || null, v.event_id || null,
       v.severity || 'info', v.message || '', v.timestamp || new Date()],
    );
    ids.push(rows[0].id);
  }
  return ids;
}

async function alertsFor(ruleId) {
  const { rows } = await superPool.query(
    'SELECT id, rule_id, correlation_rule_id, group_key, count FROM alerts WHERE correlation_rule_id = $1 ORDER BY id',
    [ruleId],
  );
  return rows;
}

beforeAll(async () => {
  try {
    superPool = new pg.Pool({ connectionString: SUPER_URL });
    await superPool.query('SELECT 1');
    reachable = true;
  } catch {
    reachable = false;
    return;
  }
  process.env.DATABASE_URL = APP_URL;
  process.env.NODE_ENV = 'test';
  db = (await vi.importActual('../services/db.js')).default;
  ({ runCorrelation } = await vi.importActual('../services/correlation/run.js'));
});

beforeEach(async () => {
  if (!reachable) return;
  // correlation_rules delete cascades alerts(FK SET NULL) — clear alerts explicitly.
  await superPool.query('DELETE FROM alerts WHERE user_id = $1', [USER]);
  await superPool.query('DELETE FROM correlation_rules WHERE user_id = $1', [USER]);
  await superPool.query('DELETE FROM logs WHERE user_id = $1', [USER]);
});

afterAll(async () => {
  if (superPool) {
    await superPool.query('DELETE FROM alerts WHERE user_id = $1', [USER]);
    await superPool.query('DELETE FROM correlation_rules WHERE user_id = $1', [USER]);
    await superPool.query('DELETE FROM logs WHERE user_id = $1', [USER]);
    await superPool.end();
  }
});

describe('runCorrelation — end to end per type', () => {
  it.runIf(() => reachable)('single_event fires and dedups by event_id', async () => {
    const ruleId = await makeRule({ type: 'single_event', selection: [{ field: 'event_id', op: 'eq', value: 4104 }] });
    const ids = await insertLogs([
      { event_id: 4104, message: 'a' },
      { event_id: 4104, message: 'b' },
    ]);
    const r = await runCorrelation(USER, ids, db);
    expect(r.correlation.created).toBe(1);
    expect(r.correlation.deduped).toBe(1);
    const alerts = await alertsFor(ruleId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].rule_id).toBeNull();
    expect(alerts[0].correlation_rule_id).toBe(ruleId);
    expect(alerts[0].count).toBe(2);
  });

  it.runIf(() => reachable)('threshold fires only at N over the window', async () => {
    const ruleId = await makeRule({ type: 'threshold', selection: [{ field: 'event_id', op: 'eq', value: 4625 }],
      group_by: 'source_ip', window: '1h', count: 3 });
    const base = Date.now();
    const ids = await insertLogs([
      { event_id: 4625, source_ip: '9.9.9.9', timestamp: new Date(base) },
      { event_id: 4625, source_ip: '9.9.9.9', timestamp: new Date(base + 1000) },
      { event_id: 4625, source_ip: '9.9.9.9', timestamp: new Date(base + 2000) },
    ]);
    const r = await runCorrelation(USER, ids, db);
    expect(r.correlation.created).toBe(1);
    const alerts = await alertsFor(ruleId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].group_key).toBe('9.9.9.9');
  });

  it.runIf(() => reachable)('threshold does not fire below N', async () => {
    const ruleId = await makeRule({ type: 'threshold', selection: [{ field: 'event_id', op: 'eq', value: 4625 }],
      group_by: 'source_ip', window: '1h', count: 5 });
    const ids = await insertLogs([
      { event_id: 4625, source_ip: '8.8.8.8' },
      { event_id: 4625, source_ip: '8.8.8.8' },
    ]);
    await runCorrelation(USER, ids, db);
    expect(await alertsFor(ruleId)).toHaveLength(0);
  });

  it.runIf(() => reachable)('sequence fires on ordered steps within window', async () => {
    const ruleId = await makeRule({ type: 'sequence',
      steps: [{ selection: [{ field: 'event_id', op: 'eq', value: 4624 }] },
              { selection: [{ field: 'event_id', op: 'eq', value: 4688 }] }],
      join_on: 'host', window: '5m' });
    const base = Date.now();
    const ids = await insertLogs([
      { event_id: 4624, host: 'seqh', timestamp: new Date(base) },
      { event_id: 4688, host: 'seqh', timestamp: new Date(base + 1000) },
    ]);
    const r = await runCorrelation(USER, ids, db);
    expect(r.correlation.created).toBe(1);
    expect((await alertsFor(ruleId))[0].group_key).toBe('seqh');
  });

  it.runIf(() => reachable)('join correlates two sources on a shared key', async () => {
    const ruleId = await makeRule({ type: 'join',
      left: { source: 'fluent-bit', selection: [{ field: 'event_id', op: 'eq', value: 1 }] },
      right: { source: 'wordpress', selection: [{ field: 'severity', op: 'eq', value: 'high' }] },
      join_on: 'source_ip', window: '1h' });
    const ids = await insertLogs([
      { source: 'fluent-bit', event_id: 1, source_ip: '5.5.5.5', severity: 'info' },
      { source: 'wordpress', event_id: 9001, source_ip: '5.5.5.5', severity: 'high' },
    ]);
    const r = await runCorrelation(USER, ids, db);
    expect(r.correlation.created).toBe(1);
    expect((await alertsFor(ruleId))[0].group_key).toBe('5.5.5.5');
  });

  it.runIf(() => reachable)('absence fires on a full pass when the event is missing', async () => {
    const ruleId = await makeRule({ type: 'absence',
      selection: [{ field: 'event_id', op: 'eq', value: 7045 }], window: '1h' });
    await insertLogs([{ event_id: 4624 }]); // unrelated event present
    const r = await runCorrelation(USER, null, db); // full pass, not ingest
    expect(r.correlation.created).toBe(1);
    expect(await alertsFor(ruleId)).toHaveLength(1);
  });

  it.runIf(() => reachable)('a Sigma-imported rule fires on matching logs', async () => {
    const { sigmaToRule } = await vi.importActual('../services/correlation/sigma.js');
    const { rule } = sigmaToRule(`
title: PowerShell EncodedCommand
level: high
tags:
  - attack.t1059.001
detection:
  selection:
    EventID: 4104
    CommandLine|contains: EncodedCommand
  condition: selection
`);
    const ruleId = await makeRule(rule, rule.name, rule.severity);
    const ids = await insertLogs([{ event_id: 4104, message: 'powershell -EncodedCommand ZQBjAGgAbwA=' }]);
    const r = await runCorrelation(USER, ids, db);
    expect(r.correlation.created).toBe(1);
    expect((await alertsFor(ruleId))).toHaveLength(1);
  });

  it.runIf(() => reachable)('a disabled rule does not fire', async () => {
    const { rows } = await superPool.query(
      `INSERT INTO correlation_rules (user_id, name, rule, enabled)
       VALUES ($1,'off','{"type":"single_event","selection":[{"field":"event_id","op":"eq","value":4104}]}'::jsonb, false)
       RETURNING id`, [USER]);
    const ids = await insertLogs([{ event_id: 4104 }]);
    await runCorrelation(USER, ids, db);
    expect(await alertsFor(rows[0].id)).toHaveLength(0);
  });
});
