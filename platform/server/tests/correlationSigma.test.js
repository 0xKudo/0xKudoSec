import { describe, it, expect } from 'vitest';
import { sigmaToRule, SigmaUnsupportedError } from '../services/correlation/sigma.js';

const wrap = (detection, extra = '') => `
title: Test Rule
level: high
tags:
  - attack.t1059.001
  - attack.execution
${extra}
detection:
${detection}
`;

describe('sigmaToRule — conversions', () => {
  it('converts a simple single-selection rule to single_event', () => {
    const { rule } = sigmaToRule(wrap(
      `  selection:
    EventID: 4104
    Image|endswith: \\powershell.exe
  condition: selection`));
    expect(rule.type).toBe('single_event');
    expect(rule.name).toBe('Test Rule');
    expect(rule.severity).toBe('high');
    expect(rule.where).toEqual({ all: [
      { field: 'event_id', op: 'eq', value: 4104 },
      { field: 'process_name', op: 'endswith', value: '\\powershell.exe' },
    ] });
  });

  it('reports exact fidelity for an all-first-class, representable rule', () => {
    const { fidelity } = sigmaToRule(wrap(`  selection:
    EventID: 4104
  condition: selection`));
    expect(fidelity).toBe('exact');
  });

  it('reports approximate fidelity when a raw accessor is used', () => {
    const { fidelity } = sigmaToRule(wrap(`  selection:
    ScriptBlockText|contains: x
  condition: selection`));
    expect(fidelity).toBe('approximate');
  });

  it('reports approximate fidelity for a best-effort base64 decode', () => {
    const { fidelity } = sigmaToRule(wrap(`  selection:
    CommandLine|base64|contains: whoami
  condition: selection`));
    expect(fidelity).toBe('approximate');
  });

  it('carries attack.tXXXX tags into attack_techniques (tactics ignored)', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    EventID: 1
  condition: selection`));
    expect(rule.attack_techniques).toContain('T1059.001');
    expect(rule.attack_techniques).not.toContain('execution');
  });

  it('interprets bare wildcards as text operators', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    CommandLine: '*Invoke-Mimikatz*'
  condition: selection`));
    expect(rule.where.all[0]).toEqual({ field: 'message', op: 'contains', value: 'Invoke-Mimikatz' });
  });

  it('maps a list value to the "in" operator', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    EventID:
      - 4624
      - 4625
  condition: selection`));
    expect(rule.where.all[0]).toEqual({ field: 'event_id', op: 'in', value: [4624, 4625] });
  });

  it('AND-combines multiple selections', () => {
    const { rule } = sigmaToRule(wrap(`  sel1:
    EventID: 1
  sel2:
    Image|endswith: \\rundll32.exe
  condition: sel1 and sel2`));
    expect(rule.where.all).toHaveLength(2);
    expect(rule.where.all[0]).toEqual({ all: [{ field: 'event_id', op: 'eq', value: 1 }] });
  });

  it('converts an OR condition into an any node', () => {
    const { rule } = sigmaToRule(wrap(`  sel1:
    EventID: 1
  sel2:
    EventID: 2
  condition: sel1 or sel2`));
    expect(rule.where).toEqual({ any: [
      { all: [{ field: 'event_id', op: 'eq', value: 1 }] },
      { all: [{ field: 'event_id', op: 'eq', value: 2 }] } ] });
  });

  it('converts "selection and not filter" into all + not', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    EventID: 1
  filter:
    Image|endswith: \\safe.exe
  condition: selection and not filter`));
    expect(rule.where.all[1]).toEqual({ not: { all: [
      { field: 'process_name', op: 'endswith', value: '\\safe.exe' } ] } });
  });

  it('converts "1 of sel_*" into an any of the matching selections', () => {
    const { rule } = sigmaToRule(wrap(`  sel_a:
    EventID: 1
  sel_b:
    EventID: 2
  other:
    EventID: 3
  condition: 1 of sel_*`));
    expect(rule.where).toEqual({ any: [
      { all: [{ field: 'event_id', op: 'eq', value: 1 }] },
      { all: [{ field: 'event_id', op: 'eq', value: 2 }] } ] });
  });

  it('converts "all of them" into an all over every selection', () => {
    const { rule } = sigmaToRule(wrap(`  sel_a:
    EventID: 1
  sel_b:
    EventID: 2
  condition: all of them`));
    expect(rule.where).toEqual({ all: [
      { all: [{ field: 'event_id', op: 'eq', value: 1 }] },
      { all: [{ field: 'event_id', op: 'eq', value: 2 }] } ] });
  });

  it('converts a list-of-maps selection into an any node', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    - EventID: 1
    - EventID: 2
  condition: selection`));
    expect(rule.where).toEqual({ any: [
      { all: [{ field: 'event_id', op: 'eq', value: 1 }] },
      { all: [{ field: 'event_id', op: 'eq', value: 2 }] } ] });
  });

  it('converts a count() aggregation + timeframe to threshold', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    EventID: 4625
  timeframe: 10m
  condition: selection | count() by SourceIp > 5`));
    expect(rule.type).toBe('threshold');
    expect(rule.group_by).toBe('source_ip');
    expect(rule.window).toBe('10m');
    expect(rule.count).toBe(6); // "> 5" ⇒ >= 6
  });

  it('surfaces a warning that logsource is ignored', () => {
    const { warnings } = sigmaToRule(wrap(`  selection:
    EventID: 1
  condition: selection`, 'logsource:\n  product: windows\n  category: process_creation'));
    expect(warnings.join(' ')).toMatch(/logsource was ignored/);
  });
});

