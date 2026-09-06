// platform/server/services/correlation/compile.js
// Correlation rule compiler — turns a validated rule document into parameterized
// SQL against the partitioned `logs` table (XDR Phase 1, Task 1.2).
//
// SECURITY INVARIANT: every user-supplied value is a bound parameter. Field names
// are never taken from user input directly — they are resolved through the
// LOG_FIELDS whitelist to a fixed column identifier. No string interpolation of
// user values into SQL, ever. This mirrors ruleConditions() in detection.js.
//
// Each compiler returns { sql, params, statementTimeoutMs }. The runner (Task 1.4)
// sets `statement_timeout` per query and consumes the rows; alerts are written by
// the runner, not here.

import { LOG_FIELDS, parseWindowSeconds, normalizeToWhere } from '../../../shared/correlationRule.js';

// Columns whose SQL type is integer — text operators must cast them to ::text,
// and equality binds a numeric parameter.
const INTEGER_COLUMNS = new Set([
  'dest_port', 'event_id', 'logon_type', 'process_id', 'parent_process_id',
]);

// Hard row caps so a pathological rule cannot return unbounded results.
export const DEFAULT_ROW_LIMIT = 500;
export const DEFAULT_GROUP_LIMIT = 1000;
// Per-query statement timeout the runner applies (ms). A pathological rule must
// never stall ingest.
export const STATEMENT_TIMEOUT_MS = 5000;
// Default lookback for single_event when specific log ids are not supplied.
export const DEFAULT_LOOKBACK_SECONDS = 24 * 60 * 60;

function col(field) {
  const c = LOG_FIELDS[field];
  if (!c) throw new Error(`Unknown log field "${field}" — not in the whitelist.`);
  return c; // safe identifier from the fixed map
}

// A small parameter accumulator that returns $N placeholders.
function makeParams(initial = []) {
  const params = [...initial];
  return {
    params,
    add(value) {
      params.push(value);
      return `$${params.length}`;
    },
  };
}

// Generated text column carrying event text (message + raw) for keyword and
// contains search, backed by a pg_trgm GIN index (Phase 4).
const KEYWORD_COL = 'search_text';

// Compile a raw-field leaf ({raw, op, value}). The field name is bound as a
// parameter to the `->>` operator — never interpolated — so the injection
// posture matches first-class columns. The accessor is text, so ops behave like
// text operators. `exists` uses the jsonb key-test operator `?`.
function compileRawLeaf(cond, p, alias = 'l') {
  const nameParam = p.add(cond.raw);
  const acc = `(${alias}.raw_json ->> ${nameParam})`;

  // A `raw_json ->> $field` predicate cannot use any index (the GIN jsonb index
  // serves @>/?, not ->> text ops). But whenever the match requires the literal
  // `value` to appear in the field, that literal must also appear in search_text
  // (message || raw), which HAS a pg_trgm GIN index (idx_logs_search_text_trgm).
  // So we AND-prefix `search_text ILIKE '%value%'` as an index-usable, necessary
  // pre-condition: the planner narrows rows via the trigram index, then the exact
  // `->>` predicate confirms the value is in that specific field. Correctness is
  // unchanged (the exact predicate still runs; the prefilter is a superset — it
  // is case-insensitive even for `_cs`, which only admits extra rows the exact
  // predicate rejects). Trigram indexes need 3-grams, so only apply when the
  // literal is >= 3 chars; shorter literals fall back to today's seq scan (rare).
  const trigram = (value) => {
    const s = String(value);
    if (s.length < 3) return '';
    return `(${alias}.search_text ILIKE ${p.add(`%${s}%`)}) AND `;
  };

  switch (cond.op) {
    case 'eq':      return `${trigram(cond.value)}${acc} = ${p.add(String(cond.value))}`;
    case 'ne':      return `${acc} <> ${p.add(String(cond.value))}`;
    case 'contains':   return `${trigram(cond.value)}${acc} ILIKE ${p.add(`%${cond.value}%`)}`;
    case 'startswith': return `${trigram(cond.value)}${acc} ILIKE ${p.add(`${cond.value}%`)}`;
    case 'endswith':   return `${trigram(cond.value)}${acc} ILIKE ${p.add(`%${cond.value}`)}`;
    case 'contains_cs':   return `${trigram(cond.value)}${acc} LIKE ${p.add(`%${cond.value}%`)}`;
    case 'startswith_cs': return `${trigram(cond.value)}${acc} LIKE ${p.add(`${cond.value}%`)}`;
    case 'endswith_cs':   return `${trigram(cond.value)}${acc} LIKE ${p.add(`%${cond.value}`)}`;
    case 're':      return `${acc} ~* ${p.add(cond.value)}`;
    case 'gt':      return `${acc}::numeric > ${p.add(Number(cond.value))}`;
    case 'gte':     return `${acc}::numeric >= ${p.add(Number(cond.value))}`;
    case 'lt':      return `${acc}::numeric < ${p.add(Number(cond.value))}`;
    case 'lte':     return `${acc}::numeric <= ${p.add(Number(cond.value))}`;
    case 'cidr':    return `${acc}::inet <<= ${p.add(cond.value)}::inet`;
    case 'exists':  return cond.value === false ? `NOT (${alias}.raw_json ? ${nameParam})` : `${alias}.raw_json ? ${nameParam}`;
    default:
      throw new Error(`Unsupported operator "${cond.op}" on a raw field.`);
  }
}

