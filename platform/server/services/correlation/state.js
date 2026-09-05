// platform/server/services/correlation/state.js
// Sliding-window state for stateful correlation rule types (XDR Phase 1, Task 1.3).
//
// The pure advance* functions hold all the window logic and are DB-free (and so
// fully unit-testable + restart-safe: prev state is loaded from correlation_state,
// advanced, and written back). The record* helpers wrap them in an atomic
// per-user transaction (db.withUser) using SELECT ... FOR UPDATE + upsert.

import db from '../db.js';
import { WINDOW_CEILING_SECONDS } from '../../../shared/correlationRule.js';

function toMs(t) {
  return t instanceof Date ? t.getTime() : new Date(t).getTime();
}
function msToIso(ms) {
  return new Date(ms).toISOString();
}

// ---------- pure sliding-window logic ----------

// Threshold: keep only timestamps within `windowSecs` of the new event; since we
// only need to decide count >= N, keeping the N most-recent is exact and bounds
// payload size. Returns { times: ISO[] asc, counter, fired, windowStart: ISO|null }.
export function advanceThresholdState(prevTimes, eventTs, windowSecs, count) {
  const evMs = toMs(eventTs);
  const cutoff = evMs - windowSecs * 1000;
  const within = [...(prevTimes || []).map(toMs), evMs]
    .filter((ms) => ms > cutoff)
    .sort((a, b) => b - a) // desc
    .slice(0, count);      // most-recent N is sufficient to decide >= N
  const counter = within.length;
  return {
    times: within.slice().sort((a, b) => a - b).map(msToIso), // stored asc
    counter,
    fired: counter >= count,
    windowStart: counter ? msToIso(within[within.length - 1]) : null,
  };
}

// Sequence: advance a per-key state machine. `prevProgress` is { step, firstTs }
// or null. A step-1 event (re)starts the sequence; step k+1 advances only if we
// are at step k and still inside the window measured from firstTs. Reaching the
// final step fires and clears progress; an expired window clears stale progress.
// Returns { progress: {step, firstTs}|null, fired }.
export function advanceSequenceState(prevProgress, matchedStep, eventTs, windowSecs, numSteps) {
  const evMs = toMs(eventTs);
  const withinWindow = (p) => p && evMs - toMs(p.firstTs) <= windowSecs * 1000;

  if (matchedStep === 1) {
    return { progress: { step: 1, firstTs: msToIso(evMs) }, fired: numSteps === 1 };
  }
  if (prevProgress && matchedStep === prevProgress.step + 1 && withinWindow(prevProgress)) {
    if (matchedStep >= numSteps) return { progress: null, fired: true };
    return { progress: { step: matchedStep, firstTs: prevProgress.firstTs }, fired: false };
  }
  if (prevProgress && !withinWindow(prevProgress)) {
    return { progress: null, fired: false };
  }
  return { progress: prevProgress || null, fired: false };
}

// ---------- DB-backed helpers (atomic per (user,rule,key)) ----------

export async function recordThresholdEvent(userId, ruleId, stateKey, eventTs, windowSecs, count, deps = db) {
  return deps.withUser(userId, async (client) => {
    const { rows } = await client.query(
      'SELECT payload FROM correlation_state WHERE user_id = $1 AND rule_id = $2 AND state_key = $3 FOR UPDATE',
      [userId, ruleId, String(stateKey)],
    );
    const prevTimes = rows[0]?.payload?.times || [];
    const next = advanceThresholdState(prevTimes, eventTs, windowSecs, count);
    await client.query(
      `INSERT INTO correlation_state (user_id, rule_id, state_key, window_start, counter, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id, rule_id, state_key) DO UPDATE
       SET window_start = EXCLUDED.window_start, counter = EXCLUDED.counter,
           payload = EXCLUDED.payload, updated_at = now()`,
      [userId, ruleId, String(stateKey), next.windowStart, next.counter, JSON.stringify({ times: next.times })],
    );
    return next;
  });
}

export async function recordSequenceEvent(userId, ruleId, stateKey, matchedStep, eventTs, windowSecs, numSteps, deps = db) {
  return deps.withUser(userId, async (client) => {
    const { rows } = await client.query(
      'SELECT payload FROM correlation_state WHERE user_id = $1 AND rule_id = $2 AND state_key = $3 FOR UPDATE',
      [userId, ruleId, String(stateKey)],
    );
    const prevProgress = rows[0]?.payload?.progress || null;
    const next = advanceSequenceState(prevProgress, matchedStep, eventTs, windowSecs, numSteps);
    await client.query(
      `INSERT INTO correlation_state (user_id, rule_id, state_key, window_start, counter, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id, rule_id, state_key) DO UPDATE
       SET window_start = EXCLUDED.window_start, counter = EXCLUDED.counter,
           payload = EXCLUDED.payload, updated_at = now()`,
      [userId, ruleId, String(stateKey),
       next.progress ? next.progress.firstTs : null,
       next.progress ? next.progress.step : 0,
       JSON.stringify({ progress: next.progress })],
    );
    return next;
  });
}

// Expiry: no window can exceed the ceiling, so state untouched for ceiling + 1h
// is dead. Cross-user maintenance → ops pool (BYPASSRLS). Returns rows deleted.
export const STATE_MAX_AGE_SECONDS = WINDOW_CEILING_SECONDS + 3600;

export async function pruneCorrelationState(maxAgeSeconds = STATE_MAX_AGE_SECONDS, deps = db) {
  const pool = deps.getOpsPool();
  const { rowCount } = await pool.query(
    'DELETE FROM correlation_state WHERE updated_at < now() - make_interval(secs => $1)',
    [maxAgeSeconds],
  );
  return rowCount;
}
