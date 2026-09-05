import { describe, it, expect } from 'vitest';
import {
  CORRELATION_RULE_TYPES,
  WINDOW_CEILING_SECONDS,
  parseWindowSeconds,
  validateCorrelationRule,
  normalizeToWhere,
  MAX_DEPTH,
} from '../../shared/correlationRule.js';

// A minimal valid selection reused across cases.
const sel = [{ field: 'event_id', op: 'eq', value: 4104 }];

function base(overrides) {
  return { name: 'Test rule', severity: 'high', enabled: true, ...overrides };
}

describe('parseWindowSeconds', () => {
  it('parses s/m/h/d units', () => {
    expect(parseWindowSeconds('30s')).toBe(30);
    expect(parseWindowSeconds('10m')).toBe(600);
    expect(parseWindowSeconds('1h')).toBe(3600);
    expect(parseWindowSeconds('2d')).toBe(172800);
  });
  it('tolerates surrounding whitespace', () => {
    expect(parseWindowSeconds(' 5m ')).toBe(300);
  });
  it('rejects malformed, zero, negative, and non-string windows', () => {
    for (const bad of ['', '10', 'm', '0m', '-5m', '1w', '1.5h', 10, null, undefined]) {
      expect(parseWindowSeconds(bad)).toBeNull();
    }
  });
});

describe('where-node grammar', () => {
  it('accepts a where tree with any/all/not', () => {
    const doc = { name: 'x', type: 'single_event', where: {
      all: [ { field: 'event_id', op: 'eq', value: 1 },
              { any: [ { field: 'process_name', op: 'endswith', value: '\\a.exe' },
                       { not: { field: 'username', op: 'eq', value: 'svc' } } ] } ] } };
    expect(validateCorrelationRule(doc).valid).toBe(true);
  });

  it('normalizes a flat selection to an all node', () => {
    const w = normalizeToWhere({ selection: [{ field: 'event_id', op: 'eq', value: 1 }] });
    expect(w).toEqual({ all: [{ field: 'event_id', op: 'eq', value: 1 }] });
  });

  it('returns doc.where verbatim when present', () => {
    const where = { any: [{ field: 'event_id', op: 'eq', value: 1 }] };
    expect(normalizeToWhere({ where })).toBe(where);
  });

  it('rejects an unknown leaf field and a bad op inside the tree', () => {
    const doc = { name: 'x', type: 'single_event', where: { any: [
      { field: 'nope', op: 'eq', value: 1 }, { field: 'event_id', op: 'weird', value: 1 } ] } };
    const { valid, errors } = validateCorrelationRule(doc);
    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/nope/);
    expect(errors.join(' ')).toMatch(/weird/);
  });

  it('rejects a tree deeper than MAX_DEPTH', () => {
    let node = { field: 'event_id', op: 'eq', value: 1 };
    for (let i = 0; i < MAX_DEPTH + 2; i++) node = { all: [node] };
    const { valid, errors } = validateCorrelationRule({ name: 'x', type: 'single_event', where: node });
    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/depth/i);
  });

  it('rejects an empty all/any array', () => {
    const doc = { name: 'x', type: 'single_event', where: { all: [] } };
    expect(validateCorrelationRule(doc).valid).toBe(false);
  });

  it('accepts a keyword leaf', () => {
    const doc = { name: 'x', type: 'single_event', where: { any: [ { keyword: true, value: 'mimikatz' } ] } };
    expect(validateCorrelationRule(doc).valid).toBe(true);
  });

  it('accepts a raw-field leaf with a valid field name', () => {
    const doc = { name: 'x', type: 'single_event', where: { all: [
      { raw: 'ScriptBlockText', op: 'contains', value: 'Invoke-Expression' } ] } };
    expect(validateCorrelationRule(doc).valid).toBe(true);
  });

  it('rejects a raw-field leaf whose name is not a safe identifier', () => {
    const doc = { name: 'x', type: 'single_event', where: { all: [
      { raw: 'bad name!', op: 'contains', value: 'x' } ] } };
    expect(validateCorrelationRule(doc).valid).toBe(false);
  });
});