// Compile one leaf condition ({field, op, value}) to a SQL boolean expression,
// binding every value. `alias` is the table/CTE alias.
function compileLeaf(cond, p, alias = 'l') {
  const c = col(cond.field);
  const colExpr = `${alias}.${c}`;
  const isInt = INTEGER_COLUMNS.has(c);
  const isTs = c === 'timestamp';
  switch (cond.op) {
    case 'eq':
      return isTs ? `${colExpr} = ${p.add(cond.value)}::timestamptz` : `${colExpr} = ${p.add(cond.value)}`;
    case 'ne':
      return isTs ? `${colExpr} <> ${p.add(cond.value)}::timestamptz` : `${colExpr} <> ${p.add(cond.value)}`;
    case 'gt':
      return `${colExpr} > ${p.add(cond.value)}${isTs ? '::timestamptz' : ''}`;
    case 'gte':
      return `${colExpr} >= ${p.add(cond.value)}${isTs ? '::timestamptz' : ''}`;
    case 'lt':
      return `${colExpr} < ${p.add(cond.value)}${isTs ? '::timestamptz' : ''}`;
    case 'lte':
      return `${colExpr} <= ${p.add(cond.value)}${isTs ? '::timestamptz' : ''}`;
    case 'contains':
      return `${isInt ? `${colExpr}::text` : colExpr} ILIKE ${p.add(`%${cond.value}%`)}`;
    case 'startswith':
      return `${isInt ? `${colExpr}::text` : colExpr} ILIKE ${p.add(`${cond.value}%`)}`;
    case 'endswith':
      return `${isInt ? `${colExpr}::text` : colExpr} ILIKE ${p.add(`%${cond.value}`)}`;
    case 'in':
      return `${colExpr} = ANY(${p.add(cond.value)})`;
    case 'contains_cs':
      return `${isInt ? `${colExpr}::text` : colExpr} LIKE ${p.add(`%${cond.value}%`)}`;
    case 'startswith_cs':
      return `${isInt ? `${colExpr}::text` : colExpr} LIKE ${p.add(`${cond.value}%`)}`;
    case 'endswith_cs':
      return `${isInt ? `${colExpr}::text` : colExpr} LIKE ${p.add(`%${cond.value}`)}`;
    case 're':
      // Case-insensitive POSIX regex. statement_timeout guards ReDoS; the pattern
      // length is capped at convert time.
      return `${isInt ? `${colExpr}::text` : colExpr} ~* ${p.add(cond.value)}`;
    case 'cidr':
      return `${colExpr}::inet <<= ${p.add(cond.value)}::inet`;
    case 'exists':
      return cond.value === false ? `${colExpr} IS NULL` : `${colExpr} IS NOT NULL`;
    case 'fieldref':
      // Column-to-column comparison; the target resolves through the whitelist to
      // a fixed identifier, so no user value is bound.
      return `${colExpr} = ${alias}.${col(cond.value)}`;
    default:
      throw new Error(`Unsupported operator "${cond.op}".`);
  }
}

// Compile a where-tree node to a parenthesized SQL boolean expression, binding
// every value. Handles all/any/not/leaf/keyword. SECURITY: values are always
// bound; field identifiers resolve through the LOG_FIELDS whitelist.
export function compileNode(node, p, alias = 'l') {
  if (node && Array.isArray(node.all)) {
    return `(${node.all.map((n) => compileNode(n, p, alias)).join(' AND ')})`;
  }
  if (node && Array.isArray(node.any)) {
    return `(${node.any.map((n) => compileNode(n, p, alias)).join(' OR ')})`;
  }
  if (node && node.not !== undefined) {
    return `(NOT (${compileNode(node.not, p, alias)}))`;
  }
  if (node && node.keyword !== undefined) {
    return `${alias}.${KEYWORD_COL} ILIKE ${p.add(`%${node.value}%`)}`;
  }
  if (node && node.raw !== undefined) {
    return compileRawLeaf(node, p, alias);
  }
  if (node && node.field !== undefined) {
    return compileLeaf(node, p, alias);
  }
  throw new Error('Unrecognized where-tree node.');
}

