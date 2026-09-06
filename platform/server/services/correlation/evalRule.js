// platform/server/services/correlation/evalRule.js
// D1 — in-memory rule evaluator (XDR Sigma catalog Phase D, step 1).
//
// matchesWhere(node, event) decides whether one log EVENT satisfies a rule's
// boolean `where` tree, in memory, with NO SQL. It must fire exactly the rows the
// SQL compiler (compile.js) fires. The per-operator semantics mirrored here are
// documented in docs/plans/2026-09-07-sigma-catalog-phase-d-matcher.md §3.
//
// An `event` is a logs row object: first-class LOG_FIELDS columns (event_id etc.
// as their native JS types), plus `raw_json` (the parsed jsonb object) and
// `search_text`. This module is pure: no DB, no network, no rule compilation.
// The compiled matcher (Phase D2) will call it after precomputing candidates.

// Integer columns — text operators coerce them to string, mirroring compile.js
// INTEGER_COLUMNS (::text casts) and its numeric equality/compare.
const INTEGER_COLUMNS = new Set([
  'dest_port', 'event_id', 'logon_type', 'process_id', 'parent_process_id',
]);

// Translate a Postgres LIKE/ILIKE pattern to an equivalent anchored RegExp.
// Postgres LIKE semantics: `%` = any sequence (incl. newlines), `_` = any single
// char (incl. newline), `\` escapes the next char (the default ESCAPE), everything
// else literal. The compiler wraps the raw value (e.g. `%value%`), so wildcards or
// backslashes inside the value are honored exactly as Postgres would.
function likeToRegExp(likePattern, caseInsensitive) {
  let out = '^';
  const s = String(likePattern);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      const next = i + 1 < s.length ? s[++i] : '\\';
      out += escapeRegexLiteral(next);
    } else if (c === '%') {
      out += '.*';
    } else if (c === '_') {
      out += '.';
    } else {
      out += escapeRegexLiteral(c);
    }
  }
  out += '$';
  // 's' (dotAll) so `.`/`.*` match newlines like LIKE; 'i' for ILIKE.
  return new RegExp(out, caseInsensitive ? 'is' : 's');
}

function escapeRegexLiteral(ch) {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? '\\' + ch : ch;
}

// Resolve the text value a leaf compares against, mirroring the SQL accessor.
//  * column leaf  → event[field]              (native type; null/undefined = SQL NULL)
//  * raw leaf     → event.raw_json ->> name   (text; absent key or JSON null = SQL NULL)
//  * keyword      → event.search_text
// Returns { present, value } where present=false means SQL NULL (only exists:false
// is satisfied by a NULL).
function resolveValue(leaf, event) {
  if (leaf.keyword !== undefined) {
    const v = event.search_text;
    return v == null ? { present: false } : { present: true, value: v };
  }
  if (leaf.raw !== undefined) {
    const raw = event.raw_json;
    if (raw == null || typeof raw !== 'object' || !Object.prototype.hasOwnProperty.call(raw, leaf.raw)) {
      return { present: false, hasKey: raw != null && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw || {}, leaf.raw) };
    }
    const v = raw[leaf.raw];
    if (v === null) return { present: false, hasKey: true }; // ->> of JSON null is SQL NULL, but key exists
    const text = (typeof v === 'object') ? JSON.stringify(v) : String(v);
    return { present: true, value: text, hasKey: true };
  }
  const v = event[leaf.field];
  return v == null ? { present: false } : { present: true, value: v };
}

// Is a leaf's field an integer column (text ops coerce, compares are numeric)?
function isIntLeaf(leaf) {
  return leaf.field !== undefined && INTEGER_COLUMNS.has(leaf.field);
}

// IPv4 "a.b.c.d" -> unsigned 32-bit int, or null if not IPv4.
function ipv4ToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim());
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const o = Number(m[i]);
    if (o > 255) return null;
    n = (n * 256) + o;
  }
  return n >>> 0;
}

// value <<= cidr for IPv4 (the common Sigma case). Non-IPv4 or malformed → false,
// matching the fact that such a row would not satisfy the inet predicate here.
function cidrMatch(value, cidr) {
  const [net, bitsRaw] = String(cidr).split('/');
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  const ipInt = ipv4ToInt(value);
  const netInt = ipv4ToInt(net);
  if (ipInt === null || netInt === null || !(bits >= 0 && bits <= 32)) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((netInt & mask) >>> 0);
}

