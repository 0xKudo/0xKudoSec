import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';
import pool from '../services/db.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

// Auth is injected by tests/setup.js. The route runs two queries in order:
// (1) rule coverage, (2) alert activity. Mock them per call.

describe('GET /api/siem/attack/coverage', () => {
  it('merges rule + alert technique counts into keyed maps', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ t: 'T1059', n: 5 }, { t: 'T1078', n: 2 }] }) // rules
      .mockResolvedValueOnce({ rows: [{ t: 'T1059', n: 3 }] }); // alerts

    const res = await request(app).get('/api/siem/attack/coverage');
    expect(res.status).toBe(200);
    expect(res.body.rules).toEqual({ T1059: 5, T1078: 2 });
    expect(res.body.alerts).toEqual({ T1059: 3 });
    expect(res.body.window_days).toBe(30);
  });

  it('defaults window_days to 30 for missing/garbage input', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/siem/attack/coverage?window_days=notanumber');
    expect(res.status).toBe(200);
    expect(res.body.window_days).toBe(30);
  });

  it('clamps window_days to the 1..365 range', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] });
    const hi = await request(app).get('/api/siem/attack/coverage?window_days=9999');
    expect(hi.body.window_days).toBe(365);
    const lo = await request(app).get('/api/siem/attack/coverage?window_days=0');
    expect(lo.body.window_days).toBe(30); // 0 is falsy -> default, not clamp-to-1
  });

  it('passes the resolved window to the alert-activity query', async () => {
    vi.mocked(pool.query).mockClear();
    vi.mocked(pool.query).mockResolvedValue({ rows: [] });
    await request(app).get('/api/siem/attack/coverage?window_days=7');
    // second call is the alert-activity query; its params carry the window as a string
    const alertCall = vi.mocked(pool.query).mock.calls[1];
    expect(alertCall[1]).toContain('7');
  });

  it('returns empty maps (not an error) when nothing is covered', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/siem/attack/coverage');
    expect(res.status).toBe(200);
    expect(res.body.rules).toEqual({});
    expect(res.body.alerts).toEqual({});
  });
});