describe('validateCorrelationRule — valid documents', () => {
  it('accepts single_event', () => {
    const r = validateCorrelationRule(base({ type: 'single_event', selection: sel }));
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('accepts threshold', () => {
    const r = validateCorrelationRule(base({
      type: 'threshold', selection: sel, group_by: 'source_ip', window: '10m', count: 5,
    }));
    expect(r.valid).toBe(true);
  });

  it('accepts sequence with two steps', () => {
    const r = validateCorrelationRule(base({
      type: 'sequence',
      steps: [{ selection: sel }, { selection: [{ field: 'process_name', op: 'contains', value: 'mimikatz' }] }],
      join_on: 'host',
      window: '5m',
    }));
    expect(r.valid).toBe(true);
  });

  it('accepts sequence with not_followed_by', () => {
    const r = validateCorrelationRule(base({
      type: 'sequence',
      steps: [{ selection: sel }, { selection: sel }],
      join_on: 'host',
      window: '5m',
      not_followed_by: { selection: [{ field: 'event_id', op: 'eq', value: 4634 }] },
    }));
    expect(r.valid).toBe(true);
  });

  it('accepts join across two sources', () => {
    const r = validateCorrelationRule(base({
      type: 'join',
      left: { source: 'fluent-bit', selection: sel },
      right: { source: 'wordpress', selection: [{ field: 'source_ip', op: 'eq', value: '1.2.3.4' }] },
      join_on: 'source_ip',
      window: '1h',
    }));
    expect(r.valid).toBe(true);
  });

  it('accepts absence (with and without group_by)', () => {
    expect(validateCorrelationRule(base({
      type: 'absence', selection: sel, window: '1h',
    })).valid).toBe(true);
    expect(validateCorrelationRule(base({
      type: 'absence', selection: sel, window: '1h', group_by: 'host',
    })).valid).toBe(true);
  });

  it('accepts "in" operator with an array value', () => {
    const r = validateCorrelationRule(base({
      type: 'single_event',
      selection: [{ field: 'event_id', op: 'in', value: [4624, 4625] }],
    }));
    expect(r.valid).toBe(true);
  });
});

describe('validateCorrelationRule — common-field rejections', () => {
  it('rejects a non-object', () => {
    expect(validateCorrelationRule(null).valid).toBe(false);
    expect(validateCorrelationRule('x').valid).toBe(false);
  });
  it('requires a name', () => {
    const r = validateCorrelationRule({ type: 'single_event', selection: sel });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /name is required/.test(e))).toBe(true);
  });
  it('rejects an unknown type', () => {
    const r = validateCorrelationRule(base({ type: 'nope', selection: sel }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /type must be one of/.test(e))).toBe(true);
  });
  it('rejects a bad severity and non-boolean enabled', () => {
    const r = validateCorrelationRule(base({ type: 'single_event', selection: sel, severity: 'urgent', enabled: 'yes' }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /severity must be one of/.test(e))).toBe(true);
    expect(r.errors.some(e => /enabled must be a boolean/.test(e))).toBe(true);
  });
});

describe('validateCorrelationRule — selection rejections', () => {
  it('rejects an unknown field (no SQL passthrough)', () => {
    const r = validateCorrelationRule(base({
      type: 'single_event', selection: [{ field: 'evil; DROP TABLE logs', op: 'eq', value: 1 }],
    }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /is not a recognized log field/.test(e))).toBe(true);
  });
  it('rejects an unknown operator', () => {
    const r = validateCorrelationRule(base({
      type: 'single_event', selection: [{ field: 'event_id', op: 'regex', value: 1 }],
    }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /is not a supported operator/.test(e))).toBe(true);
  });
  it('rejects an empty selection', () => {
    const r = validateCorrelationRule(base({ type: 'single_event', selection: [] }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /non-empty array/.test(e))).toBe(true);
  });
  it('rejects a missing value and an "in" with a scalar value', () => {
    expect(validateCorrelationRule(base({
      type: 'single_event', selection: [{ field: 'event_id', op: 'eq' }],
    })).errors.some(e => /value is required/.test(e))).toBe(true);
    expect(validateCorrelationRule(base({
      type: 'single_event', selection: [{ field: 'event_id', op: 'in', value: 4624 }],
    })).errors.some(e => /must be an array when op is "in"/.test(e))).toBe(true);
  });
});

describe('validateCorrelationRule — window & per-type rejections', () => {
  it('rejects threshold missing group_by', () => {
    const r = validateCorrelationRule(base({ type: 'threshold', selection: sel, window: '10m', count: 5 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /group_by is required/.test(e))).toBe(true);
  });
  it('rejects a free-text field as group_by', () => {
    const r = validateCorrelationRule(base({ type: 'threshold', selection: sel, group_by: 'message', window: '10m', count: 5 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /free-text field and cannot be used as a key/.test(e))).toBe(true);
  });
  it('rejects threshold count < 1', () => {
    const r = validateCorrelationRule(base({ type: 'threshold', selection: sel, group_by: 'host', window: '10m', count: 0 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /count must be an integer/.test(e))).toBe(true);
  });
  it('rejects a missing window on a stateful type', () => {
    const r = validateCorrelationRule(base({ type: 'threshold', selection: sel, group_by: 'host', count: 5 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /window is required/.test(e))).toBe(true);
  });
  it('rejects an unbounded/invalid window', () => {
    const r = validateCorrelationRule(base({ type: 'threshold', selection: sel, group_by: 'host', window: 'forever', count: 5 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /not a valid interval/.test(e))).toBe(true);
  });
  it('rejects a window above the 24h ceiling', () => {
    const r = validateCorrelationRule(base({ type: 'threshold', selection: sel, group_by: 'host', window: '2d', count: 5 }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /ceiling/.test(e))).toBe(true);
    expect(WINDOW_CEILING_SECONDS).toBe(86400);
  });
  it('rejects sequence with fewer than two steps', () => {
    const r = validateCorrelationRule(base({ type: 'sequence', steps: [{ selection: sel }], join_on: 'host', window: '5m' }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /at least two selections/.test(e))).toBe(true);
  });
  it('rejects join missing a source', () => {
    const r = validateCorrelationRule(base({
      type: 'join',
      left: { selection: sel },
      right: { source: 'x', selection: sel },
      join_on: 'source_ip', window: '1h',
    }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /left\.source is required/.test(e))).toBe(true);
  });
});

describe('rule type set', () => {
  it('exposes the five planned types', () => {
    expect(CORRELATION_RULE_TYPES).toEqual([
      'single_event', 'threshold', 'sequence', 'join', 'absence',
    ]);
  });
});