describe('sigmaToRule — named rejections', () => {
  const expectReject = (yaml, re) => {
    expect(() => sigmaToRule(yaml)).toThrow(SigmaUnsupportedError);
    try { sigmaToRule(yaml); } catch (e) { expect(e.message).toMatch(re); }
  };

  it('maps an unmapped field to a raw-json leaf instead of rejecting', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    ScriptBlockText|contains: Invoke-Expression
  condition: selection`));
    expect(rule.where.all[0]).toEqual({ raw: 'ScriptBlockText', op: 'contains', value: 'Invoke-Expression' });
  });

  it('still rejects a syntactically invalid field name', () => {
    expectReject(wrap(`  selection:
    'bad field!': 5
  condition: selection`), /valid field name/);
  });

  it('converts a |re modifier to a regex leaf', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    CommandLine|re: '.*evil.*'
  condition: selection`));
    expect(rule.where.all[0]).toEqual({ field: 'message', op: 're', value: '.*evil.*' });
  });

  it('converts a |cidr modifier to a cidr leaf', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    SourceIp|cidr: 10.0.0.0/8
  condition: selection`));
    expect(rule.where.all[0]).toEqual({ field: 'source_ip', op: 'cidr', value: '10.0.0.0/8' });
  });

  it('converts a numeric |lt modifier', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    DestinationPort|lt: 1024
  condition: selection`));
    expect(rule.where.all[0]).toEqual({ field: 'dest_port', op: 'lt', value: 1024 });
  });

  it('converts a list value with a text modifier to an any of matches', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    CommandLine|contains:
      - foo
      - bar
  condition: selection`));
    expect(rule.where.all[0]).toEqual({ any: [
      { field: 'message', op: 'contains', value: 'foo' },
      { field: 'message', op: 'contains', value: 'bar' } ] });
  });

  it('converts a list value with |all to an AND of matches', () => {
    const { rule } = sigmaToRule(wrap(`  selection:
    CommandLine|contains|all:
      - foo
      - bar
  condition: selection`));
    expect(rule.where.all[0]).toEqual({ all: [
      { field: 'message', op: 'contains', value: 'foo' },
      { field: 'message', op: 'contains', value: 'bar' } ] });
  });

  it('converts a bare keyword list into an any of keyword leaves', () => {
    const { rule } = sigmaToRule(wrap(`  keywords:
    - mimikatz
    - sekurlsa
  condition: keywords`));
    expect(rule.where).toEqual({ any: [
      { keyword: true, value: 'mimikatz' },
      { keyword: true, value: 'sekurlsa' } ] });
  });

  it('strips surrounding wildcards from keyword entries', () => {
    const { rule } = sigmaToRule(wrap(`  keywords:
    - '*Invoke-Mimikatz*'
  condition: keywords`));
    expect(rule.where).toEqual({ any: [{ keyword: true, value: 'Invoke-Mimikatz' }] });
  });

  it('rejects interior wildcard globs', () => {
    expectReject(wrap(`  selection:
    Image: 'C:\\*\\evil.exe'
  condition: selection`), /interior '\*'/);
  });

  it('converts a Sigma event_count correlation doc to a threshold rule', () => {
    const { rule } = sigmaToRule(`title: Base
name: failed_logon
detection:
  sel:
    EventID: 4625
  condition: sel
---
title: Many failed logons
correlation:
  type: event_count
  rules:
    - failed_logon
  group-by:
    - TargetUserName
  timespan: 10m
  condition:
    gte: 5`);
    expect(rule.type).toBe('threshold');
    expect(rule.group_by).toBe('username');
    expect(rule.window).toBe('10m');
    expect(rule.count).toBe(5);
    expect(rule.where).toEqual({ all: [{ field: 'event_id', op: 'eq', value: 4625 }] });
  });

  it('converts a Sigma temporal_ordered correlation doc to a sequence rule', () => {
    const { rule } = sigmaToRule(`title: A
name: step_a
detection:
  sel:
    EventID: 1
  condition: sel
---
title: B
name: step_b
detection:
  sel:
    EventID: 2
  condition: sel
---
title: Ordered
correlation:
  type: temporal_ordered
  rules:
    - step_a
    - step_b
  group-by:
    - Computer
  timespan: 5m`);
    expect(rule.type).toBe('sequence');
    expect(rule.join_on).toBe('host');
    expect(rule.window).toBe('5m');
    expect(rule.steps).toHaveLength(2);
    expect(rule.steps[0].where).toEqual({ all: [{ field: 'event_id', op: 'eq', value: 1 }] });
    expect(rule.steps[1].where).toEqual({ all: [{ field: 'event_id', op: 'eq', value: 2 }] });
  });

  it('rejects a value_count correlation as unsupported, named', () => {
    expectReject(`title: A
name: r
detection:
  sel:
    EventID: 1
  condition: sel
---
title: VC
correlation:
  type: value_count
  rules: [r]
  group-by: [Computer]
  timespan: 5m
  condition:
    gte: 3
  field: TargetUserName`, /value_count/);
  });

  it('converts a multi-document file (first rule doc wins, extras warned)', () => {
    const { rule, warnings } = sigmaToRule(`title: A
detection:
  selection:
    EventID: 1
  condition: selection
---
title: B
detection:
  selection:
    EventID: 2
  condition: selection`);
    expect(rule.name).toBe('A');
    expect(rule.where).toEqual({ all: [{ field: 'event_id', op: 'eq', value: 1 }] });
    expect(warnings.join(' ')).toMatch(/additional Sigma document/i);
  });

  it('rejects a rule with no title', () => {
    expectReject(`detection:
  selection:
    EventID: 1
  condition: selection`, /no title/);
  });
});
