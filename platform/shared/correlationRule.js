// platform/shared/correlationRule.js
// Correlation rule document schema — the shared contract for XDR Phase 1.
// Shared by server (validation + compilation) and shell (rule editor UI).
//
// A rule document has one `type` discriminator with a per-type body plus a set
// of common fields. This module defines the shape, the field whitelist, and a
// validator that returns explicit, human-readable errors. It does NOT compile
// to SQL — that lives in platform/server/services/correlation/compile.js.
//
// Design constraints (docs/plans/2026-09-05-xdr-phase1-correlation.md Task 1.1):
//   * Selections may only reference whitelisted `logs` columns. Unknown field =
//     validation error, never a passthrough into SQL.
//   * Stateful windowed types must have a bounded window at or below a ceiling
//     (default 24h) so correlation_state cannot grow unbounded.

export const CORRELATION_RULE_TYPES = [
  'single_event',
  'threshold',
  'sequence',
  'join',
  'absence',
];

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

// Whitelisted selection fields → their `logs` column. Selections, group_by, and
// join_on may only reference keys of this map. The value is the physical column
// (identical here, but the indirection lets the compiler map safely).
export const LOG_FIELDS = {
  source: 'source',
  host: 'host',
  source_ip: 'source_ip',
  dest_ip: 'dest_ip',
  dest_port: 'dest_port',
  protocol: 'protocol',
  severity: 'severity',
  level: 'level',
  event_id: 'event_id',
  event_category: 'event_category',
  message: 'message',
  username: 'username',
  domain: 'domain',
  logon_type: 'logon_type',
  process_name: 'process_name',
  process_id: 'process_id',
  process_guid: 'process_guid',
  parent_process_name: 'parent_process_name',
  parent_process_id: 'parent_process_id',
  parent_process_guid: 'parent_process_guid',
  file_path: 'file_path',
  registry_key: 'registry_key',
  timestamp: 'timestamp',
};

// Free-text columns are unsuitable as a grouping/join key (high cardinality,
// meaningless equality). group_by / join_on must avoid these.
const NON_GROUPABLE_FIELDS = new Set(['message', 'raw']);

// Selection condition operators. Value semantics are enforced by the compiler;
// here we only validate that the operator is known and the value type is sane.
export const CONDITION_OPS = [
  'eq', 'ne', 'contains', 'startswith', 'endswith',
  'gt', 'gte', 'lt', 'lte', 'in',
  // Full Sigma modifier set (Phase 3).
  're', 'cidr', 'exists', 'fieldref',
  'contains_cs', 'startswith_cs', 'endswith_cs',
];

// Ops whose value is NOT a match literal: `exists` takes a boolean, `fieldref`
// takes another whitelisted field key.
const BOOLEAN_VALUE_OPS = new Set(['exists']);
const FIELDREF_OPS = new Set(['fieldref']);

// Windowed (stateful) types must carry a bounded window <= this ceiling.
export const WINDOW_CEILING_SECONDS = 24 * 60 * 60; // 24h

// Boolean condition tree caps. A rule must never nest past MAX_DEPTH or carry
// more than MAX_LEAVES total predicates, so one pathological Sigma condition
// cannot generate an unbounded SQL expression.
export const MAX_DEPTH = 12;
export const MAX_LEAVES = 256;

const WINDOW_UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 };

