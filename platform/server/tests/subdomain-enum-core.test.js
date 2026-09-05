import { describe, it, expect } from 'vitest';
import core from '../../electron/tools/subdomain-enum-core.js';

describe('subdomain-enum-core', () => {
  it('validates domain names', () => {
    expect(core.validateDomain('example.com')).toBe(true);
    expect(core.validateDomain('sub.example.co.uk')).toBe(true);
    expect(core.validateDomain('https://example.com')).toBe(false);
    expect(core.validateDomain('example.com/path')).toBe(false);
    expect(core.validateDomain('bad domain')).toBe(false);
    expect(core.validateDomain('a; rm -rf /')).toBe(false);
    expect(core.validateDomain('')).toBe(false);
  });

  it('has a non-empty default brute wordlist', () => {
    expect(Array.isArray(core.DEFAULT_WORDLIST)).toBe(true);
    expect(core.DEFAULT_WORDLIST.length).toBeGreaterThan(20);
    expect(core.DEFAULT_WORDLIST).toContain('www');
  });

  it('parses crt.sh JSON, dedups, lowercases, strips wildcards, filters to domain', () => {
    const data = [
      { name_value: 'www.example.com\n*.example.com' },
      { name_value: 'API.EXAMPLE.COM' },
      { name_value: 'evil.com' },           // filtered out
      { name_value: 'example.com' },         // apex kept
    ];
    const subs = core.parseCrtShJson(data, 'example.com');
    expect(subs).toContain('www.example.com');
    expect(subs).toContain('api.example.com');
    expect(subs).toContain('example.com');
    expect(subs).not.toContain('evil.com');
    // wildcard stripped, no '*.example.com'
    expect(subs.some(s => s.startsWith('*'))).toBe(false);
    // deduped
    expect(new Set(subs).size).toBe(subs.length);
  });

  it('parses HackerTarget CSV text', () => {
    const text = 'www.example.com,1.2.3.4\napi.example.com,5.6.7.8\nevil.com,9.9.9.9';
    const subs = core.parseHackerTargetText(text, 'example.com');
    expect(subs).toContain('www.example.com');
    expect(subs).toContain('api.example.com');
    expect(subs).not.toContain('evil.com');
  });
});
