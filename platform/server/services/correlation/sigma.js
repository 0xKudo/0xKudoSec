// platform/server/services/correlation/sigma.js
// Sigma YAML → our correlation rule document (XDR Phase 1, Task 1.5).
//
// Philosophy: a meaningful fraction of community rules WILL reject, and that is
// correct. Every rejection throws SigmaUnsupportedError naming the exact construct
// so the user knows why — nothing is silently dropped or loosened.
//
// Supported today:
//   * detection with named selections combined by AND ("sel1 and sel2", "all of them")
//   * per-selection field maps (AND of fields); list values → `in`
//   * field modifiers |contains |startswith |endswith; bare values with leading/
//     trailing '*' wildcards → the matching text operator
//   * a single count aggregation ("... | count() by <field> > N" + timeframe) → threshold
//   * level → severity, tags (attack.tXXXX) → attack_techniques
//
// Rejected (named): or / not / 1 of / wildcard "all of sel*", keywords lists,
// modifiers other than contains/startswith/endswith (re, cidr, base64, all, lt, gt),
// list values with a text modifier (OR semantics), interior '*' globs, unmapped
// fields, multi-document YAML.

import yaml from 'js-yaml';
import { validateCorrelationRule, parseWindowSeconds } from '../../../shared/correlationRule.js';
import { validateTechniqueIds } from '../../../shared/attack.js';
import { mapSigmaField, resolveField, LOSSY_FIELDS } from './sigmaFieldMap.js';
import { parseCondition } from './sigmaCondition.js';
import { applyModifiers } from './sigmaModifiers.js';

// Modifiers whose conversion is a best-effort decode (documented approximate).
const APPROX_MODS = new Set(['base64', 'base64offset', 'wide', 'utf16', 'windash']);

// Conversion context for the in-flight sigmaToRule call. JS is single-threaded
// and conversion is synchronous, so a module-scoped flag is safe and avoids
// threading a ctx object through every helper. Set at the top of sigmaToRule.
let convApproximate = false;
function markApproximate() { convApproximate = true; }

export class SigmaUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SigmaUnsupportedError';
  }
}

const LEVEL_TO_SEVERITY = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  informational: 'info',
};

const SUPPORTED_MODIFIERS = new Set(['contains', 'startswith', 'endswith']);

function reject(msg) {
  throw new SigmaUnsupportedError(msg);
}

// attack.t1059.001 / attack.t1059 → T1059.001 / T1059 ; tactics/other tags ignored.
function tagsToTechniques(tags) {
  if (!Array.isArray(tags)) return [];
  const ids = [];
  for (const t of tags) {
    const m = /^attack\.(t\d{4}(?:\.\d{3})?)$/i.exec(String(t));
    if (m) ids.push(m[1].toUpperCase());
  }
  return validateTechniqueIds(ids).valid; // keep only known techniques
}

// Split "Field|mod1|mod2" → { name, mods: [...] }.
function parseFieldKey(key) {
  const parts = String(key).split('|');
  return { name: parts[0], mods: parts.slice(1) };
}

// Turn one Sigma value into a scalar op + value, honoring wildcards for bare eq.
function scalarCondition(field, mods, value) {
  if (mods.length > 1) reject(`field "${field}" uses chained modifiers, which are not supported.`);
  const mod = mods[0];

  if (mod) {
    if (!SUPPORTED_MODIFIERS.has(mod)) {
      reject(`modifier "|${mod}" on field "${field}" is not supported (only contains/startswith/endswith).`);
    }
    return { field, op: mod, value: String(value) };
  }

  // No modifier: interpret leading/trailing '*' wildcards.
  const s = String(value);
  const lead = s.startsWith('*');
  const trail = s.endsWith('*');
  const inner = s.slice(lead ? 1 : 0, trail ? s.length - 1 : s.length);
  if (inner.includes('*')) reject(`value "${s}" on field "${field}" uses an interior '*' wildcard, which is not supported.`);
  if (lead && trail) return { field, op: 'contains', value: inner };
  if (lead) return { field, op: 'endswith', value: inner };
  if (trail) return { field, op: 'startswith', value: inner };
  return { field, op: 'eq', value: parseMaybeNumber(value) };
}

// Strip a single leading and/or trailing '*' from a keyword (a keyword is a
// substring match, so surrounding wildcards are redundant).
function stripWildcards(s) {
  let out = s;
  if (out.startsWith('*')) out = out.slice(1);
  if (out.endsWith('*')) out = out.slice(0, -1);
  return out;
}

function parseMaybeNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  return v;
}

