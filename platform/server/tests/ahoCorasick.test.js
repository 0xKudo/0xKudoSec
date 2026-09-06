// D2 primitive: Aho-Corasick multi-substring search.
//
// buildAhoCorasick(patterns).search(text) returns the SET of pattern indices whose
// pattern occurs as a substring of text — in one pass over text, regardless of how
// many patterns there are. This is what lets the matcher test thousands of
// `contains`/`eq` predicates for a field with a single scan of that field's value.

import { describe, it, expect } from 'vitest';
import { buildAhoCorasick } from '../services/correlation/ahoCorasick.js';

describe('buildAhoCorasick', () => {
  it('finds every pattern that occurs as a substring', () => {
    const ac = buildAhoCorasick(['he', 'she', 'his', 'hers']);
    // "ushers" contains she(1) at 1, he(0) at 2, hers(3) at 2
    expect(ac.search('ushers')).toEqual(new Set([1, 0, 3]));
  });

  it('returns an empty set when nothing matches', () => {
    const ac = buildAhoCorasick(['cmd.exe', 'powershell']);
    expect(ac.search('explorer runs')).toEqual(new Set());
  });

  it('reports a pattern that is a substring of another', () => {
    const ac = buildAhoCorasick(['mimi', 'mimikatz']);
    expect(ac.search('run mimikatz now')).toEqual(new Set([0, 1]));
    expect(ac.search('run mimias')).toEqual(new Set([0]));
  });

  it('matches an exact full-string pattern', () => {
    const ac = buildAhoCorasick(['4104']);
    expect(ac.search('4104')).toEqual(new Set([0]));
  });

  it('handles duplicate and empty inputs safely', () => {
    const ac = buildAhoCorasick(['a', 'a', 'b']);
    // both index 0 and 1 (the two 'a' patterns) fire; the caller maps indices to rules
    expect(ac.search('ab')).toEqual(new Set([0, 1, 2]));
    expect(buildAhoCorasick([]).search('anything')).toEqual(new Set());
    expect(ac.search('')).toEqual(new Set());
  });

  it('is a substring test, not anchored (matches anywhere)', () => {
    const ac = buildAhoCorasick(['\\cmd.exe']);
    expect(ac.search('c:\\windows\\system32\\cmd.exe')).toEqual(new Set([0]));
  });
});
