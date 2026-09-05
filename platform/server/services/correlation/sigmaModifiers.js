// platform/server/services/correlation/sigmaModifiers.js
// The Sigma value-modifier set, compiled to where-tree leaves. Pure: no DB, no
// field map. `applyModifiers(field, mods, value)` takes an ALREADY-MAPPED field
// key, the modifier list (in order), and the raw value, and returns a single
// leaf ({field, op, value}) or a subtree ({any:[...]}) when a modifier expands
// to several matches (windash, base64 variants). Genuinely unrepresentable
// modifiers throw SigmaUnsupportedError naming the construct.
//
// Fidelity: base64/base64offset/wide/utf16/windash decode a literal into byte or
// dash variants and match them as substrings over the event text. That is a
// best-effort approximation (documented) — flagged approximate by the caller.

import { SigmaUnsupportedError } from './sigma.js';

// Cap regex/pattern literals so a pathological pattern cannot blow up the query
// planner or invite ReDoS (statement_timeout is the backstop).
export const MAX_REGEX_LEN = 512;

function reject(msg) {
  throw new SigmaUnsupportedError(msg);
}

// Dash characters windash expands over: hyphen, slash, en dash, horizontal bar.
const DASH_VARIANTS = ['-', '/', '–', '―'];
const DASH_RE = /[-/–―]/g;

function toNumber(v) {
  if (typeof v === 'number') return v;
  const n = Number(v);
  if (!Number.isFinite(n)) reject(`value "${v}" is not numeric for a comparison modifier.`);
  return n;
}

// Produce the set of dash-normalized variants of a value.
function windashVariants(v) {
  const set = new Set();
  for (const d of DASH_VARIANTS) set.add(String(v).replace(DASH_RE, d));
  return [...set];
}

// base64 of the literal (approximate substring match over encoded event text).
function base64Variants(v, offset) {
  const s = String(v);
  if (!offset) return [Buffer.from(s, 'utf8').toString('base64')];
  // base64offset: the literal can appear at any of three byte alignments; emit
  // the three encodings with the alignment padding trimmed.
  const out = new Set();
  for (let pad = 0; pad < 3; pad++) {
    const b = Buffer.from(' '.repeat(pad) + s, 'utf8').toString('base64');
    // Trim the leading chars produced by the padding spaces.
    out.add(b.slice(pad ? pad + 1 : 0).replace(/=+$/, ''));
  }
  return [...out];
}

// utf16le (wide) of the literal, as a latin1 string so contains works on the
// rendered event text (approximate).
function wideVariants(v) {
  return [Buffer.from(String(v), 'utf16le').toString('latin1')];
}

const NUMERIC_OPS = { lt: 'lt', lte: 'lte', gt: 'gt', gte: 'gte', gtr: 'gt', lss: 'lt' };
const TEXT_OPS = new Set(['contains', 'startswith', 'endswith']);

// Build the final leaf(s) from a resolved op, cased flag, and one value.
function leaf(field, op, cased, value) {
  if (cased && TEXT_OPS.has(op)) return { field, op: `${op}_cs`, value: String(value) };
  return { field, op, value };
}

export function applyModifiers(field, mods, value) {
  const list = Array.isArray(mods) ? mods.slice() : [];

  // list-level modifiers are the caller's responsibility.
  if (list.includes('all')) reject('modifier "|all" applies to a list value and is handled at the selection level, not here.');
  if (list.includes('expand')) reject('modifier "|expand" needs a placeholder table, which does not exist yet; rule uses expand.');

  const cased = list.includes('cased');
  const rest = list.filter((m) => m !== 'cased');

  // Value transforms that expand to a variant set (matched by contains).
  let values = null;
  if (rest.includes('windash')) values = windashVariants(value);
  else if (rest.includes('base64')) values = base64Variants(value, false);
  else if (rest.includes('base64offset')) values = base64Variants(value, true);
  else if (rest.includes('wide') || rest.includes('utf16')) values = wideVariants(value);

  const transform = ['windash', 'base64', 'base64offset', 'wide', 'utf16'];
  const opMods = rest.filter((m) => !transform.includes(m));

  // Resolve the final match op from the remaining modifiers.
  let op = null;
  for (const m of opMods) {
    if (m === 're') { if (String(value).length > MAX_REGEX_LEN) reject(`regex pattern exceeds ${MAX_REGEX_LEN} characters.`); op = 're'; }
    else if (m === 'cidr') op = 'cidr';
    else if (m === 'exists') op = 'exists';
    else if (m === 'fieldref') op = 'fieldref';
    else if (NUMERIC_OPS[m]) op = NUMERIC_OPS[m];
    else if (TEXT_OPS.has(m)) op = m;
    else reject(`modifier "|${m}" on field is not supported.`);
  }

  // A value transform without an explicit match op defaults to contains.
  if (values) {
    const matchOp = op && TEXT_OPS.has(op) ? op : 'contains';
    if (values.length === 1) return leaf(field, matchOp, cased, values[0]);
    return { any: values.map((v) => leaf(field, matchOp, cased, v)) };
  }

  if (op === 're') return { field, op: 're', value: String(value) };
  if (op === 'cidr') return { field, op: 'cidr', value: String(value) };
  if (op === 'exists') return { field, op: 'exists', value: value === false ? false : true };
  if (op === 'fieldref') return { field, op: 'fieldref', value };
  if (op && NUMERIC_OPS[op] === undefined && !TEXT_OPS.has(op) && !['lt', 'lte', 'gt', 'gte'].includes(op)) {
    reject(`modifier resolved to an unsupported op "${op}".`);
  }
  if (['lt', 'lte', 'gt', 'gte'].includes(op)) return { field, op, value: toNumber(value) };
  if (op && TEXT_OPS.has(op)) return leaf(field, op, cased, String(value));

  // No modifier: plain equality (caller normally handles bare values, but keep a
  // safe default).
  return { field, op: 'eq', value };
}
