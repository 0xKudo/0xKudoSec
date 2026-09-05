import { describe, it, expect } from 'vitest';
import core from '../../electron/tools/intruder-core.js';

describe('intruder-core', () => {
  it('finds §placeholders§ across url/headers/body', () => {
    expect(core.parsePlaceholders('https://x/?id=§1§')).toEqual(['§1§']);
    expect(core.parsePlaceholders('no markers here')).toEqual([]);
    expect(core.parsePlaceholders('§a§ and §b§').length).toBe(2);
  });

  it('injects the payload into every marker', () => {
    expect(core.injectPayload('u=§x§&p=§x§', 'A')).toBe('u=A&p=A');
  });

  it('validates a good config and normalizes payloads', () => {
    const r = core.validateAttackConfig({
      method: 'post', urlTemplate: 'https://example.com/?q=§x§', payloads: [' a ', 'b', ''],
    });
    expect(r.ok).toBe(true);
    expect(r.method).toBe('POST');
    expect(r.payloads).toEqual(['a', 'b']); // trimmed, blanks dropped
  });

  it('rejects bad method, empty payloads, over-cap, no placeholder, bad url', () => {
    expect(core.validateAttackConfig({ method: 'BOGUS', urlTemplate: 'https://x/?q=§a§', payloads: ['a'] }).ok).toBe(false);
    expect(core.validateAttackConfig({ method: 'GET', urlTemplate: 'https://x/?q=§a§', payloads: [] }).ok).toBe(false);
    expect(core.validateAttackConfig({ method: 'GET', urlTemplate: 'https://x/?q=§a§', payloads: Array(501).fill('a') }).ok).toBe(false);
    expect(core.validateAttackConfig({ method: 'GET', urlTemplate: 'https://x/no-marker', payloads: ['a'] }).ok).toBe(false);
    expect(core.validateAttackConfig({ method: 'GET', urlTemplate: 'ftp://x/?q=§a§', payloads: ['a'] }).ok).toBe(false);
  });

  it('ACCEPTS loopback / RFC-1918 templates (local tool — SSRF block dropped)', () => {
    expect(core.validateAttackConfig({ method: 'GET', urlTemplate: 'http://127.0.0.1:8080/?q=§a§', payloads: ['a'] }).ok).toBe(true);
    expect(core.validateAttackConfig({ method: 'GET', urlTemplate: 'http://192.168.1.10/login?u=§a§', payloads: ['a'] }).ok).toBe(true);
  });

  it('computes summary baseline and flags anomalies', () => {
    const results = [
      { payload: 'a', status: 200, length: 100, error: null },
      { payload: 'b', status: 200, length: 102, error: null },
      { payload: 'c', status: 200, length: 100, error: null },
      { payload: 'd', status: 500, length: 20, error: null }, // status anomaly
      { payload: 'e', status: null, length: 0, error: 'timeout' }, // error anomaly
    ];
    const s = core.computeSummary(results);
    expect(s.baselineStatus).toBe(200);
    expect(s.flagged).toContain('d');
    expect(s.flagged).toContain('e');
    expect(s.flagged).not.toContain('a');
    expect(s.flaggedCount).toBe(s.flagged.length);
  });
});
