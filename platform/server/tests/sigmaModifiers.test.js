import { describe, it, expect } from 'vitest';
import { applyModifiers } from '../services/correlation/sigmaModifiers.js';
import { SigmaUnsupportedError } from '../services/correlation/sigma.js';

describe('applyModifiers', () => {
  it('passes through contains/startswith/endswith', () => {
    expect(applyModifiers('message', ['contains'], 'x')).toEqual({ field: 'message', op: 'contains', value: 'x' });
    expect(applyModifiers('process_name', ['endswith'], '\\a.exe')).toEqual({ field: 'process_name', op: 'endswith', value: '\\a.exe' });
  });

  it('re modifier yields a regex leaf, capped in length', () => {
    expect(applyModifiers('message', ['re'], 'ab.*cd')).toEqual({ field: 'message', op: 're', value: 'ab.*cd' });
    expect(() => applyModifiers('message', ['re'], 'x'.repeat(600))).toThrow(/regex/i);
  });

  it('cidr modifier yields a cidr leaf', () => {
    expect(applyModifiers('source_ip', ['cidr'], '10.0.0.0/8')).toEqual({ field: 'source_ip', op: 'cidr', value: '10.0.0.0/8' });
  });

  it('numeric lt/lte/gt/gte coerce the value', () => {
    expect(applyModifiers('dest_port', ['lt'], '1024')).toEqual({ field: 'dest_port', op: 'lt', value: 1024 });
    expect(applyModifiers('dest_port', ['gte'], 443)).toEqual({ field: 'dest_port', op: 'gte', value: 443 });
  });

  it('gtr/lss are aliases of gt/lt', () => {
    expect(applyModifiers('dest_port', ['gtr'], '1')).toEqual({ field: 'dest_port', op: 'gt', value: 1 });
    expect(applyModifiers('dest_port', ['lss'], '2')).toEqual({ field: 'dest_port', op: 'lt', value: 2 });
  });

  it('windash expands dash variants into an any of contains', () => {
    const n = applyModifiers('message', ['windash', 'contains'], '-Enc');
    expect(n.any.map((l) => l.value)).toEqual(expect.arrayContaining(['-Enc', '/Enc']));
    expect(n.any.every((l) => l.op === 'contains' && l.field === 'message')).toBe(true);
  });

  it('cased makes contains/startswith/endswith case-sensitive', () => {
    expect(applyModifiers('message', ['contains', 'cased'], 'X')).toEqual({ field: 'message', op: 'contains_cs', value: 'X' });
  });

  it('exists yields an exists leaf', () => {
    expect(applyModifiers('file_path', ['exists'], true)).toEqual({ field: 'file_path', op: 'exists', value: true });
  });

  it('base64 decodes the literal into a contains over event text (approximate)', () => {
    const n = applyModifiers('message', ['base64', 'contains'], 'whoami');
    // "whoami" base64 is "d2hvYW1p"
    const values = (n.any || [n]).map((l) => l.value);
    expect(values).toContain('d2hvYW1p');
  });

  it('rejects "all" here (list-level AND is handled by the caller), naming it', () => {
    expect(() => applyModifiers('message', ['all'], 'x')).toThrow(SigmaUnsupportedError);
  });

  it('rejects expand until a placeholder table exists, naming it', () => {
    expect(() => applyModifiers('message', ['expand'], '%x%')).toThrow(/placeholder|expand/i);
  });

  it('rejects an unknown modifier, naming it', () => {
    expect(() => applyModifiers('message', ['bogus'], 'x')).toThrow(/bogus/);
  });
});
