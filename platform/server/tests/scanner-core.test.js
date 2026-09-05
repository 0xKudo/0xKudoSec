import { describe, it, expect } from 'vitest';
import core from '../../electron/tools/scanner-core.js';

// Small headers-like helper (mimics fetch Response headers .get()).
const H = (map) => ({ get: (k) => map[k.toLowerCase()] ?? null });

describe('scanner-core', () => {
  it('rejects active scans without authorization (the safety gate)', () => {
    expect(core.validateScanConfig({ url: 'https://x.com', activeMode: true, authorized: false }).ok).toBe(false);
    expect(core.validateScanConfig({ url: 'https://x.com', activeMode: true, authorized: true }).ok).toBe(true);
    // passive doesn't need authorization
    expect(core.validateScanConfig({ url: 'https://x.com', activeMode: false }).ok).toBe(true);
  });

  it('rejects bad/non-http URLs', () => {
    expect(core.validateScanConfig({ url: 'ftp://x.com' }).ok).toBe(false);
    expect(core.validateScanConfig({ url: 'not a url' }).ok).toBe(false);
    expect(core.validateScanConfig({ url: '' }).ok).toBe(false);
  });

  it('ACCEPTS loopback / RFC-1918 targets (local tool — SSRF block dropped)', () => {
    expect(core.validateScanConfig({ url: 'http://127.0.0.1:8080/' }).ok).toBe(true);
    expect(core.validateScanConfig({ url: 'http://192.168.1.1/' }).ok).toBe(true);
    expect(core.validateScanConfig({ url: 'http://localhost:3000/' }).ok).toBe(true);
  });

  it('flags missing security headers', () => {
    const findings = core.checkSecurityHeaders(H({}));
    const titles = findings.map(f => f.title);
    expect(titles.some(t => /Content-Security-Policy/i.test(t))).toBe(true);
    expect(titles.some(t => /HSTS/i.test(t))).toBe(true);
    // present header is not flagged
    const withCsp = core.checkSecurityHeaders(H({ 'content-security-policy': "default-src 'self'" }));
    expect(withCsp.map(f => f.title).some(t => /Content-Security-Policy/i.test(t))).toBe(false);
  });

  it('computes a rule-based risk level from findings (replaces Claude)', () => {
    expect(core.computeRisk([]).riskLevel).toBe('info');
    expect(core.computeRisk([{ severity: 'low' }]).riskLevel).toBe('medium');
    expect(core.computeRisk([{ severity: 'high' }]).riskLevel).toBe('high');
    expect(core.computeRisk([{ severity: 'critical' }]).riskLevel).toBe('critical');
    const r = core.computeRisk([{ severity: 'high', title: 'Reflected XSS' }, { severity: 'low' }]);
    expect(r.summary).toMatch(/2 issue/i);
    expect(Array.isArray(r.topPriorities)).toBe(true);
  });
});
