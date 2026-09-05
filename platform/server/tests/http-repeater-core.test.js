import { describe, it, expect } from 'vitest';
import core from '../../electron/tools/http-repeater-core.js';

describe('http-repeater-core', () => {
  it('accepts a valid request and normalizes the method to uppercase', () => {
    const r = core.validateRequest({ method: 'get', url: 'https://example.com/api', headers: '', body: '' });
    expect(r.ok).toBe(true);
    expect(r.method).toBe('GET');
    expect(r.url).toBe('https://example.com/api');
  });

  it('rejects unknown methods, non-http schemes, and malformed URLs', () => {
    expect(core.validateRequest({ method: 'FETCH', url: 'https://example.com' }).ok).toBe(false);
    expect(core.validateRequest({ method: 'GET', url: 'ftp://example.com' }).ok).toBe(false);
    expect(core.validateRequest({ method: 'GET', url: 'file:///etc/passwd' }).ok).toBe(false);
    expect(core.validateRequest({ method: 'GET', url: 'not a url' }).ok).toBe(false);
    expect(core.validateRequest({ method: 'GET', url: '' }).ok).toBe(false);
  });

  it('ACCEPTS loopback and RFC-1918 targets (local tool — SSRF block dropped)', () => {
    expect(core.validateRequest({ method: 'GET', url: 'http://127.0.0.1:8080/' }).ok).toBe(true);
    expect(core.validateRequest({ method: 'GET', url: 'http://192.168.1.1/' }).ok).toBe(true);
    expect(core.validateRequest({ method: 'GET', url: 'http://localhost:4000/api/health' }).ok).toBe(true);
    expect(core.validateRequest({ method: 'GET', url: 'http://10.0.0.5/' }).ok).toBe(true);
  });

  it('parses newline-separated headers and strips hop-by-hop headers', () => {
    const r = core.validateRequest({
      method: 'POST',
      url: 'https://example.com',
      headers: 'Content-Type: application/json\nHost: evil\nAuthorization: Bearer x',
    });
    expect(r.ok).toBe(true);
    expect(r.headers['Content-Type']).toBe('application/json');
    expect(r.headers['Authorization']).toBe('Bearer x');
    expect(r.headers['Host']).toBeUndefined();
    expect(r.headers['host']).toBeUndefined();
  });

  it('rejects a body over the size cap', () => {
    const big = 'x'.repeat(51 * 1024);
    expect(core.validateRequest({ method: 'POST', url: 'https://example.com', body: big }).ok).toBe(false);
  });
});
