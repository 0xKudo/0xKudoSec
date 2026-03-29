import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

vi.mock('../services/claude.js', () => ({
  askClaude: vi.fn().mockResolvedValue(JSON.stringify({
    summary: 'Multiple failed SSH login attempts detected from a single IP address.',
    severityLevel: 'high',
    anomalies: [
      {
        title: 'SSH Brute Force Attempt',
        explanation: 'Repeated failed login attempts suggest an automated credential stuffing attack.',
        severity: 'high',
        lineRefs: ['line 3', 'line 4'],
      },
    ],
    recommendations: ['Block source IP at the firewall.', 'Enable fail2ban or equivalent.'],
  })),
}));

import { createApp } from '../index.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

describe('POST /api/tools/log-anomaly-explainer/analyze', () => {
  it('returns 400 when logText is missing', async () => {
    const res = await request(app)
      .post('/api/tools/log-anomaly-explainer/analyze')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/logText/);
  });

  it('returns 400 when logText is empty', async () => {
    const res = await request(app)
      .post('/api/tools/log-anomaly-explainer/analyze')
      .send({ logText: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with anomaly analysis for valid log input', async () => {
    const res = await request(app)
      .post('/api/tools/log-anomaly-explainer/analyze')
      .send({ logText: 'Failed password for root from 1.2.3.4 port 22 ssh2' });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.anomalies).toBeDefined();
    expect(res.body.severityLevel).toBeDefined();
  });

  it('returns 400 for invalid log source', async () => {
    const res = await request(app)
      .post('/api/tools/log-anomaly-explainer/analyze')
      .send({ logText: 'some log', logSource: 'invalid' });
    expect(res.status).toBe(400);
  });
});
