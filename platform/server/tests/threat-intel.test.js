import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

vi.mock('../services/claude.js', () => ({
  askClaude: vi.fn().mockResolvedValue(JSON.stringify({
    summary: 'This IP has been flagged for malicious activity.',
    threatLevel: 'high',
    flags: ['Reported for SSH brute force'],
    recommendations: ['Block this IP at the firewall.'],
  })),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

mockFetch.mockResolvedValue({
  ok: true,
  json: async () => ({}),
  text: async () => '{}',
});

import { createApp } from '../index.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

describe('POST /api/tools/threat-intel/analyze', () => {
  it('returns 400 when indicator is missing', async () => {
    const res = await request(app)
      .post('/api/tools/threat-intel/analyze')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/indicator/);
  });

  it('returns 400 when indicator is empty', async () => {
    const res = await request(app)
      .post('/api/tools/threat-intel/analyze')
      .send({ indicator: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with results for a valid IP indicator', async () => {
    const res = await request(app)
      .post('/api/tools/threat-intel/analyze')
      .send({ indicator: '1.1.1.1', indicatorType: 'ip' });
    expect(res.status).toBe(200);
    expect(res.body.indicator).toBe('1.1.1.1');
    expect(res.body.indicatorType).toBe('ip');
    expect(res.body.summary).toBeDefined();
    expect(res.body.sources).toBeDefined();
  });

  it('returns 400 for invalid indicator type', async () => {
    const res = await request(app)
      .post('/api/tools/threat-intel/analyze')
      .send({ indicator: '1.1.1.1', indicatorType: 'invalid' });
    expect(res.status).toBe(400);
  });
});
