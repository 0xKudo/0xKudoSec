import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import pg from 'pg';

// Sigma Rule Library Phase 2 — per-user enablement engine path. Real Docker DB;
// tests/setup.js globally mocks db.js so we pull the real pool via vi.importActual.

const SUPER_URL = 'postgresql://postgres:postgres@localhost:5433/cybertools';
const APP_URL = 'postgresql://cybertools_app:app@localhost:5433/cybertools';
const USER = 'test|sigma-enable';

let reachable = false;
let superPool;
let db;
let evaluateCatalog;

const SINGLE_EVENT = { type: 'single_event', selection: [{ field: 'event_id', op: 'eq', value: 4104 }], severity: 'high' };

async function seedCatalogRule({ identity, category = 'generic', doc = SINGLE_EVENT, severity = 'high', status = 'converted', title = 'Cat rule', sigEventIds = [], sigCategories = [], sigSources = [] }) {
  await superPool.query(
    `INSERT INTO sigma_rules (sigma_id, identity, title, category, path, rule, severity, convert_status, source_sha,
                             sig_event_ids, sig_categories, sig_sources)
     VALUES ($1,$1,$2,$3,$4,$5::jsonb,$6,$7,'sha',$8::integer[],$9::text[],$10::text[])
     ON CONFLICT (identity) DO UPDATE SET category=EXCLUDED.category, rule=EXCLUDED.rule,
       severity=EXCLUDED.severity, convert_status=EXCLUDED.convert_status, retired=false,
       sig_event_ids=EXCLUDED.sig_event_ids, sig_categories=EXCLUDED.sig_categories, sig_sources=EXCLUDED.sig_sources`,
    [identity, title, category, `rules/${identity}.yml`, status === 'converted' ? JSON.stringify(doc) : null, severity, status,
     sigEventIds, sigCategories, sigSources]
  );
}

async function setCategories(cats) {
  await superPool.query(
    `INSERT INTO user_settings (user_id, sigma_enabled_categories) VALUES ($1, $2::text[])
     ON CONFLICT (user_id) DO UPDATE SET sigma_enabled_categories = $2::text[]`,
    [USER, cats]
  );
}

async function setOverride(identity, enabled, severity = null) {
  await superPool.query(
    `INSERT INTO sigma_rule_overrides (user_id, sigma_identity, enabled, severity) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, sigma_identity) DO UPDATE SET enabled=$3, severity=$4`,
    [USER, identity, enabled, severity]
  );
}

