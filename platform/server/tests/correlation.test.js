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

// ── Phase D: real-time community-catalog detection via the in-memory matcher ────
// single_event catalog rules now fire on the ingest batch through runCatalogMatcher
// (not the scheduled SQL cron). The Phase C window prefilter is unit-tested in
// sigmaCron.test.js; here we prove the end-to-end matcher path.

describe('runCorrelation — catalog matcher (Phase D)', () => {
  const IDS = ['bbbb2222-0000-0000-0000-000000000001', 'bbbb2222-0000-0000-0000-000000000002',
    'bbbb2222-0000-0000-0000-000000000003', 'bbbb2222-0000-0000-0000-000000000004',
    'bbbb2222-0000-0000-0000-000000000005'];
  let _resetMatcherCache;

  async function makeCatalogRule(identity, doc, category = 'generic') {
    await superPool.query(
      `INSERT INTO sigma_rules
         (identity, title, category, path, rule, severity, convert_status, retired)
       VALUES ($1,$2,$3,$4,$5::jsonb,'high','converted',false)
       ON CONFLICT (identity) DO UPDATE SET rule = EXCLUDED.rule, category = EXCLUDED.category,
         retired = false, convert_status = 'converted', updated_at = NOW()`,
      [identity, 'cat ' + identity.slice(0, 8), category, 'rules/' + identity + '.yml', JSON.stringify(doc)],
    );
  }
  async function insertProcLog(process_name, message = '') {
    const { rows } = await superPool.query(
      `INSERT INTO logs (user_id, source, host, event_id, severity, process_name, message, timestamp)
       VALUES ($1,'fluent-bit','h',1,'info',$2,$3,NOW()) RETURNING id`,
      [USER, process_name, message],
    );
    return rows[0].id;
  }
  async function sigmaAlertCount(identity) {
    const { rows } = await superPool.query(
      'SELECT count(*)::int AS n FROM alerts WHERE user_id = $1 AND sigma_identity = $2', [USER, identity]);
    return rows[0].n;
  }

  beforeAll(async () => {
    if (!reachable) return;
    ({ _resetMatcherCache } = await vi.importActual('../services/correlation/catalogMatcher.js'));
  });

  beforeEach(async () => {
    if (!reachable) return;
    delete process.env.CATALOG_DISABLED;
    delete process.env.CATALOG_MATCHER_SHADOW;
    await superPool.query('DELETE FROM sigma_rules WHERE identity = ANY($1)', [IDS]);
    await superPool.query('DELETE FROM sigma_rule_overrides WHERE user_id = $1', [USER]);
    await superPool.query('DELETE FROM alerts WHERE user_id = $1', [USER]);
    await superPool.query('DELETE FROM logs WHERE user_id = $1', [USER]);
    await superPool.query(
      `INSERT INTO user_settings (user_id, sigma_enabled_categories) VALUES ($1,'{generic}')
       ON CONFLICT (user_id) DO UPDATE SET sigma_enabled_categories = '{generic}'`, [USER]);
    _resetMatcherCache();
  });

  afterAll(async () => {
    if (superPool) {
      await superPool.query('DELETE FROM sigma_rules WHERE identity = ANY($1)', [IDS]);
      await superPool.query('DELETE FROM sigma_rule_overrides WHERE user_id = $1', [USER]);
      await superPool.query("UPDATE user_settings SET sigma_enabled_categories='{}' WHERE user_id=$1", [USER]);
    }
  });

  it.runIf(() => reachable)('an enabled single_event catalog rule fires in real time on the ingest batch', async () => {
    await makeCatalogRule(IDS[0],
      { type: 'single_event', where: { all: [{ field: 'process_name', op: 'endswith', value: '\\evilwin.exe' }] } });
    _resetMatcherCache();
    const id = await insertProcLog('C:\\Windows\\Temp\\evilwin.exe');
    const r = await runCorrelation(USER, [id], db);
    expect(r.catalog.created).toBe(1);
    expect(await sigmaAlertCount(IDS[0])).toBe(1);
  });

  it.runIf(() => reachable)('a non-matching batch fires nothing', async () => {
    await makeCatalogRule(IDS[1],
      { type: 'single_event', where: { all: [{ field: 'process_name', op: 'endswith', value: '\\mimikatz.exe' }] } });
    _resetMatcherCache();
    const id = await insertProcLog('C:\\Windows\\explorer.exe');
    const r = await runCorrelation(USER, [id], db);
    expect(r.catalog.created).toBe(0);
    expect(await sigmaAlertCount(IDS[1])).toBe(0);
  });

  it.runIf(() => reachable)('a regex rule now fires via the matcher (was deferred in Phase C)', async () => {
    await makeCatalogRule(IDS[2],
      { type: 'single_event', where: { all: [{ field: 'message', op: 're', value: 'evil.*payload' }] } });
    _resetMatcherCache();
    const id = await insertProcLog('C:\\Windows\\explorer.exe', 'evil then payload');
    const r = await runCorrelation(USER, [id], db);
    expect(r.catalog.created).toBe(1);
    expect(await sigmaAlertCount(IDS[2])).toBe(1);
  });

  it.runIf(() => reachable)('a rule in a disabled category fires nothing', async () => {
    await makeCatalogRule(IDS[3],
      { type: 'single_event', where: { all: [{ field: 'process_name', op: 'endswith', value: '\\evilwin.exe' }] } },
      'threat_hunting'); // category NOT in the user's enabled set
    _resetMatcherCache();
    const id = await insertProcLog('C:\\Windows\\Temp\\evilwin.exe');
    const r = await runCorrelation(USER, [id], db);
    expect(r.catalog.created).toBe(0);
    expect(await sigmaAlertCount(IDS[3])).toBe(0);
  });

  it.runIf(() => reachable)('shadow mode computes hits but inserts no alerts', async () => {
    await makeCatalogRule(IDS[4],
      { type: 'single_event', where: { all: [{ field: 'process_name', op: 'endswith', value: '\\evilwin.exe' }] } });
    _resetMatcherCache();
    process.env.CATALOG_MATCHER_SHADOW = '1';
    const id = await insertProcLog('C:\\Windows\\Temp\\evilwin.exe');
    const r = await runCorrelation(USER, [id], db);
    expect(r.catalog.created).toBe(0); // shadow: no insert
    expect(await sigmaAlertCount(IDS[4])).toBe(0);
    delete process.env.CATALOG_MATCHER_SHADOW;
  });

  it.runIf(() => reachable)('the master kill-switch disables the matcher', async () => {
    await makeCatalogRule(IDS[0],
      { type: 'single_event', where: { all: [{ field: 'process_name', op: 'endswith', value: '\\evilwin.exe' }] } });
    _resetMatcherCache();
    process.env.CATALOG_DISABLED = '1';
    const id = await insertProcLog('C:\\Windows\\Temp\\evilwin.exe');
    const r = await runCorrelation(USER, [id], db);
    expect(r.catalog.created).toBe(0);
    expect(await sigmaAlertCount(IDS[0])).toBe(0);
    delete process.env.CATALOG_DISABLED;
  });
});

