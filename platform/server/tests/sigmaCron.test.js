// Tests for the Sigma Rule Library catalog sync (Phase 1).
//
// Pure-core tests need no DB. The integration block exercises the real upsert /
// retire / status path against the Docker DB by injecting fake fetchers, so no
// network is touched. Per the HANDOFF gotcha, tests/setup.js globally mocks
// db.js — we pull the REAL module via vi.importActual and pass it as deps.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  classifyEntry,
  ruleIdentity,
  rejectBucket,
  entryToRow,
  buildCatalogRows,
  summarize,
  extractSignature,
  extractFieldSignature,
  catalogRuleMatchesProfile,
  ruleIsPrefilterable,
  CATEGORY_BY_FOLDER,
} from '../services/sigmaCron.js';

const CONVERTIBLE = `
title: Suspicious PowerShell
id: 11111111-1111-1111-1111-111111111111
level: high
logsource:
  product: windows
detection:
  sel:
    Image|endswith: \\\\powershell.exe
  condition: sel
tags:
  - attack.t1059.001
`;

// A rule the converter still rejects after Phase 4: an interior '*' wildcard is
// not representable (OR/NOT/of/keywords/modifiers/unmapped fields all convert
// now). Keeps this a genuine rejection for the sync coverage test.
const REJECTED_GLOB = `
title: Interior wildcard
id: 22222222-2222-2222-2222-222222222222
detection:
  sel:
    Image: 'C:\\*\\evil.exe'
  condition: sel
`;

describe('classifyEntry', () => {
  it('maps each SigmaHQ rule folder to a category', () => {
    expect(classifyEntry('sigma-master/rules/windows/x.yml')).toEqual({ category: 'generic', relPath: 'rules/windows/x.yml' });
    expect(classifyEntry('sigma-master/rules-threat-hunting/y.yaml').category).toBe('threat_hunting');
    expect(classifyEntry('sigma-master/rules-emerging-threats/z.yml').category).toBe('emerging_threats');
    expect(classifyEntry('sigma-master/rules-compliance/c.yml').category).toBe('compliance');
    expect(classifyEntry('sigma-master/rules-placeholder/p.yml').category).toBe('placeholder');
  });

  it('ignores non-rule folders, non-yaml files, and shallow paths', () => {
    expect(classifyEntry('sigma-master/README.md')).toBeNull();
    expect(classifyEntry('sigma-master/tests/foo.yml')).toBeNull();
    expect(classifyEntry('sigma-master/rules/windows/x.txt')).toBeNull();
    expect(classifyEntry('sigma-master/rules')).toBeNull();
  });

  it('covers exactly the five documented folders', () => {
    expect(Object.keys(CATEGORY_BY_FOLDER).sort()).toEqual(
      ['rules', 'rules-compliance', 'rules-emerging-threats', 'rules-placeholder', 'rules-threat-hunting']
    );
  });
});

describe('ruleIdentity', () => {
  it('uses the Sigma UUID when present (lowercased)', () => {
    expect(ruleIdentity('ABCDABCD-1111-2222-3333-444455556666', 'rules/x.yml'))
      .toBe('abcdabcd-1111-2222-3333-444455556666');
  });
  it('falls back to a path hash when the id is absent or not a UUID', () => {
    const a = ruleIdentity(null, 'rules/x.yml');
    const b = ruleIdentity('not-a-uuid', 'rules/x.yml');
    expect(a).toMatch(/^path:[0-9a-f]{40}$/);
    expect(b).toBe(a); // both fall back to the same path hash
    expect(ruleIdentity(null, 'rules/y.yml')).not.toBe(a);
  });
});

describe('rejectBucket', () => {
  it('buckets known reasons', () => {
    expect(rejectBucket('condition uses "or", which is not supported.')).toBe('condition_or');
    expect(rejectBucket('field "Foo" is not mapped to a known log field.')).toBe('unmapped_field');
    expect(rejectBucket('invalid YAML: bad indent')).toBe('invalid_yaml');
    expect(rejectBucket('something unexpected')).toBe('other');
  });
});