// Parse a window string like "30s", "10m", "1h", "2d" to seconds.
// Returns a positive integer, or null if the format is invalid.
export function parseWindowSeconds(window) {
  if (typeof window !== 'string') return null;
  const m = /^(\d+)\s*([smhd])$/.exec(window.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n * WINDOW_UNIT_SECONDS[m[2]];
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// A raw-field leaf reads logs.raw_json ->> name. The name is bound as a
// parameter (never interpolated), but we still require a conservative identifier.
const RAW_FIELD_RE = /^[A-Za-z0-9_.\-]+$/;

// Validate a single leaf condition ({field, op, value} or {raw, op, value}).
// Shared by the flat selection path and the where-tree path. Pushes messages
// prefixed by `at`.
function validateLeaf(cond, at, errors) {
  if (!isPlainObject(cond)) {
    errors.push(`${at} must be an object with field, op, and value.`);
    return;
  }
  if ('raw' in cond) {
    if (typeof cond.raw !== 'string' || !RAW_FIELD_RE.test(cond.raw)) {
      errors.push(`${at}.raw "${cond.raw}" is not a valid field name.`);
    }
  } else if (!LOG_FIELDS[cond.field]) {
    errors.push(`${at}.field "${cond.field}" is not a recognized log field.`);
  }
  if (!CONDITION_OPS.includes(cond.op)) {
    errors.push(`${at}.op "${cond.op}" is not a supported operator.`);
  }
  if (BOOLEAN_VALUE_OPS.has(cond.op)) {
    if (typeof cond.value !== 'boolean') errors.push(`${at}.value must be a boolean when op is "exists".`);
  } else if (FIELDREF_OPS.has(cond.op)) {
    if (!LOG_FIELDS[cond.value]) errors.push(`${at}.value "${cond.value}" must be a recognized log field for op "fieldref".`);
  } else if (cond.value === undefined || cond.value === null) {
    errors.push(`${at}.value is required.`);
  } else if (cond.op === 'in' && !Array.isArray(cond.value)) {
    errors.push(`${at}.value must be an array when op is "in".`);
  } else if (cond.op !== 'in' && Array.isArray(cond.value)) {
    errors.push(`${at}.value must be a scalar unless op is "in".`);
  }
}

// Validate a single selection (an array of {field, op, value} conditions, ANDed).
// Pushes human-readable messages onto `errors`, each prefixed by `label`.
function validateSelection(selection, label, errors) {
  if (!Array.isArray(selection) || selection.length === 0) {
    errors.push(`${label} must be a non-empty array of conditions.`);
    return;
  }
  selection.forEach((cond, i) => validateLeaf(cond, `${label}[${i}]`, errors));
}

// Resolve a rule's condition to a where-tree node: `doc.where` verbatim when
// present, else the flat `doc.selection` wrapped as an AND. Returns null when the
// document carries neither (the per-type validator reports the missing field).
export function normalizeToWhere(doc) {
  if (doc && doc.where !== undefined && doc.where !== null) return doc.where;
  if (doc && Array.isArray(doc.selection)) return { all: doc.selection };
  return null;
}

// Recursively validate a where-tree node. Enforces MAX_DEPTH / MAX_LEAVES. Leaf
// nodes are either {field, op, value} (via validateLeaf) or {keyword, value}.
export function validateWhere(node, label, errors, depth = 1, counter = { leaves: 0 }) {
  if (depth > MAX_DEPTH) {
    errors.push(`${label} exceeds the maximum nesting depth of ${MAX_DEPTH}.`);
    return;
  }
  if (!isPlainObject(node)) {
    errors.push(`${label} must be a condition node.`);
    return;
  }
  if ('all' in node || 'any' in node) {
    const key = 'all' in node ? 'all' : 'any';
    const arr = node[key];
    if (!Array.isArray(arr) || arr.length === 0) {
      errors.push(`${label}.${key} must be a non-empty array of condition nodes.`);
      return;
    }
    arr.forEach((child, i) => validateWhere(child, `${label}.${key}[${i}]`, errors, depth + 1, counter));
  } else if ('not' in node) {
    validateWhere(node.not, `${label}.not`, errors, depth + 1, counter);
  } else if ('keyword' in node) {
    if (++counter.leaves > MAX_LEAVES) errors.push(`${label} exceeds the maximum of ${MAX_LEAVES} predicates.`);
    if (typeof node.value !== 'string' || !node.value) {
      errors.push(`${label}.value (keyword) must be a non-empty string.`);
    }
  } else if ('field' in node || 'raw' in node) {
    if (++counter.leaves > MAX_LEAVES) errors.push(`${label} exceeds the maximum of ${MAX_LEAVES} predicates.`);
    validateLeaf(node, label, errors);
  } else {
    errors.push(`${label} is not a recognized condition node (expected all/any/not/field/keyword).`);
  }
}

// Validate the condition of a type that accepts either a flat `selection` or a
// `where` tree. Prefers `where` when present.
function validateCondition(doc, label, errors) {
  if (doc && doc.where !== undefined && doc.where !== null) {
    validateWhere(doc.where, label, errors);
  } else {
    validateSelection(doc ? doc.selection : undefined, label, errors);
  }
}

function validateGroupField(field, label, errors) {
  if (!field) {
    errors.push(`${label} is required.`);
    return;
  }
  if (!LOG_FIELDS[field]) {
    errors.push(`${label} "${field}" is not a recognized log field.`);
  } else if (NON_GROUPABLE_FIELDS.has(field)) {
    errors.push(`${label} "${field}" is a free-text field and cannot be used as a key.`);
  }
}

// Validate a bounded window; returns seconds or null (with an error pushed).
function validateWindow(window, label, errors) {
  if (window === undefined || window === null || window === '') {
    errors.push(`${label} is required and must be a bounded interval (e.g. "10m").`);
    return null;
  }
  const secs = parseWindowSeconds(window);
  if (secs === null) {
    errors.push(`${label} "${window}" is not a valid interval. Use a number + s/m/h/d, e.g. "10m".`);
    return null;
  }
  if (secs > WINDOW_CEILING_SECONDS) {
    errors.push(`${label} exceeds the ${WINDOW_CEILING_SECONDS / 3600}h ceiling; long windows produce unbounded state.`);
  }
  return secs;
}

// Validate a correlation rule document. Returns { valid: boolean, errors: string[] }.
export function validateCorrelationRule(doc) {
  const errors = [];

  if (!isPlainObject(doc)) {
    return { valid: false, errors: ['Rule must be an object.'] };
  }

  // --- common fields ---
  if (!doc.name || typeof doc.name !== 'string' || !doc.name.trim()) {
    errors.push('name is required.');
  }
  if (!CORRELATION_RULE_TYPES.includes(doc.type)) {
    errors.push(`type must be one of: ${CORRELATION_RULE_TYPES.join(', ')}.`);
  }
  if (doc.severity !== undefined && !SEVERITIES.includes(doc.severity)) {
    errors.push(`severity must be one of: ${SEVERITIES.join(', ')}.`);
  }
  if (doc.enabled !== undefined && typeof doc.enabled !== 'boolean') {
    errors.push('enabled must be a boolean.');
  }
  if (doc.attack_techniques !== undefined && !Array.isArray(doc.attack_techniques)) {
    errors.push('attack_techniques must be an array of technique IDs.');
  }
  if (doc.dedup_key !== undefined && doc.dedup_key !== null) {
    if (typeof doc.dedup_key !== 'string') errors.push('dedup_key must be a string.');
  }

  // --- per-type body ---
  switch (doc.type) {
    case 'single_event':
      validateCondition(doc, 'selection', errors);
      break;

    case 'threshold':
      validateCondition(doc, 'selection', errors);
      validateGroupField(doc.group_by, 'group_by', errors);
      validateWindow(doc.window, 'window', errors);
      if (!Number.isInteger(doc.count) || doc.count < 1) {
        errors.push('count must be an integer >= 1.');
      }
      break;

    case 'sequence': {
      if (!Array.isArray(doc.steps) || doc.steps.length < 2) {
        errors.push('sequence requires steps: an ordered array of at least two selections.');
      } else {
        doc.steps.forEach((step, i) => {
          if (isPlainObject(step) && step.where !== undefined && step.where !== null) {
            validateWhere(step.where, `steps[${i}].where`, errors);
          } else {
            const sel = isPlainObject(step) ? step.selection : step;
            validateSelection(sel, `steps[${i}].selection`, errors);
          }
        });
      }
      validateGroupField(doc.join_on, 'join_on', errors);
      validateWindow(doc.window, 'window', errors);
      if (doc.not_followed_by !== undefined) {
        const sel = isPlainObject(doc.not_followed_by)
          ? doc.not_followed_by.selection
          : doc.not_followed_by;
        validateSelection(sel, 'not_followed_by.selection', errors);
      }
      break;
    }

    case 'join': {
      const left = doc.left;
      const right = doc.right;
      if (!isPlainObject(left)) {
        errors.push('join requires a left object with a source and selection.');
      } else {
        if (!left.source || typeof left.source !== 'string') errors.push('left.source is required.');
        validateSelection(left.selection, 'left.selection', errors);
      }
      if (!isPlainObject(right)) {
        errors.push('join requires a right object with a source and selection.');
      } else {
        if (!right.source || typeof right.source !== 'string') errors.push('right.source is required.');
        validateSelection(right.selection, 'right.selection', errors);
      }
      validateGroupField(doc.join_on, 'join_on', errors);
      validateWindow(doc.window, 'window', errors);
      break;
    }

    case 'absence':
      validateCondition(doc, 'selection', errors);
      validateWindow(doc.window, 'window', errors);
      if (doc.group_by !== undefined) {
        validateGroupField(doc.group_by, 'group_by', errors);
      }
      break;

    default:
      // type error already reported above
      break;
  }

  return { valid: errors.length === 0, errors };
}