// Recursively re-key a leaf/subtree from a first-class `field` to a raw-json
// `raw` accessor. All leaves in one field's subtree share the same target.
function toRawTarget(node, rawName) {
  if (node.any) return { any: node.any.map((n) => toRawTarget(n, rawName)) };
  if (node.all) return { all: node.all.map((n) => toRawTarget(n, rawName)) };
  if (node.not) return { not: toRawTarget(node.not, rawName) };
  const { field, ...rest } = node; // drop the column key, add the raw name
  void field;
  return { raw: rawName, ...rest };
}

// Build a leaf (or subtree) for one resolved field/value with modifiers.
// `resolved` is { kind:'column', field } or { kind:'raw', name }. `fieldref`
// resolves its target through the field map; everything else defers to
// applyModifiers. A bare value (no modifiers) keeps the wildcard interpretation.
function leafFor(resolved, mods, sigmaField, value) {
  const key = resolved.kind === 'column' ? resolved.field : resolved.name;
  let node;
  if (!mods.length) {
    node = scalarCondition(key, mods, value);
  } else if (mods.includes('fieldref')) {
    const target = mapSigmaField(String(value));
    if (!target) reject(`field "${sigmaField}" uses |fieldref to "${value}", which is not a mapped field.`);
    node = applyModifiers(key, mods, target);
  } else {
    node = applyModifiers(key, mods, value);
  }
  return resolved.kind === 'raw' ? toRawTarget(node, resolved.name) : node;
}

// Convert one Sigma field map (an object of field:value pairs, ANDed) to the AND
// list of leaf/subtree conditions. Unmapped fields resolve to raw-json accessors
// rather than rejecting (Phase 4).
function mapToConditions(selMap) {
  const conds = [];
  for (const [rawKey, rawVal] of Object.entries(selMap)) {
    const { name: sigmaField, mods } = parseFieldKey(rawKey);
    const resolved = resolveField(sigmaField);
    if (!resolved) reject(`field "${sigmaField}" is not a valid field name.`);
    // Fidelity: raw accessors, lossy first-class mappings, and best-effort
    // modifier decodes all make the converted rule approximate.
    if (resolved.kind === 'raw' || LOSSY_FIELDS.has(sigmaField) || mods.some((m) => APPROX_MODS.has(m))) {
      markApproximate();
    }

    if (Array.isArray(rawVal)) {
      if (!mods.length) {
        if (resolved.kind === 'column') {
          conds.push({ field: resolved.field, op: 'in', value: rawVal.map(parseMaybeNumber) });
        } else {
          // No `in` over a raw accessor; expand to an OR of equalities.
          conds.push({ any: rawVal.map((v) => toRawTarget({ field: resolved.name, op: 'eq', value: v }, resolved.name)) });
        }
      } else if (mods.includes('all')) {
        // |all flips the list's default OR to AND.
        const inner = mods.filter((m) => m !== 'all');
        conds.push({ all: rawVal.map((v) => leafFor(resolved, inner, sigmaField, v)) });
      } else {
        // A list value with a match modifier is an OR of matches.
        conds.push({ any: rawVal.map((v) => leafFor(resolved, mods, sigmaField, v)) });
      }
    } else if (rawVal !== null && typeof rawVal === 'object') {
      reject(`field "${sigmaField}" has a nested map value, which is not supported.`);
    } else {
      conds.push(leafFor(resolved, mods, sigmaField, rawVal));
    }
  }
  return conds;
}

// Convert one named Sigma selection to a where-tree node.
//   * field map            → { all: [leaves] }
//   * list of field maps   → { any: [ {all:[...]}, ... ] }   (Sigma list = OR)
//   * bare list of scalars → rejected as keywords (Phase 2 adds keyword leaves)
function selectionToNode(name, selMap) {
  if (Array.isArray(selMap)) {
    if (!selMap.length) reject(`selection "${name}" is an empty list.`);
    const allMaps = selMap.every((el) => el !== null && typeof el === 'object' && !Array.isArray(el));
    if (allMaps) {
      return { any: selMap.map((m) => ({ all: mapToConditions(m) })) };
    }
    // A bare list of scalars is a Sigma "keywords" selection: an OR of substring
    // matches over the event text. Surrounding '*' wildcards are stripped (a
    // keyword is a substring match already).
    const allScalars = selMap.every((el) => el === null || typeof el !== 'object');
    if (allScalars) {
      return { any: selMap.map((v) => ({ keyword: true, value: stripWildcards(String(v)) })) };
    }
    reject(`selection "${name}" mixes maps and scalars in a list, which is not supported.`);
  }
  if (selMap === null || typeof selMap !== 'object') {
    reject(`selection "${name}" is not a field map.`);
  }
  return { all: mapToConditions(selMap) };
}

// Names of every named selection in a detection block (everything but the
// condition and timeframe keys).
function selectionNames(detection) {
  return Object.keys(detection).filter((k) => k !== 'condition' && k !== 'timeframe');
}