describe('entryToRow', () => {
  it('produces a converted row from a supported rule', () => {
    const row = entryToRow({ category: 'generic', relPath: 'rules/windows/ps.yml' }, CONVERTIBLE, 'sha1');
    expect(row.convert_status).toBe('converted');
    expect(row.identity).toBe('11111111-1111-1111-1111-111111111111');
    expect(row.sigma_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(row.title).toBe('Suspicious PowerShell');
    expect(row.severity).toBe('high');
    expect(row.rule).toBeTruthy();
    expect(row.attack_techniques).toContain('T1059.001');
    expect(row.reject_reason).toBeNull();
    expect(row.source_sha).toBe('sha1');
  });

  it('produces a rejected row (rule null, reason named) from an unsupported rule', () => {
    const row = entryToRow({ category: 'generic', relPath: 'rules/windows/glob.yml' }, REJECTED_GLOB, 'sha1');
    expect(row.convert_status).toBe('rejected');
    expect(row.rule).toBeNull();
    expect(row.severity).toBeNull();
    expect(row.reject_reason).toMatch(/interior/i);
    expect(row.title).toBe('Interior wildcard');
    expect(row.identity).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('records fidelity on converted rows', () => {
    const exact = entryToRow({ category: 'generic', relPath: 'rules/e.yml' }, CONVERTIBLE, 'sha1');
    expect(exact.fidelity).toBe('exact');
    const RAW = `
title: Raw field
id: 33333333-3333-3333-3333-333333333333
detection:
  sel:
    ScriptBlockText|contains: x
  condition: sel
`;
    const approx = entryToRow({ category: 'generic', relPath: 'rules/a.yml' }, RAW, 'sha1');
    expect(approx.fidelity).toBe('approximate');
  });

  it('leaves fidelity null on rejected rows', () => {
    const row = entryToRow({ category: 'generic', relPath: 'rules/g.yml' }, REJECTED_GLOB, 'sha1');
    expect(row.fidelity).toBeNull();
  });

  it('records invalid YAML as rejected without throwing', () => {
    const row = entryToRow({ category: 'generic', relPath: 'rules/bad.yml' }, ':\n  - [unclosed', 'sha1');
    expect(row.convert_status).toBe('rejected');
    expect(row.identity).toMatch(/^path:/); // no parseable id → path hash
  });
});

describe('buildCatalogRows + summarize', () => {
  it('dedupes by identity and rolls up counts', () => {
    const entries = [
      { classification: { category: 'generic', relPath: 'rules/a.yml' }, content: CONVERTIBLE },
      { classification: { category: 'generic', relPath: 'rules/b.yml' }, content: REJECTED_GLOB },
      // duplicate identity (same UUID as CONVERTIBLE) — last wins, not double-counted
      { classification: { category: 'threat_hunting', relPath: 'rules-threat-hunting/a.yml' }, content: CONVERTIBLE },
    ];
    const rows = buildCatalogRows(entries, 'shaX');
    expect(rows.length).toBe(2); // 3 entries, one duplicate identity
    const summary = summarize(rows);
    expect(summary.total).toBe(2);
    expect(summary.converted).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.reject_reasons.wildcard).toBe(1);
    expect(summary.fidelity.exact).toBe(1);
    expect(summary.fidelity.approximate || 0).toBe(0);
  });
});

describe('extractSignature', () => {
  it('pins event_id / event_category / source from eq and in only', () => {
    expect(extractSignature({ selection: [
      { field: 'event_id', op: 'eq', value: 4104 },
      { field: 'source', op: 'in', value: ['windows', 'sysmon'] },
      { field: 'event_category', op: 'eq', value: 'process_creation' },
    ] })).toEqual({ sig_event_ids: [4104], sig_categories: ['process_creation'], sig_sources: ['windows', 'sysmon'] });
  });

  it('does NOT pin non-exact operators (avoids false negatives)', () => {
    expect(extractSignature({ selection: [
      { field: 'event_id', op: 'gt', value: 4000 },
      { field: 'source', op: 'contains', value: 'win' },
      { field: 'message', op: 'contains', value: 'x' },
    ] })).toEqual({ sig_event_ids: [], sig_categories: [], sig_sources: [] });
  });

  it('returns empty signature for a rule pinning none of the three dimensions', () => {
    expect(extractSignature({ selection: [{ field: 'process_name', op: 'endswith', value: 'x.exe' }] }))
      .toEqual({ sig_event_ids: [], sig_categories: [], sig_sources: [] });
  });

  it('pins event_id from a flat all-tree', () => {
    expect(extractSignature({ where: { all: [{ field: 'event_id', op: 'eq', value: 1 }] } }).sig_event_ids)
      .toEqual([1]);
  });

  it('pins event_id when every top-level any-branch pins it', () => {
    const sig = extractSignature({ where: { any: [
      { all: [{ field: 'event_id', op: 'eq', value: 1 }] },
      { all: [{ field: 'event_id', op: 'eq', value: 2 }] } ] } });
    expect(sig.sig_event_ids.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('does NOT pin when one any-branch lacks the dimension', () => {
    const sig = extractSignature({ where: { any: [
      { all: [{ field: 'event_id', op: 'eq', value: 1 }] },
      { all: [{ field: 'process_name', op: 'eq', value: 'x' }] } ] } });
    expect(sig.sig_event_ids).toEqual([]);
  });

  it('a not-branch contributes no pins', () => {
    const sig = extractSignature({ where: { all: [
      { field: 'event_id', op: 'eq', value: 1 },
      { not: { field: 'source', op: 'eq', value: 'win' } } ] } });
    expect(sig.sig_event_ids).toEqual([1]);
    expect(sig.sig_sources).toEqual([]);
  });
});

// ── Phase C: high-selectivity field signature + window-pass prefilter ──────────

describe('extractFieldSignature', () => {
  it('pins a prefilterable field via endswith (lowercased term)', () => {
    const { sig_terms, has_regex } = extractFieldSignature({
      where: { all: [{ field: 'process_name', op: 'endswith', value: '\\BitLockerToGo.exe' }] },
    });
    expect(has_regex).toBe(false);
    expect(sig_terms).toEqual({ process_name: [{ op: 'endswith', v: '\\bitlockertogo.exe' }] });
  });

  it('pins process_name, parent_process_name, file_path, registry_key with eq/contains/startswith', () => {
    const { sig_terms } = extractFieldSignature({ where: { all: [
      { field: 'process_name', op: 'eq', value: 'evil.exe' },
      { field: 'parent_process_name', op: 'endswith', value: '\\services.exe' },
      { field: 'file_path', op: 'contains', value: '\\Temp\\' },
      { field: 'registry_key', op: 'startswith', value: 'HKLM\\Software\\Run' },
    ] } });
    expect(Object.keys(sig_terms).sort()).toEqual(['file_path', 'parent_process_name', 'process_name', 'registry_key']);
  });

  it('ignores non-prefilterable fields (message, username) and non-prefilterable ops (gt, re, cidr)', () => {
    const { sig_terms } = extractFieldSignature({ where: { all: [
      { field: 'message', op: 'contains', value: 'powershell' },
      { field: 'username', op: 'eq', value: 'admin' },
      { field: 'process_name', op: 're', value: '.*\\.exe' },
    ] } });
    expect(sig_terms).toEqual({});
  });

  it('flags has_regex when any leaf uses the re op, anywhere in the tree', () => {
    expect(extractFieldSignature({ where: { any: [
      { field: 'process_name', op: 'endswith', value: '\\x.exe' },
      { not: { field: 'message', op: 're', value: 'foo.*bar' } },
    ] } }).has_regex).toBe(true);
  });

  it('does NOT pin a field when only one any-branch requires it (no false skip)', () => {
    const { sig_terms } = extractFieldSignature({ where: { any: [
      { all: [{ field: 'process_name', op: 'endswith', value: '\\a.exe' }] },
      { all: [{ field: 'file_path', op: 'contains', value: '\\b\\' }] },
    ] } });
    // process_name is only required in one branch; the rule can still match via the
    // other branch, so it must not be treated as a guaranteed pin.
    expect(sig_terms).toEqual({});
  });

  it('a not-branch contributes no pins', () => {
    const { sig_terms } = extractFieldSignature({ where: { all: [
      { field: 'process_name', op: 'endswith', value: '\\a.exe' },
      { not: { field: 'file_path', op: 'contains', value: '\\b\\' } },
    ] } });
    expect(sig_terms).toEqual({ process_name: [{ op: 'endswith', v: '\\a.exe' }] });
  });
});

describe('catalogRuleMatchesProfile', () => {
  const profile = {
    process_name: ['c:\\windows\\bitlockertogo.exe', 'c:\\windows\\explorer.exe'],
    parent_process_name: ['c:\\windows\\services.exe'],
    file_path: ['c:\\users\\bob\\downloads\\a\\b\\payload.dll'],
    registry_key: [],
  };

  it('keeps a rule whose endswith term matches a recent value', () => {
    const terms = { process_name: [{ op: 'endswith', v: '\\bitlockertogo.exe' }] };
    expect(catalogRuleMatchesProfile(terms, profile)).toBe(true);
  });

  it('skips a rule whose only pinned field has no matching recent value', () => {
    const terms = { process_name: [{ op: 'endswith', v: '\\mimikatz.exe' }] };
    expect(catalogRuleMatchesProfile(terms, profile)).toBe(false);
  });

  it('requires EVERY pinned field to match (AND across fields)', () => {
    const terms = {
      process_name: [{ op: 'endswith', v: '\\bitlockertogo.exe' }], // present
      registry_key: [{ op: 'startswith', v: 'hklm\\software\\run' }], // absent (empty profile)
    };
    expect(catalogRuleMatchesProfile(terms, profile)).toBe(false);
  });

  it('matches if ANY alternative for a field is present (OR within a field)', () => {
    const terms = { process_name: [
      { op: 'endswith', v: '\\notpresent.exe' },
      { op: 'endswith', v: '\\explorer.exe' },
    ] };
    expect(catalogRuleMatchesProfile(terms, profile)).toBe(true);
  });

  it('an empty sig_terms is always a candidate (cannot be excluded)', () => {
    expect(catalogRuleMatchesProfile({}, profile)).toBe(true);
  });
});

describe('ruleIsPrefilterable', () => {
  it('true when the rule pins any coarse dimension', () => {
    expect(ruleIsPrefilterable({ sig_event_ids: [4104], sig_categories: [], sig_sources: [], sig_terms: {} })).toBe(true);
  });
  it('true when the rule pins a high-selectivity field', () => {
    expect(ruleIsPrefilterable({ sig_event_ids: [], sig_categories: [], sig_sources: [], sig_terms: { process_name: [{ op: 'eq', v: 'x' }] } })).toBe(true);
  });
  it('false when the rule pins nothing (unprefilterable)', () => {
    expect(ruleIsPrefilterable({ sig_event_ids: [], sig_categories: [], sig_sources: [], sig_terms: {} })).toBe(false);
  });
});

// ── Integration: real Docker DB, injected fetchers (no network) ────────────────

describe('syncSigmaCatalog (DB integration)', () => {
  let realDb;
  let sync;
  let status;
  let available = true;

  const ID_CONV = '11111111-1111-1111-1111-111111111111';
  const ID_REJ = '22222222-2222-2222-2222-222222222222';

  beforeAll(async () => {
    try {
      realDb = (await vi.importActual('../services/db.js')).default;
      ({ syncSigmaCatalog: sync, getSigmaSyncStatus: status } = await import('../services/sigmaCron.js'));
      // Probe the connection; clean only this test's own rows so a concurrent,
      // parallel catalog test (sigmaEnablement) is not disturbed. sync_state is
      // written only by this file, so it is safe to clear.
      await realDb.getPool().query('DELETE FROM sigma_rules WHERE identity = ANY($1)', [[ID_CONV, ID_REJ]]);
      await realDb.getPool().query('DELETE FROM sigma_sync_state');
    } catch (e) {
      available = false;
      console.warn('[sigmaCron.test] skipping DB integration:', e.message);
    }
  });

  afterAll(async () => {
    if (available && realDb) {
      await realDb.getPool().query('DELETE FROM sigma_rules WHERE identity = ANY($1)', [[ID_CONV, ID_REJ]]);
      await realDb.getPool().query('DELETE FROM sigma_sync_state');
    }
  });

  it('upserts a catalog, retires rows absent from a later sync, and reports status', async () => {
    if (!available) return;
    const entriesV1 = [
      { classification: { category: 'generic', relPath: 'rules/a.yml' }, content: CONVERTIBLE },
      { classification: { category: 'generic', relPath: 'rules/b.yml' }, content: REJECTED_GLOB },
    ];
    // Summary counts are computed from the synced entries (not the whole table),
    // so these are safe even if other rows exist from a parallel test.
    const r1 = await sync(realDb, { resolveRefFn: async () => 'r-test-v1', fetchSha: async () => 'sha-v1', fetchEntries: async () => entriesV1 });
    expect(r1.total).toBe(2);
    expect(r1.converted).toBe(1);

    // Second sync at a new SHA that no longer contains the rejected rule.
    const entriesV2 = [
      { classification: { category: 'generic', relPath: 'rules/a.yml' }, content: CONVERTIBLE },
    ];
    const r2 = await sync(realDb, { resolveRefFn: async () => 'r-test-v2', fetchSha: async () => 'sha-v2', fetchEntries: async () => entriesV2 });
    expect(r2.total).toBe(1);

    // Assert on THIS test's own rows (identity-scoped) rather than global counts.
    const { rows } = await realDb.getPool().query(
      'SELECT identity, retired, source_sha FROM sigma_rules WHERE identity = ANY($1) ORDER BY identity', [[ID_CONV, ID_REJ]]);
    const byId = Object.fromEntries(rows.map(r => [r.identity, r]));
    expect(byId[ID_CONV].retired).toBe(false);      // present in v2 → active
    expect(byId[ID_CONV].source_sha).toBe('sha-v2');
    expect(byId[ID_REJ].retired).toBe(true);        // fell out of v2 → retired

    const st = await status(realDb);
    expect(st.last_sync.source_sha).toBe('sha-v2');
    expect(st.last_sync.converted).toBe(1);
  });
});