// Resolve a rule's condition (either a `where` tree or a flat `selection`) to a
// single top-level where node.
function whereOf(rule) {
  const w = normalizeToWhere(rule);
  if (!w) throw new Error('Rule has neither a where tree nor a selection.');
  return w;
}

// Compile a rule's condition to a list holding one combined SQL string, so call
// sites that do `[...compileConditions(...)].join(' AND ')` keep working.
function compileConditions(selectionOrRule, p, alias = 'l') {
  // Accept either a bare selection array (legacy call sites) or a where node.
  const node = Array.isArray(selectionOrRule) ? { all: selectionOrRule } : selectionOrRule;
  return [compileNode(node, p, alias)];
}

const SELECT_COLS = 'l.id, l.host, l.source_ip, l.username, l.event_id, l.message, l.timestamp';

function compileSingleEvent(rule, userId, opts) {
  const p = makeParams([userId]);
  const conds = ['l.user_id = $1', ...compileConditions(whereOf(rule), p)];
  if (opts.logIds) {
    conds.push(`l.id = ANY(${p.add(opts.logIds)})`);
  } else {
    conds.push(`l.timestamp > NOW() - make_interval(secs => ${p.add(opts.lookbackSeconds ?? DEFAULT_LOOKBACK_SECONDS)})`);
  }
  const limit = opts.limit ?? DEFAULT_ROW_LIMIT;
  const sql =
    `SELECT ${SELECT_COLS}\n` +
    `FROM logs l\n` +
    `WHERE ${conds.join(' AND ')}\n` +
    `LIMIT ${limit}`;
  return { sql, params: p.params, statementTimeoutMs: STATEMENT_TIMEOUT_MS };
}

function compileThreshold(rule, userId, opts) {
  const p = makeParams([userId]);
  const gcol = `l.${col(rule.group_by)}`;
  const windowSecs = parseWindowSeconds(rule.window);
  const conds = ['l.user_id = $1', ...compileConditions(whereOf(rule), p)];
  conds.push(`l.timestamp > NOW() - make_interval(secs => ${p.add(windowSecs)})`);
  if (opts.groupKeys) {
    conds.push(`${gcol} = ANY(${p.add(opts.groupKeys)})`);
  }
  const havingP = p.add(rule.count);
  const limit = opts.limit ?? DEFAULT_GROUP_LIMIT;
  const sql =
    `SELECT ${gcol} AS group_key, count(*)::int AS cnt, max(l.timestamp) AS last_ts,\n` +
    `  (array_agg(l.id ORDER BY l.timestamp DESC))[1] AS log_id,\n` +
    `  (array_agg(l.host ORDER BY l.timestamp DESC))[1] AS host,\n` +
    `  (array_agg(l.source_ip ORDER BY l.timestamp DESC))[1] AS source_ip,\n` +
    `  (array_agg(l.username ORDER BY l.timestamp DESC))[1] AS username,\n` +
    `  (array_agg(l.event_id ORDER BY l.timestamp DESC))[1] AS event_id,\n` +
    `  (array_agg(l.message ORDER BY l.timestamp DESC))[1] AS message\n` +
    `FROM logs l\n` +
    `WHERE ${conds.join(' AND ')}\n` +
    `GROUP BY ${gcol}\n` +
    `HAVING count(*) >= ${havingP}\n` +
    `LIMIT ${limit}`;
  return { sql, params: p.params, statementTimeoutMs: STATEMENT_TIMEOUT_MS };
}