// Evaluate one leaf against the event. Returns a boolean (SQL three-valued NULL
// collapses to false: a NULL column satisfies no predicate except exists:false).
function evalLeaf(leaf, event) {
  const op = leaf.op;
  const resolved = resolveValue(leaf, event);

  // `exists` is the only op meaningful when the value is SQL NULL / absent.
  if (op === 'exists') {
    // Raw exists uses the jsonb key-test (present even if the value is JSON null);
    // column exists is IS [NOT] NULL.
    const present = leaf.raw !== undefined ? !!resolved.hasKey : resolved.present;
    return leaf.value === false ? !present : present;
  }

  if (op === 'fieldref') {
    const a = resolveValue(leaf, event);
    const b = event[leaf.value];
    if (!a.present || b == null) return false;
    return String(a.value) === String(b);
  }

  if (!resolved.present) return false; // SQL NULL → predicate is NULL → row excluded
  const val = resolved.value;

  switch (op) {
    case 'eq':
      if (isIntLeaf(leaf)) return Number(val) === Number(leaf.value);
      if (leaf.field === 'timestamp') return new Date(val).getTime() === new Date(leaf.value).getTime();
      return String(val) === String(leaf.value);
    case 'ne':
      if (isIntLeaf(leaf)) return Number(val) !== Number(leaf.value);
      return String(val) !== String(leaf.value);
    case 'in': {
      const arr = Array.isArray(leaf.value) ? leaf.value : [];
      if (isIntLeaf(leaf)) return arr.some((x) => Number(x) === Number(val));
      return arr.some((x) => String(x) === String(val));
    }
    case 'contains':      return likeToRegExp(`%${leaf.value}%`, true).test(String(val));
    case 'startswith':    return likeToRegExp(`${leaf.value}%`, true).test(String(val));
    case 'endswith':      return likeToRegExp(`%${leaf.value}`, true).test(String(val));
    case 'contains_cs':   return likeToRegExp(`%${leaf.value}%`, false).test(String(val));
    case 'startswith_cs': return likeToRegExp(`${leaf.value}%`, false).test(String(val));
    case 'endswith_cs':   return likeToRegExp(`%${leaf.value}`, false).test(String(val));
    case 're':            return safeRegex(leaf.value).test(String(val));
    case 'cidr':          return cidrMatch(val, leaf.value);
    case 'gt':            return cmp(leaf, val) > 0;
    case 'gte':           return cmp(leaf, val) >= 0;
    case 'lt':            return cmp(leaf, val) < 0;
    case 'lte':           return cmp(leaf, val) <= 0;
    default:
      throw new Error(`evalLeaf: unsupported operator "${op}".`);
  }
}

// Comparison for gt/gte/lt/lte, mirroring the compiler's column types: numeric for
// integer columns, Date for timestamp, otherwise text (lexicographic) as Postgres
// does for text `>`.
function cmp(leaf, val) {
  if (isIntLeaf(leaf)) return Number(val) - Number(leaf.value);
  if (leaf.field === 'timestamp') return new Date(val).getTime() - new Date(leaf.value).getTime();
  const a = String(val); const b = String(leaf.value);
  return a < b ? -1 : a > b ? 1 : 0;
}

// Case-insensitive regex (~*). Phase D4 swaps this for re2 (linear-time) to remove
// the main-thread ReDoS risk; the JS RegExp here is adequate for D1 correctness.
function safeRegex(pattern) {
  return new RegExp(String(pattern), 'i');
}

// Evaluate a where-tree node. all=AND, any=OR, not=negation, else a leaf.
export function matchesWhere(node, event) {
  if (node == null) return false;
  if (Array.isArray(node.all)) return node.all.every((n) => matchesWhere(n, event));
  if (Array.isArray(node.any)) return node.any.some((n) => matchesWhere(n, event));
  if (node.not !== undefined) return !matchesWhere(node.not, event);
  // keyword: a case-insensitive substring on search_text (compileNode handles it
  // at the node level, with no `op`, as `search_text ILIKE %value%`).
  if (node.keyword !== undefined) {
    const st = event.search_text;
    if (st == null) return false;
    return likeToRegExp(`%${node.value}%`, true).test(String(st));
  }
  return evalLeaf(node, event);
}

export { evalLeaf, likeToRegExp, cidrMatch };
