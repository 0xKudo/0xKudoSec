import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

vi.mock('../services/claude.js', () => ({
  askClaude: vi.fn().mockResolvedValue(JSON.stringify({
    summary: 'Multiple port scan attempts detected from a single source IP.',
    threatLevel: 'high',
    threats: [{ type: 'Port Scan', source: '192.168.1.100', destination: '10.0.0.1', detail: 'SYN packets to 22 ports in 2 seconds', severity: 'high' }],
    anomalies: ['High connection rate from single IP'],
    recommendations: ['Block source IP at perimeter firewall.'],
  })),
}));

import { createApp } from '../index.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

describe('POST /api/tools/network-threat-analyzer/analyze', () => {
  it('returns 400 when logData is missing', async () => {
    const res = await request(app)
      .post('/api/tools/network-threat-analyzer/analyze')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/logData/);
  });

  it('returns 400 when logData is empty', async () => {
    const res = await request(app)
      .post('/api/tools/network-threat-analyzer/analyze')
      .send({ logData: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 413 when logData exceeds payload limit', async () => {
    const res = await request(app)
      .post('/api/tools/network-threat-analyzer/analyze')
      .send({ logData: 'a'.repeat(200001) });
    expect(res.status).toBe(413);
  });

  it('returns 200 with analysis for valid log data', async () => {
    const res = await request(app)
      .post('/api/tools/network-threat-analyzer/analyze')
      .send({ logData: 'Apr 29 10:23:01 fw kernel: IN=eth0 OUT= SRC=1.2.3.4 DST=10.0.0.1 PROTO=TCP DPT=22', logType: 'firewall' });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.threatLevel).toBeDefined();
    expect(res.body.threats).toBeDefined();
  });
});
