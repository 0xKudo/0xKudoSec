import { describe, it, expect } from 'vitest';
import { parseCondition } from '../services/correlation/sigmaCondition.js';
import { SigmaUnsupportedError } from '../services/correlation/sigma.js';

describe('parseCondition', () => {
  it('parses a single selection reference', () => {
    expect(parseCondition('selection')).toEqual({ ref: 'selection' });
  });

  it('parses and/or with correct precedence (and binds tighter)', () => {
    expect(parseCondition('a and b or c')).toEqual({ op: 'or', nodes: [
      { op: 'and', nodes: [{ ref: 'a' }, { ref: 'b' }] }, { ref: 'c' } ] });
  });

  it('parses not with the highest precedence', () => {
    expect(parseCondition('a and not b')).toEqual({ op: 'and', nodes: [
      { ref: 'a' }, { op: 'not', node: { ref: 'b' } } ] });
  });

  it('honors parentheses', () => {
    expect(parseCondition('(a or b) and c')).toEqual({ op: 'and', nodes: [
      { op: 'or', nodes: [{ ref: 'a' }, { ref: 'b' }] }, { ref: 'c' } ] });
  });

  it('parses "1 of selection_*" and "all of them"', () => {
    expect(parseCondition('1 of selection_*')).toEqual({ of: { quant: '1', pattern: 'selection_*' } });
    expect(parseCondition('all of them')).toEqual({ of: { quant: 'all', pattern: 'them' } });
  });

  it('parses an integer quantifier "2 of them"', () => {
    expect(parseCondition('2 of them')).toEqual({ of: { quant: 2, pattern: 'them' } });
  });

  it('parses "all of sel*" combined with and/not', () => {
    expect(parseCondition('all of sel* and not filter')).toEqual({ op: 'and', nodes: [
      { of: { quant: 'all', pattern: 'sel*' } }, { op: 'not', node: { ref: 'filter' } } ] });
  });

  it('flattens a chain of the same operator', () => {
    expect(parseCondition('a and b and c')).toEqual({ op: 'and', nodes: [
      { ref: 'a' }, { ref: 'b' }, { ref: 'c' } ] });
  });

  it('throws SigmaUnsupportedError on an empty condition', () => {
    expect(() => parseCondition('')).toThrow(SigmaUnsupportedError);
  });

  it('throws SigmaUnsupportedError on an unbalanced paren', () => {
    expect(() => parseCondition('(a and b')).toThrow(SigmaUnsupportedError);
  });
});
