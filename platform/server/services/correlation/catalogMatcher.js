// platform/server/services/correlation/catalogMatcher.js
// D2 — compiled in-memory catalog matcher (XDR Sigma catalog Phase D).
//
// compileMatcher(rules) parses a set of single_event catalog rules ONCE into a
// dispatch structure so that matching an event is near O(matched-leaves), not
// O(rules). match(event) returns the SET of identities whose where-tree matches.
//
// How the dispatch stays correct:
//   * For each rule we take its AND-GUARANTEED high-selectivity field pins (the
//     same conservative walk Phase C uses in extractFieldSignature). Every such
//     pin is a NECESSARY substring of that field for the rule to match.
//   * We register one trigger field's needles per rule into a per-field
//     Aho-Corasick automaton. An event's field value is scanned once; the needles
//     that hit yield the candidate rules whose trigger fired.
//   * Rules with no field pin (keyword / message-only / OR-without-a-common-field /
//     regex-only) are the RESIDUAL set and are always fully evaluated.
//   * Every candidate (triggered + residual) is confirmed with the exact evaluator
//     matchesWhere(), so pruning can never produce a false positive, and — because
//     a pruned rule's trigger is necessary — never a false negative.
//
// The exact-vs-dispatch equivalence is locked by the parity invariant test.

import { extractFieldSignature, PREFILTER_FIELDS } from '../sigmaCron.js';
import { normalizeToWhere } from '../../../shared/correlationRule.js';
import db from '../db.js';
import { buildAhoCorasick } from './ahoCorasick.js';
import { matchesWhere } from './evalRule.js';

// Deterministic trigger-field preference: most selective first. Only these four
// columns are pinned by extractFieldSignature, so a rule with any field pin has
// at least one of them.
const FIELD_PRIORITY = ['process_name', 'file_path', 'registry_key', 'parent_process_name'];

// String operators whose value is a literal that must appear in the field text.
const STRING_OPS = new Set([
  'eq', 'contains', 'startswith', 'endswith', 'contains_cs', 'startswith_cs', 'endswith_cs',
]);

// A leaf/keyword needle that is guaranteed to appear in `search_text` (= message ||
// raw text) when it matches: a keyword node, or a `message`-column string op.
// (Raw leaves are deliberately excluded — raw values are JSON-escaped inside
// search_text, so their backslash-bearing needles are not a reliable substring.)
function searchNeedleOf(node) {
  if (node == null) return null;
  if (node.keyword !== undefined) {
    return typeof node.value === 'string' && node.value ? node.value.toLowerCase() : null;
  }
  if (node.field === 'message' && STRING_OPS.has(node.op) && typeof node.value === 'string' && node.value) {
    return node.value.toLowerCase();
  }
  return null;
}

// A necessary OR-set of search_text needles for a node: at least one member must
// appear in search_text for the node to be true. Returns null when no guarantee
// can be made (so the rule falls to the residual, always-evaluated set).
//   all  → the smallest non-null child group (any one child's necessity suffices)
//   any  → union of every branch's group, valid only if EVERY branch has one
//   not  → null;  leaf/keyword → its own needle
function triggerGroup(node) {
  if (node == null) return null;
  if (Array.isArray(node.all)) {
    let best = null;
    for (const child of node.all) {
      const g = triggerGroup(child);
      if (g && (!best || g.size < best.size)) best = g;
    }
    return best;
  }
  if (Array.isArray(node.any)) {
    const groups = node.any.map(triggerGroup);
    if (!groups.length || groups.some((g) => !g)) return null;
    const union = new Set();
    for (const g of groups) for (const n of g) union.add(n);
    return union;
  }
  if (node.not !== undefined) return null;
  const needle = searchNeedleOf(node);
  return needle ? new Set([needle]) : null;
}