// ── Phase D: the scheduled cron now evaluates ONLY stateful (threshold) catalog
// rules; single_event is off this path entirely. ─────────────────────────────────

describe('evaluateCatalog — cron keeps stateful (threshold) rules only', () => {
  const TID = 'cccc3333-0000-0000-0000-000000000001';
  const SID = 'cccc3333-0000-0000-0000-000000000002';

  async function makeCatalogRule(identity, doc) {
    await superPool.query(
      `INSERT INTO sigma_rules (identity, title, category, path, rule, severity, convert_status, retired)
       VALUES ($1,$2,'generic',$3,$4::jsonb,'high','converted',false)
       ON CONFLICT (identity) DO UPDATE SET rule = EXCLUDED.rule, retired = false,
         convert_status = 'converted', updated_at = NOW()`,
      [identity, 'cat ' + identity.slice(0, 8), 'rules/' + identity + '.yml', JSON.stringify(doc)],
    );
  }
  async function sigmaAlertCount(identity) {
    const { rows } = await superPool.query(
      'SELECT count(*)::int AS n FROM alerts WHERE user_id = $1 AND sigma_identity = $2', [USER, identity]);
    return rows[0].n;
  }

  beforeEach(async () => {
    if (!reachable) return;
    await superPool.query('DELETE FROM sigma_rules WHERE identity = ANY($1)', [[TID, SID]]);
    await superPool.query('DELETE FROM alerts WHERE user_id = $1', [USER]);
    await superPool.query('DELETE FROM logs WHERE user_id = $1', [USER]);
    await superPool.query(
      `INSERT INTO user_settings (user_id, sigma_enabled_categories) VALUES ($1,'{generic}')
       ON CONFLICT (user_id) DO UPDATE SET sigma_enabled_categories = '{generic}'`, [USER]);
  });

  afterAll(async () => {
    if (superPool) {
      await superPool.query('DELETE FROM sigma_rules WHERE identity = ANY($1)', [[TID, SID]]);
      await superPool.query("UPDATE user_settings SET sigma_enabled_categories='{}' WHERE user_id=$1", [USER]);
    }
  });

  it.runIf(() => reachable)('a threshold catalog rule still fires on the scheduled pass', async () => {
    await makeCatalogRule(TID, { type: 'threshold', selection: [{ field: 'event_id', op: 'eq', value: 4625 }],
      group_by: 'source_ip', window: '1h', count: 2 });
    const base = Date.now();
    await superPool.query(
      `INSERT INTO logs (user_id, source, host, source_ip, event_id, severity, timestamp)
       VALUES ($1,'fluent-bit','h','7.7.7.7',4625,'info',$2),
              ($1,'fluent-bit','h','7.7.7.7',4625,'info',$3)`,
      [USER, new Date(base), new Date(base + 1000)]);
    const r = await evaluateCatalog(USER, { lookbackSeconds: 1200 }, db);
    expect(r.created).toBe(1);
    expect(await sigmaAlertCount(TID)).toBe(1);
  });

  it.runIf(() => reachable)('a single_event catalog rule does NOT fire on the scheduled pass (moved to the matcher)', async () => {
    await makeCatalogRule(SID,
      { type: 'single_event', where: { all: [{ field: 'process_name', op: 'endswith', value: '\\evilwin.exe' }] } });
    await superPool.query(
      `INSERT INTO logs (user_id, source, host, event_id, severity, process_name, timestamp)
       VALUES ($1,'fluent-bit','h',1,'info','C:\\Windows\\Temp\\evilwin.exe',NOW())`, [USER]);
    const r = await evaluateCatalog(USER, { lookbackSeconds: 1200 }, db);
    expect(r.created).toBe(0);
    expect(await sigmaAlertCount(SID)).toBe(0);
  });
});
