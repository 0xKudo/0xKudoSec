import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';
import pool from '../services/db.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

// All siem routes require auth — setup.js mock injects req.auth automatically

describe('GET /api/siem/stats', () => {
  it('returns stats shape', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ total: '142', critical: '3', high: '12', failed_logins: '7' }],
    });
    const res = await request(app).get('/api/siem/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('critical');
    expect(res.body).toHaveProperty('high');
    expect(res.body).toHaveProperty('failed_logins');
  });
});

describe('GET /api/siem/events/recent', () => {
  it('returns array of events', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/siem/events/recent');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/siem/events/by-severity', () => {
  it('returns array of severity counts', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ severity: 'info', count: '100' }] });
    const res = await request(app).get('/api/siem/events/by-severity');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/siem/sources', () => {
  it('returns array of sources', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/siem/sources');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