async function insertLogs(values) {
  const ids = [];
  for (const v of values) {
    const { rows } = await superPool.query(
      `INSERT INTO logs (user_id, source, host, source_ip, event_id, severity, message, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [USER, v.source || 'fluent-bit', v.host || 'h', v.source_ip || null, v.event_id || null,
       v.severity || 'info', v.message || '', v.timestamp || new Date()]
    );
    ids.push(rows[0].id);
  }
  return ids;
}

async function sigmaAlerts(identity) {
  const { rows } = await superPool.query(
    'SELECT id, sigma_identity, group_key, severity, count FROM alerts WHERE user_id=$1 AND sigma_identity=$2 ORDER BY id',
    [USER, identity]
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
  ({ evaluateCatalog } = await vi.importActual('../services/correlation/run.js'));
});

beforeEach(async () => {
  if (!reachable) return;
  await superPool.query('DELETE FROM alerts WHERE user_id=$1', [USER]);
  await superPool.query('DELETE FROM logs WHERE user_id=$1', [USER]);
  await superPool.query('DELETE FROM sigma_rule_overrides WHERE user_id=$1', [USER]);
  await superPool.query('DELETE FROM user_settings WHERE user_id=$1', [USER]);
  await superPool.query("DELETE FROM sigma_rules WHERE identity LIKE 'test-%'");
});

afterAll(async () => {
  if (!superPool) return;
  await superPool.query('DELETE FROM alerts WHERE user_id=$1', [USER]);
  await superPool.query('DELETE FROM logs WHERE user_id=$1', [USER]);
  await superPool.query('DELETE FROM sigma_rule_overrides WHERE user_id=$1', [USER]);
  await superPool.query('DELETE FROM user_settings WHERE user_id=$1', [USER]);
  await superPool.query("DELETE FROM sigma_rules WHERE identity LIKE 'test-%'");
  await superPool.end();
});

describe('Sigma catalog engine (Phase 2 enablement)', () => {
  it.runIf(() => reachable)('does not fire when no category is enabled (opt-in default)', async () => {
    await seedCatalogRule({ identity: 'test-a' });
    // no setCategories → enabled set empty
    const ids = await insertLogs([{ event_id: 4104 }]);
    const r = await evaluateCatalog(USER, { logIds: ids }, db);
    expect(r.created).toBe(0);
    expect(await sigmaAlerts('test-a')).toHaveLength(0);
  });

  it.runIf(() => reachable)('fires a catalog rule when its category is enabled, deduping by group key', async () => {
    await seedCatalogRule({ identity: 'test-a' });
    await setCategories(['generic']);
    const ids = await insertLogs([{ event_id: 4104, message: 'x' }, { event_id: 4104, message: 'y' }]);
    const r = await evaluateCatalog(USER, { logIds: ids }, db);
    expect(r.created).toBe(1);
    const alerts = await sigmaAlerts('test-a');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].sigma_identity).toBe('test-a');
    expect(alerts[0].count).toBe(2);
    expect(alerts[0].severity).toBe('high');
  });

  it.runIf(() => reachable)('an override disable suppresses a rule in an enabled category', async () => {
    await seedCatalogRule({ identity: 'test-a' });
    await setCategories(['generic']);
    await setOverride('test-a', false);
    const ids = await insertLogs([{ event_id: 4104 }]);
    const r = await evaluateCatalog(USER, { logIds: ids }, db);
    expect(r.created).toBe(0);
    expect(await sigmaAlerts('test-a')).toHaveLength(0);
  });

  it.runIf(() => reachable)('an override enable fires a rule whose category is NOT enabled', async () => {
    await seedCatalogRule({ identity: 'test-b', category: 'emerging_threats' });
    await setCategories(['generic']); // emerging not enabled
    await setOverride('test-b', true);
    const ids = await insertLogs([{ event_id: 4104 }]);
    const r = await evaluateCatalog(USER, { logIds: ids }, db);
    expect(r.created).toBe(1);
    expect(await sigmaAlerts('test-b')).toHaveLength(1);
  });

  it.runIf(() => reachable)('an override severity wins over the catalog severity', async () => {
    await seedCatalogRule({ identity: 'test-a', severity: 'high' });
    await setCategories(['generic']);
    await setOverride('test-a', null, 'critical');
    const ids = await insertLogs([{ event_id: 4104 }]);
    await evaluateCatalog(USER, { logIds: ids }, db);
    const alerts = await sigmaAlerts('test-a');
    expect(alerts[0].severity).toBe('critical');
  });

  it.runIf(() => reachable)('rejected and retired catalog rules never fire', async () => {
    await seedCatalogRule({ identity: 'test-rej', status: 'rejected' });
    await seedCatalogRule({ identity: 'test-ret' });
    await superPool.query("UPDATE sigma_rules SET retired = true WHERE identity = 'test-ret'");
    await setCategories(['generic']);
    const ids = await insertLogs([{ event_id: 4104 }]);
    const r = await evaluateCatalog(USER, { logIds: ids }, db);
    expect(r.created).toBe(0);
  });

  it.runIf(() => reachable)('prefilter skips a rule whose pinned event_id is absent from the batch', async () => {
    await seedCatalogRule({ identity: 'test-a', sigEventIds: [4104] });
    await setCategories(['generic']);
    const ids = await insertLogs([{ event_id: 5000 }]); // batch has no 4104
    const r = await evaluateCatalog(USER, { logIds: ids }, db);
    expect(r.created).toBe(0);
    expect(await sigmaAlerts('test-a')).toHaveLength(0);
  });

  it.runIf(() => reachable)('prefilter admits a rule whose pinned event_id is present in the batch', async () => {
    await seedCatalogRule({ identity: 'test-a', sigEventIds: [4104] });
    await setCategories(['generic']);
    const ids = await insertLogs([{ event_id: 4104 }]);
    const r = await evaluateCatalog(USER, { logIds: ids }, db);
    expect(r.created).toBe(1);
  });

  it.runIf(() => reachable)('an unpinned rule (empty signature) always runs regardless of batch', async () => {
    await seedCatalogRule({ identity: 'test-a' }); // no signature set → '{}'
    await setCategories(['generic']);
    const ids = await insertLogs([{ event_id: 4104 }]);
    const r = await evaluateCatalog(USER, { logIds: ids }, db);
    expect(r.created).toBe(1);
  });

  it.runIf(() => reachable)('a threshold catalog rule fires at N over the window', async () => {
    await seedCatalogRule({
      identity: 'test-thr',
      doc: { type: 'threshold', selection: [{ field: 'event_id', op: 'eq', value: 4625 }], group_by: 'source_ip', window: '1h', count: 3, severity: 'high' },
    });
    await setCategories(['generic']);
    const base = Date.now();
    const ids = await insertLogs([
      { event_id: 4625, source_ip: '7.7.7.7', timestamp: new Date(base) },
      { event_id: 4625, source_ip: '7.7.7.7', timestamp: new Date(base + 1000) },
      { event_id: 4625, source_ip: '7.7.7.7', timestamp: new Date(base + 2000) },
    ]);
    const r = await evaluateCatalog(USER, { logIds: ids }, db);
    expect(r.created).toBe(1);
    expect((await sigmaAlerts('test-thr'))[0].group_key).toBe('7.7.7.7');
  });
});
