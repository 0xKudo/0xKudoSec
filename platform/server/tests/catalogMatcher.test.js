// D2: the compiled in-memory catalog matcher.
//
// compileMatcher(rules).match(event) returns the identities of every rule whose
// where-tree matches the event. The INVARIANT that guards every optimization
// inside (Aho-Corasick dispatch, candidate pruning) is: the result must always
// equal the naive `rules.filter(r => matchesWhere(r.where, event))`. If a prune
// ever drops a real hit, this test fails.

import { describe, it, expect } from 'vitest';
import { compileMatcher } from '../services/correlation/catalogMatcher.js';
import { matchesWhere } from '../services/correlation/evalRule.js';

function ev(overrides = {}) {
  return {
    source: 'fluent-bit', host: 'h', source_ip: '10.0.0.5', event_id: 1,
    severity: 'info', message: '', username: 'alice',
    process_name: null, parent_process_name: null, file_path: null, registry_key: null,
    search_text: '', raw_json: {}, timestamp: new Date(), ...overrides,
  };
}

const RULES = [
  { identity: 'r-proc', where: { all: [{ field: 'process_name', op: 'endswith', value: '\\mimikatz.exe' }] } },
  { identity: 'r-file', where: { all: [{ field: 'file_path', op: 'contains', value: '\\Temp\\' }] } },
  { identity: 'r-keyword', where: { keyword: true, value: 'invoke-expression' } }, // residual (no field pin)
  { identity: 'r-eventid', where: { all: [{ field: 'event_id', op: 'eq', value: 4104 }] } }, // residual
  { identity: 'r-and', where: { all: [
    { field: 'process_name', op: 'endswith', value: '\\rundll32.exe' },
    { field: 'event_id', op: 'eq', value: 1 },
  ] } },
  { identity: 'r-or', where: { any: [
    { field: 'process_name', op: 'endswith', value: '\\a.exe' },
    { field: 'process_name', op: 'endswith', value: '\\b.exe' },
  ] } },
];

function naive(rules, event) {
  return new Set(rules.filter((r) => matchesWhere(r.where, event)).map((r) => r.identity));
}

const EVENTS = [
  ev({ process_name: 'C:\\tools\\mimikatz.exe', event_id: 1 }),
  ev({ file_path: 'C:\\Users\\bob\\AppData\\Local\\Temp\\x.dll' }),
  ev({ search_text: 'powershell Invoke-Expression bad', event_id: 4104 }),
  ev({ process_name: 'C:\\Windows\\System32\\rundll32.exe', event_id: 1 }),
  ev({ process_name: 'C:\\x\\b.exe' }),
  ev({ process_name: 'C:\\Windows\\explorer.exe', event_id: 9999 }), // matches nothing
];

describe('compileMatcher.match — parity with naive evaluation', () => {
  const matcher = compileMatcher(RULES);

  for (const [i, event] of EVENTS.entries()) {
    it(`event ${i} matches exactly the naive rule set`, () => {
      expect(matcher.match(event)).toEqual(naive(RULES, event));
    });
  }

  it('a field-pinned rule whose field is absent from the event is pruned, not evaluated', () => {
    const m = compileMatcher(RULES);
    m.match(ev({ process_name: 'C:\\Windows\\explorer.exe', event_id: 9999 }));
    // Field- and keyword-pinned rules whose needle is absent are pruned; only the
    // residual set (here just r-eventid, a numeric eq with no string needle) is
    // always evaluated. r-keyword is now triggered via the search_text channel.
    expect(m.stats.total).toBe(6);
    expect(m.stats.residual).toBe(1);
    expect(m.stats.lastCandidates).toBeLessThan(6);
    expect(m.stats.lastCandidates).toBeGreaterThanOrEqual(1); // at least the residual set
  });

  it('returns an empty set when nothing matches', () => {
    expect(matcher.match(ev({ process_name: 'C:\\Windows\\explorer.exe', event_id: 9999 }))).toEqual(new Set());
  });
});

describe('residual reduction via message / keyword triggers', () => {
  const RULES2 = [
    { identity: 'r-msg', where: { all: [{ field: 'message', op: 'contains', value: '-enc ' }] } },
    { identity: 'r-kw', where: { keyword: true, value: 'invoke-expression' } },
    { identity: 'r-eid', where: { all: [{ field: 'event_id', op: 'eq', value: 4104 }] } }, // no string needle -> residual
    { identity: 'r-re', where: { all: [{ field: 'message', op: 're', value: 'foo.*bar' }] } }, // regex -> residual
  ];

  it('message/keyword rules become triggerable, shrinking the residual to only untriggerable rules', () => {
    const m = compileMatcher(RULES2);
    expect(m.stats.total).toBe(4);
    // Only r-eid (numeric eq) and r-re (regex) have no string needle to trigger on.
    expect(m.stats.residual).toBe(2);
  });

  it('a message/keyword rule whose needle is absent is pruned', () => {
    const m = compileMatcher(RULES2);
    const e = ev({ message: 'nothing here', search_text: 'nothing here', event_id: 9999, raw_json: {} });
    m.match(e);
    // Only the 2 residual rules should be fully evaluated (nothing triggered).
    expect(m.stats.lastCandidates).toBe(2);
  });

  it('still matches exactly the naive set for message/keyword/raw events', () => {
    const m = compileMatcher(RULES2);
    const events = [
      ev({ message: 'powershell -enc ABCD', search_text: 'powershell -enc ABCD' }),
      ev({ search_text: 'iex (Invoke-Expression) x', message: '' }),
      ev({ event_id: 4104, message: 'foo then bar', search_text: 'foo then bar' }),
      ev({ message: 'clean', search_text: 'clean', event_id: 1 }),
    ];
    for (const e of events) expect(m.match(e)).toEqual(naive(RULES2, e));
  });
});

describe('compileMatcher.match — randomized parity', () => {
  it('agrees with naive over many synthetic events', () => {
    const matcher = compileMatcher(RULES);
    const procs = [null, 'C:\\tools\\mimikatz.exe', 'C:\\x\\a.exe', 'C:\\x\\b.exe', 'C:\\Windows\\System32\\rundll32.exe', 'C:\\Windows\\explorer.exe'];
    const files = [null, 'C:\\Users\\bob\\AppData\\Local\\Temp\\x.dll', 'C:\\ok\\y.txt'];
    const kws = ['', 'invoke-expression here', 'nothing'];
    const eids = [1, 4104, 9999];
    for (const process_name of procs) for (const file_path of files) for (const search_text of kws) for (const event_id of eids) {
      const e = ev({ process_name, file_path, search_text, event_id });
      expect(matcher.match(e)).toEqual(naive(RULES, e));
    }
  });
});