// Resolve an "of" pattern ("them", "sel*", or an exact name) to selection names.
function resolvePattern(pattern, detection) {
  const names = selectionNames(detection);
  if (pattern === 'them') return names;
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return names.filter((n) => n.startsWith(prefix));
  }
  return names.filter((n) => n === pattern);
}

// Walk the condition AST (from parseCondition) into a where-tree, resolving each
// selection reference to its subtree.
function astToWhere(ast, detection) {
  if (ast.ref !== undefined) {
    if (!detection[ast.ref]) reject(`condition references unknown selection "${ast.ref}".`);
    return selectionToNode(ast.ref, detection[ast.ref]);
  }
  if (ast.of !== undefined) {
    const { quant, pattern } = ast.of;
    const names = resolvePattern(pattern, detection);
    if (!names.length) reject(`condition "of ${pattern}" matches no selection.`);
    const nodes = names.map((n) => selectionToNode(n, detection[n]));
    if (quant === 'all') return { all: nodes };
    if (quant === '1') return { any: nodes };
    reject(`condition uses "${quant} of", an exact N-of quantifier, which is not supported.`);
  }
  if (ast.op === 'not') return { not: astToWhere(ast.node, detection) };
  if (ast.op === 'and') return { all: ast.nodes.map((n) => astToWhere(n, detection)) };
  if (ast.op === 'or') return { any: ast.nodes.map((n) => astToWhere(n, detection)) };
  reject('condition could not be interpreted.');
}

// Parse a count aggregation from the condition, if present.
// Supports "... | count() by <field> > N"  and  "... | count() > N".
function parseAggregation(condition) {
  const cond = String(condition);
  if (!cond.includes('|')) return null;
  const agg = cond.split('|').slice(1).join('|');
  const m = /count\(\)\s*(?:by\s+([A-Za-z0-9_]+)\s*)?(>=|>)\s*(\d+)/i.exec(agg);
  if (!m) reject(`aggregation "${agg.trim()}" is not a supported count() expression.`);
  const byField = m[1] || null;
  const op = m[2];
  let n = Number(m[3]);
  if (op === '>') n += 1; // "> N" ⇒ count >= N+1
  return { byField, count: n, baseCondition: cond.split('|')[0].trim() };
}

// Convert one Sigma DETECTION document (title + detection) to a rule, appending
// any warnings to `warnings`. Does not validate; the caller validates the final
// rule so correlation composition can post-process first.
function detectionDocToRule(doc, warnings) {
  if (!doc.title) reject('Sigma rule has no title.');
  if (!doc.detection || typeof doc.detection !== 'object') reject('Sigma rule has no detection block.');

  const severity = LEVEL_TO_SEVERITY[String(doc.level || '').toLowerCase()] || 'medium';
  const attack_techniques = tagsToTechniques(doc.tags);
  if (doc.logsource) warnings.push('logsource was ignored; matching is by fields only.');

  const detection = doc.detection;
  const agg = parseAggregation(detection.condition);

  // Build the where-tree from the condition (left of any aggregation pipe).
  const conditionForSelections = agg ? agg.baseCondition : detection.condition;
  if (!conditionForSelections) reject('detection has no condition.');
  const ast = parseCondition(conditionForSelections);
  const where = astToWhere(ast, detection);

  const common = {
    name: doc.title,
    description: doc.description || undefined,
    severity,
    enabled: true,
    attack_techniques,
  };

  if (agg) {
    const timeframe = detection.timeframe;
    if (!timeframe) reject('a count() aggregation requires a detection.timeframe.');
    if (parseWindowSeconds(String(timeframe)) === null) {
      reject(`timeframe "${timeframe}" is not a supported interval (use e.g. 5m, 1h).`);
    }
    if (!agg.byField) reject('count() without a "by <field>" grouping is not supported.');
    const groupBy = mapSigmaField(agg.byField);
    if (!groupBy) reject(`aggregation groups by "${agg.byField}", which is not a mapped field.`);
    return { ...common, type: 'threshold', where, group_by: groupBy, window: String(timeframe), count: agg.count };
  }
  return { ...common, type: 'single_event', where };
}

// Find a referenced detection doc by its Sigma `name` (correlation references
// use the rule's name field), falling back to id/title.
function findReferencedDoc(ref, detectionDocs) {
  const r = String(ref);
  return detectionDocs.find((d) => String(d.name) === r || String(d.id) === r || String(d.title) === r);
}