// Sequence: consecutive events per join key, in step order, within the window.
// Uses LAG (no self-joins). LIMITATION: this matches events that are ADJACENT
// on the join key (no other matching-set events interleaved between steps). The
// stateful engine (Task 1.3/1.4) relaxes adjacency; the compiled query here is
// the fast candidate finder. `not_followed_by` is enforced by the runner, not here.
function compileSequence(rule, userId, opts) {
  const steps = rule.steps.map((s) => (s && s.where ? s.where : { all: (s && s.selection ? s.selection : s) }));
  const p = makeParams([userId]);
  const keycol = `l.${col(rule.join_on)}`;
  const windowSecs = parseWindowSeconds(rule.window);

  // CASE assigning each row its step index (1-based); NULL if it matches none.
  const stepCases = steps.map((sel, i) => {
    const conds = compileConditions(sel, p);
    return `WHEN ${conds.join(' AND ')} THEN ${i + 1}`;
  });
  // A row is relevant if it matches any step — reuse the same CASE via a subquery.
  const winParam = p.add(windowSecs);
  const anyStep = `(${steps.map((_, i) => `step = ${i + 1}`).join(' OR ')})`;

  // Build LAG chain requiring step N preceded by N-1, N-2, ... 1 on the key.
  const n = steps.length;
  const lagConds = [`s.step = ${n}`];
  for (let k = 1; k < n; k++) {
    lagConds.push(`LAG(s.step, ${k}) OVER w = ${n - k}`);
  }
  // Total elapsed from first to last step within the window.
  lagConds.push(`s.timestamp - LAG(s.timestamp, ${n - 1}) OVER w <= make_interval(secs => ${winParam})`);

  const limit = opts.limit ?? DEFAULT_ROW_LIMIT;
  const sql =
    `WITH tagged AS (\n` +
    `  SELECT l.id, l.host, l.source_ip, l.username, l.event_id, l.message, l.timestamp, ${keycol} AS seq_key,\n` +
    `    CASE ${stepCases.join(' ')} END AS step\n` +
    `  FROM logs l\n` +
    `  WHERE l.user_id = $1 AND l.timestamp > NOW() - make_interval(secs => ${winParam})\n` +
    `), stepped AS (\n` +
    `  SELECT * FROM tagged WHERE step IS NOT NULL\n` +
    `), seq AS (\n` +
    `  SELECT s.*,\n` +
    `    ${lagConds.slice(1).map((c, i) => `${c} AS chk_${i}`).join(',\n    ')}\n` +
    `  FROM stepped s\n` +
    `  WINDOW w AS (PARTITION BY s.seq_key ORDER BY s.timestamp)\n` +
    `)\n` +
    `SELECT seq_key AS group_key, id AS log_id, host, source_ip, username, event_id, message, timestamp AS last_ts\n` +
    `FROM seq\n` +
    `WHERE step = ${n}${n > 1 ? ' AND ' + lagConds.slice(1).map((_, i) => `chk_${i}`).join(' AND ') : ''}\n` +
    `LIMIT ${limit}`;
  // `anyStep` retained for readability of intent; the WHERE step IS NOT NULL filter
  // in `stepped` already restricts to matching rows.
  void anyStep;
  return { sql, params: p.params, statementTimeoutMs: STATEMENT_TIMEOUT_MS };
}

// Join: two selections over (typically different) sources correlated on a shared
// field within a window. CTE per selection, joined on the key with a time delta.
function compileJoin(rule, userId, opts) {
  const p = makeParams([userId]);
  const keycol = col(rule.join_on);
  const windowSecs = parseWindowSeconds(rule.window);

  const aConds = ['l.user_id = $1', `l.source = ${p.add(rule.left.source)}`, ...compileConditions(rule.left.where ? rule.left.where : { all: rule.left.selection }, p)];
  const aWin = p.add(windowSecs);
  aConds.push(`l.timestamp > NOW() - make_interval(secs => ${aWin})`);

  const bConds = ['l.user_id = $1', `l.source = ${p.add(rule.right.source)}`, ...compileConditions(rule.right.where ? rule.right.where : { all: rule.right.selection }, p)];
  const bWin = p.add(windowSecs);
  bConds.push(`l.timestamp > NOW() - make_interval(secs => ${bWin})`);

  const deltaP = p.add(windowSecs);
  const limit = opts.limit ?? DEFAULT_GROUP_LIMIT;
  const sql =
    `WITH a AS (\n` +
    `  SELECT l.id, l.${keycol} AS k, l.timestamp AS ts, l.host, l.source_ip, l.username, l.event_id, l.message\n` +
    `  FROM logs l WHERE ${aConds.join(' AND ')}\n` +
    `), b AS (\n` +
    `  SELECT l.${keycol} AS k, l.timestamp AS ts FROM logs l WHERE ${bConds.join(' AND ')}\n` +
    `)\n` +
    `SELECT DISTINCT ON (a.k) a.k AS group_key, a.id AS log_id, a.host, a.source_ip, a.username, a.event_id, a.message,\n` +
    `  greatest(a.ts, b.ts) AS last_ts\n` +
    `FROM a JOIN b ON a.k = b.k AND abs(extract(epoch FROM (b.ts - a.ts))) <= ${deltaP}\n` +
    `ORDER BY a.k, last_ts DESC\n` +
    `LIMIT ${limit}`;
  return { sql, params: p.params, statementTimeoutMs: STATEMENT_TIMEOUT_MS };
}

