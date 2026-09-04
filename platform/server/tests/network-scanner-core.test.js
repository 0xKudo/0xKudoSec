import { describe, it, expect } from 'vitest';
import core from '../../electron/tools/network-scanner-core.js';

describe('network-scanner-core', () => {
  it('accepts a normal host and CIDR', () => {
    expect(core.validateTarget('scanme.nmap.org')).toBe(true);
    expect(core.validateTarget('192.168.1.0/24')).toBe(true);
  });
  it('rejects shell metacharacters and overlong input', () => {
    expect(core.validateTarget('a; rm -rf /')).toBe(false);
    expect(core.validateTarget('$(whoami)')).toBe(false);
    expect(core.validateTarget('a'.repeat(101))).toBe(false);
    expect(core.validateTarget('')).toBe(false);
  });
  it('builds args with the -- separator and known profile', () => {
    const args = core.buildNmapArgs('10.0.0.1', 'quick');
    expect(args[0]).toBe('-oN');
    expect(args).toContain('--');
    expect(args[args.length - 1]).toBe('10.0.0.1');
    expect(args).toContain('-F');
  });
  it('throws on unknown scanType and bad target', () => {
    expect(() => core.buildNmapArgs('10.0.0.1', 'bogus')).toThrow();
    expect(() => core.buildNmapArgs('a; ls', 'quick')).toThrow();
  });
});