// Read the count threshold from a Sigma correlation `condition` block.
function correlationCount(condition) {
  if (!condition || typeof condition !== 'object') reject('correlation condition is missing.');
  if (typeof condition.gte === 'number') return condition.gte;
  if (typeof condition.gt === 'number') return condition.gt + 1;
  if (typeof condition.eq === 'number') return condition.eq;
  reject('correlation condition must use gte/gt/eq with a numeric count.');
}

// Map a correlation group-by (list or scalar) first entry to our field key.
function correlationGroupBy(groupBy) {
  const first = Array.isArray(groupBy) ? groupBy[0] : groupBy;
  if (!first) reject('correlation requires a group-by field.');
  const mapped = mapSigmaField(String(first));
  if (!mapped) reject(`correlation group-by "${first}" is not a mapped field.`);
  return mapped;
}

// Convert a Sigma `correlation:` document (composed with its referenced
// detection docs) into a stateful rule. Supports event_count → threshold and
// temporal_ordered → sequence; value_count and plain temporal are rejected,
// named.
function correlationDocToRule(corrDoc, detectionDocs, warnings) {
  const c = corrDoc.correlation;
  const type = String(c.type || '');
  const refs = Array.isArray(c.rules) ? c.rules : (c.rules ? [c.rules] : []);
  if (!refs.length) reject('correlation references no rules.');
  const timespan = c.timespan || c.timeframe;
  if (!timespan || parseWindowSeconds(String(timespan)) === null) {
    reject(`correlation timespan "${timespan}" is not a supported interval (use e.g. 5m, 1h).`);
  }

  const resolve = (ref) => {
    const d = findReferencedDoc(ref, detectionDocs);
    if (!d) reject(`correlation references unknown rule "${ref}".`);
    return detectionDocToRule(d, warnings);
  };

  const severity = LEVEL_TO_SEVERITY[String(corrDoc.level || '').toLowerCase()] || 'medium';
  const attack_techniques = tagsToTechniques(corrDoc.tags);
  const common = {
    name: corrDoc.title || 'Sigma correlation',
    description: corrDoc.description || undefined,
    severity,
    enabled: true,
    attack_techniques,
  };

  if (type === 'event_count') {
    if (refs.length !== 1) reject('event_count correlation must reference exactly one rule.');
    const base = resolve(refs[0]);
    return {
      ...common, type: 'threshold', where: base.where,
      group_by: correlationGroupBy(c['group-by'] || c.group_by),
      window: String(timespan), count: correlationCount(c.condition),
    };
  }

  if (type === 'temporal_ordered') {
    if (refs.length < 2) reject('temporal_ordered correlation must reference at least two rules.');
    const steps = refs.map((ref) => ({ where: resolve(ref).where }));
    return {
      ...common, type: 'sequence', steps,
      join_on: correlationGroupBy(c['group-by'] || c.group_by),
      window: String(timespan),
    };
  }

  if (type === 'temporal') reject('correlation type "temporal" (unordered) is not supported yet.');
  if (type === 'value_count') reject('correlation type "value_count" is not supported.');
  reject(`correlation type "${type}" is not supported.`);
}

// Convert Sigma YAML text to { rule, warnings }. Throws SigmaUnsupportedError.
// Handles multi-document files: detection docs plus an optional Sigma
// `correlation:` doc that composes them into a stateful rule.
export function sigmaToRule(yamlText) {
  let docs;
  try {
    docs = yaml.loadAll(yamlText);
  } catch (err) {
    reject(`invalid YAML: ${err.message}`);
  }
  const real = docs.filter((d) => d && typeof d === 'object');
  if (real.length === 0) reject('no YAML document found.');

  const detectionDocs = real.filter((d) => d.detection);
  const correlationDoc = real.find((d) => d.correlation && typeof d.correlation === 'object');
  const warnings = [];
  convApproximate = false; // reset per conversion

  // A Sigma correlation document composes named detection docs into a stateful
  // rule (Phase 5.2).
  if (correlationDoc) {
    const rule = correlationDocToRule(correlationDoc, detectionDocs, warnings);
    const { valid, errors } = validateCorrelationRule(rule);
    if (!valid) reject(`converted correlation rule failed validation: ${errors.join('; ')}`);
    return { rule, warnings, fidelity: convApproximate ? 'approximate' : 'exact' };
  }

  if (detectionDocs.length === 0) reject('no Sigma detection document found.');
  if (detectionDocs.length > 1) {
    warnings.push(`file has ${detectionDocs.length} rules; converted the first and ignored the additional Sigma document(s). Import the others separately.`);
  }

  const rule = detectionDocToRule(detectionDocs[0], warnings);
  const { valid, errors } = validateCorrelationRule(rule);
  if (!valid) reject(`converted rule failed validation: ${errors.join('; ')}`);
  return { rule, warnings, fidelity: convApproximate ? 'approximate' : 'exact' };
}