// Absence: an expected selection did NOT occur within the window.
//  * with group_by: keys seen in a baseline period but absent in the recent window.
//  * without group_by: a single sentinel row when the event is absent entirely.
function compileAbsence(rule, userId, opts) {
  const windowSecs = parseWindowSeconds(rule.window);
  const limit = opts.limit ?? DEFAULT_GROUP_LIMIT;

  if (rule.group_by) {
    const p = makeParams([userId]);
    const gcol = `l.${col(rule.group_by)}`;
    // baseline defaults to 24x the window, capped at 24h, so we only alert on
    // keys that normally appear.
    const baselineSecs = Math.min(windowSecs * 24, DEFAULT_LOOKBACK_SECONDS);
    const recentConds = ['l.user_id = $1', ...compileConditions(whereOf(rule), p)];
    const recentWin = p.add(windowSecs);
    recentConds.push(`l.timestamp > NOW() - make_interval(secs => ${recentWin})`);

    const baseConds = ['l.user_id = $1', ...compileConditions(whereOf(rule), p)];
    const baseStart = p.add(baselineSecs);
    const baseEnd = p.add(windowSecs);
    baseConds.push(`l.timestamp > NOW() - make_interval(secs => ${baseStart})`);
    baseConds.push(`l.timestamp <= NOW() - make_interval(secs => ${baseEnd})`);

    const sql =
      `WITH recent AS (\n` +
      `  SELECT DISTINCT ${gcol} AS k FROM logs l WHERE ${recentConds.join(' AND ')}\n` +
      `), baseline AS (\n` +
      `  SELECT DISTINCT ${gcol} AS k FROM logs l WHERE ${baseConds.join(' AND ')}\n` +
      `)\n` +
      `SELECT b.k AS group_key FROM baseline b LEFT JOIN recent r ON b.k = r.k\n` +
      `WHERE r.k IS NULL\n` +
      `LIMIT ${limit}`;
    return { sql, params: p.params, statementTimeoutMs: STATEMENT_TIMEOUT_MS };
  }

  const p = makeParams([userId]);
  const conds = ['l.user_id = $1', ...compileConditions(whereOf(rule), p)];
  const win = p.add(windowSecs);
  conds.push(`l.timestamp > NOW() - make_interval(secs => ${win})`);
  const sql =
    `SELECT 1 AS group_key\n` +
    `WHERE NOT EXISTS (\n` +
    `  SELECT 1 FROM logs l WHERE ${conds.join(' AND ')}\n` +
    `)`;
  return { sql, params: p.params, statementTimeoutMs: STATEMENT_TIMEOUT_MS };
}

// Compile a query returning individual logs matching a selection, with a fixed
// representative column set plus the group/join key aliased as `_key`. Used by the
// stateful engine (run.js) to feed events into state.js in timestamp order.
export function compileMatch(selection, userId, opts = {}) {
  const p = makeParams([userId]);
  const conds = ['l.user_id = $1', ...compileConditions(selection, p)];
  if (opts.logIds) {
    conds.push(`l.id = ANY(${p.add(opts.logIds)})`);
  } else {
    conds.push(`l.timestamp > NOW() - make_interval(secs => ${p.add(opts.windowSecs ?? DEFAULT_LOOKBACK_SECONDS)})`);
  }
  const keyExpr = opts.keyField ? `l.${col(opts.keyField)}` : 'NULL';
  const limit = opts.limit ?? DEFAULT_ROW_LIMIT;
  const sql =
    `SELECT l.id, l.timestamp, ${keyExpr} AS _key,\n` +
    `  l.host, l.source_ip, l.username, l.event_id, l.message\n` +
    `FROM logs l\n` +
    `WHERE ${conds.join(' AND ')}\n` +
    `ORDER BY l.timestamp ASC\n` +
    `LIMIT ${limit}`;
  return { sql, params: p.params, statementTimeoutMs: STATEMENT_TIMEOUT_MS };
}

const COMPILERS = {
  single_event: compileSingleEvent,
  threshold: compileThreshold,
  sequence: compileSequence,
  join: compileJoin,
  absence: compileAbsence,
};

// Compile a rule document to { sql, params, statementTimeoutMs }.
// The rule is assumed already validated by validateCorrelationRule().
export function compileRule(rule, userId, opts = {}) {
  if (!userId) throw new Error('compileRule requires a userId.');
  const fn = COMPILERS[rule.type];
  if (!fn) throw new Error(`Cannot compile unknown rule type "${rule.type}".`);
  return fn(rule, userId, opts);
}
