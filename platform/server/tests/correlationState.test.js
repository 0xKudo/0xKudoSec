import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import {
  advanceThresholdState,
  advanceSequenceState,
} from '../services/correlation/state.js';

// tests/setup.js globally mocks ../services/db.js so unit tests need no DB. The
// integration block below needs the REAL pool, obtained via vi.importActual and
// passed explicitly into the state helpers (which accept a `deps` override).

const iso = (msFromBase) => new Date(1_700_000_000_000 + msFromBase).toISOString();

// ---------- pure sliding-window logic (no DB) ----------

describe('advanceThresholdState', () => {
  it('counts events within the window and fires at N', () => {
    let s = advanceThresholdState([], iso(0), 600, 3);
    expect(s).toMatchObject({ counter: 1, fired: false });
    s = advanceThresholdState(s.times, iso(1000), 600, 3);
    expect(s).toMatchObject({ counter: 2, fired: false });
    s = advanceThresholdState(s.times, iso(2000), 600, 3);
    expect(s).toMatchObject({ counter: 3, fired: true });
  });

  it('drops timestamps that slid out of the window', () => {
    // window 10s; three events, then a 4th 11s after the first two expired them.
    let s = advanceThresholdState([], iso(0), 10, 3);
    s = advanceThresholdState(s.times, iso(1000), 10, 3);      // t=1s
    s = advanceThresholdState(s.times, iso(20000), 10, 3);     // t=20s -> older two expired
    expect(s.counter).toBe(1);
    expect(s.fired).toBe(false);
  });

  it('caps retained timestamps at count (payload stays bounded)', () => {
    let times = [];
    for (let i = 0; i < 10; i++) {
      const s = advanceThresholdState(times, iso(i * 100), 600, 3);
      times = s.times;
    }
    expect(times.length).toBeLessThanOrEqual(3);
  });

  it('reports a windowStart of null when empty', () => {
    const s = advanceThresholdState([], iso(0), 10, 1);
    expect(s.windowStart).toBe(iso(0));
    expect(s.fired).toBe(true); // count 1
  });
});

describe('advanceSequenceState', () => {
  const W = 300; // 5m

  it('advances step1 -> step2 within window and fires', () => {
    let s = advanceSequenceState(null, 1, iso(0), W, 2);
    expect(s).toMatchObject({ fired: false });
    expect(s.progress).toMatchObject({ step: 1 });
    s = advanceSequenceState(s.progress, 2, iso(1000), W, 2);
    expect(s.fired).toBe(true);
    expect(s.progress).toBeNull(); // cleared on completion
  });

  it('does not fire when the second step is out of window', () => {
    let s = advanceSequenceState(null, 1, iso(0), W, 2);
    s = advanceSequenceState(s.progress, 2, iso(400_000), W, 2); // 400s > 300s
    expect(s.fired).toBe(false);
    expect(s.progress).toBeNull(); // stale window cleared
  });

  it('ignores an out-of-order step', () => {
    // step 2 with no prior step 1 → no progress, no fire
    const s = advanceSequenceState(null, 2, iso(0), W, 2);
    expect(s).toEqual({ progress: null, fired: false });
  });

  it('handles a 3-step sequence', () => {
    let s = advanceSequenceState(null, 1, iso(0), W, 3);
    s = advanceSequenceState(s.progress, 2, iso(1000), W, 3);
    expect(s.fired).toBe(false);
    expect(s.progress).toMatchObject({ step: 2 });
    s = advanceSequenceState(s.progress, 3, iso(2000), W, 3);
    expect(s.fired).toBe(true);
  });

  it('restarts the sequence when step 1 reappears', () => {
    let s = advanceSequenceState({ step: 1, firstTs: iso(0) }, 1, iso(5000), W, 2);
    expect(s.progress).toMatchObject({ step: 1, firstTs: iso(5000) });
  });
});

// ---------- integration: persistence + restart-safety (real Docker DB) ----------

const SUPER_URL = 'postgresql://postgres:postgres@localhost:5433/cybertools';
const APP_URL = 'postgresql://cybertools_app:app@localhost:5433/cybertools';
const USER = 'test|corr-state';

let reachable = false;
let superPool;
let db;
let ruleId;

beforeAll(async () => {
  try {
    superPool = new pg.Pool({ connectionString: SUPER_URL });
    await superPool.query('SELECT 1');
    reachable = true;
  } catch {
    reachable = false;
    return;
  }
  await superPool.query('DELETE FROM correlation_rules WHERE user_id = $1', [USER]);
  const { rows } = await superPool.query(
    `INSERT INTO correlation_rules (user_id, name, rule)
     VALUES ($1, 'state-test', '{"type":"threshold"}'::jsonb) RETURNING id`,
    [USER],
  );
  ruleId = rows[0].id;
  process.env.DATABASE_URL = APP_URL;
  process.env.NODE_ENV = 'test';
  db = (await vi.importActual('../services/db.js')).default; // real pool, not the setup.js mock
});

afterAll(async () => {
  if (superPool) {
    // correlation_state rows cascade from the rule delete.
    await superPool.query('DELETE FROM correlation_rules WHERE user_id = $1', [USER]);
    await superPool.end();
  }
});

describe('recordThresholdEvent — persistence & restart-safety', () => {
  it.runIf(() => reachable)('accumulates across calls and fires at N, surviving a reload', async () => {
    const { recordThresholdEvent } = await import('../services/correlation/state.js');
    const key = '9.9.9.9';
    const base = Date.now();

    let r = await recordThresholdEvent(USER, ruleId, key, new Date(base), 600, 3, db);
    expect(r.fired).toBe(false);
    r = await recordThresholdEvent(USER, ruleId, key, new Date(base + 1000), 600, 3, db);
    expect(r.counter).toBe(2);

    // Simulate a restart: nothing in memory; the 3rd event must read prior state
    // back from correlation_state and fire at N.
    r = await recordThresholdEvent(USER, ruleId, key, new Date(base + 2000), 600, 3, db);
    expect(r.fired).toBe(true);
    expect(r.counter).toBe(3);

    // The row is persisted under RLS for this user.
    const { rows } = await db.withUserPool(USER).query(
      'SELECT counter, payload FROM correlation_state WHERE rule_id = $1 AND state_key = $2',
      [ruleId, key],
    );
    expect(rows[0].counter).toBe(3);
    expect(rows[0].payload.times).toHaveLength(3);
  });

  it.runIf(() => reachable)('pruneCorrelationState removes stale rows', async () => {
    const { pruneCorrelationState } = await import('../services/correlation/state.js');
    // Age the test rows well past the cutoff.
    await superPool.query(
      "UPDATE correlation_state SET updated_at = now() - interval '48 hours' WHERE user_id = $1",
      [USER],
    );
    // prune runs on the ops (BYPASSRLS) pool in prod; use the superuser pool as
    // its local stand-in (the app role would be RLS-blocked without context).
    const deleted = await pruneCorrelationState(25 * 3600, { getOpsPool: () => superPool });
    expect(deleted).toBeGreaterThanOrEqual(1);
    const { rows } = await superPool.query(
      'SELECT count(*)::int AS n FROM correlation_state WHERE user_id = $1', [USER],
    );
    expect(rows[0].n).toBe(0);
  });
});