export function compileMatcher(rules) {
  const compiled = rules.map((r) => ({ identity: r.identity, where: r.where }));

  // Per trigger field: an array of needles and a parallel array of rule indices
  // (a needle maps to exactly one rule; duplicates across rules get their own slot).
  const needlesByField = new Map(); // field -> { needles: string[], ruleIdx: number[] }
  const residual = []; // rule indices with no usable field trigger

  const register = (field, needle, i) => {
    const entry = needlesByField.get(field) || { needles: [], ruleIdx: [] };
    entry.needles.push(needle);
    entry.ruleIdx.push(i);
    needlesByField.set(field, entry);
  };

  compiled.forEach((rule, i) => {
    // 1) Prefer a precise high-selectivity field trigger (process_name/file_path/…).
    const { sig_terms } = extractFieldSignature({ where: rule.where });
    const triggerField = FIELD_PRIORITY.find((f) => sig_terms[f] && sig_terms[f].length);
    if (triggerField) {
      // Needles are already lowercased by extractFieldSignature; AC is a permissive
      // case-insensitive necessary-substring test, confirmed later by matchesWhere.
      for (const term of sig_terms[triggerField]) register(triggerField, term.v, i);
      return;
    }
    // 2) Otherwise route message/keyword rules through the search_text channel
    //    (search_text = message || raw), which covers the CommandLine-contains and
    //    keyword bulk that pins none of the four high-selectivity fields.
    const group = triggerGroup(rule.where);
    if (group && group.size) {
      for (const needle of group) register('search_text', needle, i);
      return;
    }
    // 3) No usable trigger (numeric-only, regex-only, exists-only, OR-without a
    //    common needle): always evaluate.
    residual.push(i);
  });

  // Build one automaton per trigger field.
  const acByField = new Map();
  for (const [field, entry] of needlesByField) {
    acByField.set(field, { ac: buildAhoCorasick(entry.needles), ruleIdx: entry.ruleIdx });
  }

  const stats = { total: compiled.length, residual: residual.length, lastCandidates: 0 };

  function match(event) {
    const candidates = new Set(residual);
    for (const [field, { ac, ruleIdx }] of acByField) {
      const raw = event[field];
      if (raw == null) continue;
      const hits = ac.search(String(raw).toLowerCase());
      for (const needleIdx of hits) candidates.add(ruleIdx[needleIdx]);
    }
    stats.lastCandidates = candidates.size;

    const out = new Set();
    for (const i of candidates) {
      if (matchesWhere(compiled[i].where, event)) out.add(compiled[i].identity);
    }
    return out;
  }

  return { match, stats };
}

// Re-exported for callers that want to know which fields the matcher can trigger on.
export { PREFILTER_FIELDS };

// ── Global cached matcher over the live catalog ───────────────────────────────
//
// The catalog is GLOBAL reference data, so the compiled matcher is process-global
// and shared across all users; per-user enablement is applied by the caller AFTER
// match(). getMatcher() rebuilds only when the catalog changes, keyed by a cheap
// version = (eligible rule count : latest updated_at). A build lock coalesces
// concurrent first-callers so the ~3.6k-rule parse happens once.

const ELIGIBLE = `convert_status = 'converted' AND retired = false AND rule IS NOT NULL AND rule->>'type' = 'single_event'`;

let cache = null;      // { version, built: { matcher, version } }
let building = null;   // in-flight { version, promise }

async function catalogVersion(pool) {
  const { rows } = await pool.query(
    `SELECT count(*)::text || ':' || coalesce(max(updated_at)::text, '') AS version
     FROM sigma_rules WHERE ${ELIGIBLE}`,
  );
  return rows[0].version;
}

async function buildFromCatalog(pool, version) {
  const { rows } = await pool.query(
    `SELECT identity, rule FROM sigma_rules WHERE ${ELIGIBLE}`,
  );
  const rules = [];
  for (const r of rows) {
    try {
      const where = normalizeToWhere(r.rule);
      if (where) rules.push({ identity: r.identity, where });
    } catch { /* skip a rule whose doc cannot normalize; it simply never fires */ }
  }
  return { matcher: compileMatcher(rules), version };
}

// Get the compiled matcher for the current catalog, building/caching as needed.
export async function getMatcher(deps = db) {
  const pool = deps.getPool();
  const version = await catalogVersion(pool);
  if (cache && cache.version === version) return cache.built;
  if (building && building.version === version) return building.promise;

  const promise = buildFromCatalog(pool, version).then((built) => {
    cache = { version, built };
    building = null;
    return built;
  }).catch((e) => { building = null; throw e; });
  building = { version, promise };
  return promise;
}

// Test hook: drop the cache so a test starts from a clean build.
export function _resetMatcherCache() { cache = null; building = null; }
