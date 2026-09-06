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
let evaluateCatalog;

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
  ({ runCorrelation, evaluateCatalog } = await vi.importActual('../services/correlation/run.js'));
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

// ── Phase C: scheduled window-pass field prefilter for catalog (Sigma) rules ────

describe('evaluateCatalog — window-mode field prefilter', () => {
  const IDS = ['aaaa1111-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000003'];

  async function makeCatalogRule(identity, doc, sig = {}) {
    await superPool.query(
      `INSERT INTO sigma_rules
         (identity, title, category, path, rule, severity, convert_status, retired,
          sig_event_ids, sig_categories, sig_sources, sig_terms, has_regex)
       VALUES ($1,$2,'generic',$3,$4::jsonb,'high','converted',false,
               $5::integer[],$6::text[],$7::text[],$8::jsonb,$9)
       ON CONFLICT (identity) DO UPDATE SET rule = EXCLUDED.rule, sig_terms = EXCLUDED.sig_terms,
         has_regex = EXCLUDED.has_regex, retired = false, convert_status = 'converted'`,
      [identity, 'cat ' + identity.slice(0, 8), 'rules/' + identity + '.yml', JSON.stringify(doc),
       sig.sig_event_ids || [], sig.sig_categories || [], sig.sig_sources || [],
       JSON.stringify(sig.sig_terms || {}), sig.has_regex === true],
    );
  }
  async function insertProcLog(process_name, message = '') {
    await superPool.query(
      `INSERT INTO logs (user_id, source, host, event_id, severity, process_name, message, timestamp)
       VALUES ($1,'fluent-bit','h',1,'info',$2,$3,NOW())`,
      [USER, process_name, message],
    );
  }
  async function sigmaAlertCount(identity) {
    const { rows } = await superPool.query(
      'SELECT count(*)::int AS n FROM alerts WHERE user_id = $1 AND sigma_identity = $2', [USER, identity]);
    return rows[0].n;
  }

  beforeEach(async () => {
    if (!reachable) return;
    await superPool.query('DELETE FROM sigma_rules WHERE identity = ANY($1)', [IDS]);
    await superPool.query('DELETE FROM alerts WHERE user_id = $1', [USER]);
    await superPool.query('DELETE FROM logs WHERE user_id = $1', [USER]);
    await superPool.query(
      `INSERT INTO user_settings (user_id, sigma_enabled_categories) VALUES ($1,'{generic}')
       ON CONFLICT (user_id) DO UPDATE SET sigma_enabled_categories = '{generic}'`, [USER]);
  });

  afterAll(async () => {
    if (superPool) {
      await superPool.query('DELETE FROM sigma_rules WHERE identity = ANY($1)', [IDS]);
      await superPool.query("UPDATE user_settings SET sigma_enabled_categories='{}' WHERE user_id=$1", [USER]);
    }
  });

  it.runIf(() => reachable)('runs a rule whose pinned process_name appears in the window, and fires', async () => {
    await makeCatalogRule(IDS[0],
      { type: 'single_event', where: { all: [{ field: 'process_name', op: 'endswith', value: '\\evilwin.exe' }] } },
      { sig_terms: { process_name: [{ op: 'endswith', v: '\\evilwin.exe' }] } });
    await insertProcLog('C:\\Windows\\Temp\\evilwin.exe');
    const r = await evaluateCatalog(USER, { lookbackSeconds: 1200 }, db);
    expect(r.created).toBe(1);
    expect(await sigmaAlertCount(IDS[0])).toBe(1);
  });

  it.runIf(() => reachable)('skips a rule whose pinned process_name is absent from the window (no alert, no error)', async () => {
    await makeCatalogRule(IDS[1],
      { type: 'single_event', where: { all: [{ field: 'process_name', op: 'endswith', value: '\\mimikatz.exe' }] } },
      { sig_terms: { process_name: [{ op: 'endswith', v: '\\mimikatz.exe' }] } });
    await insertProcLog('C:\\Windows\\explorer.exe'); // present, but not the pinned value
    const r = await evaluateCatalog(USER, { lookbackSeconds: 1200 }, db);
    expect(r.created).toBe(0);
    expect(await sigmaAlertCount(IDS[1])).toBe(0);
  });

  it.runIf(() => reachable)('defers a pure-regex unprefilterable rule (has_regex, no signature)', async () => {
    await makeCatalogRule(IDS[2],
      { type: 'single_event', where: { all: [{ field: 'message', op: 're', value: 'evil.*payload' }] } },
      { has_regex: true }); // no sig_terms, no coarse dims → unprefilterable
    await insertProcLog('C:\\Windows\\explorer.exe', 'evil then payload'); // would match the regex
    const r = await evaluateCatalog(USER, { lookbackSeconds: 1200 }, db);
    expect(r.created).toBe(0); // skipped until Phase D
    expect(await sigmaAlertCount(IDS[2])).toBe(0);
  });
});
