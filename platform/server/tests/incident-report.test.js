import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

vi.mock('../services/claude.js', () => ({
  askClaude: vi.fn().mockResolvedValue(JSON.stringify({
    title: 'Brute Force Attack on SSH Service',
    severity: 'high',
    classification: 'Credential Attack',
    detectedAt: '',
    reportedAt: '',
    executiveSummary: 'An attacker attempted to brute-force SSH credentials.',
    technicalDetails: 'Source IP 192.168.1.100 made 847 failed login attempts.',
    impactAssessment: 'No successful compromise detected.',
    containmentSteps: 'Source IP blocked at perimeter firewall.',
    recommendedRemediation: 'Enable MFA on all SSH access points.',
    lessonsLearned: 'Rate limiting was not configured on the SSH service.',
  })),
}));

import { createApp } from '../index.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

describe('POST /api/tools/incident-report/analyze', () => {
  it('returns 400 when incidentText is missing', async () => {
    const res = await request(app)
      .post('/api/tools/incident-report/analyze')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/incidentText/);
  });

  it('returns 400 when incidentText is empty', async () => {
    const res = await request(app)
      .post('/api/tools/incident-report/analyze')
      .send({ incidentText: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with full report for valid incidentText', async () => {
    const res = await request(app)
      .post('/api/tools/incident-report/analyze')
      .send({ incidentText: 'Multiple failed SSH logins from 192.168.1.100' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBeDefined();
    expect(res.body.executiveSummary).toBeDefined();
    expect(res.body.recommendedRemediation).toBeDefined();
  });

  it('accepts optional severity field without error', async () => {
    const res = await request(app)
      .post('/api/tools/incident-report/analyze')
      .send({ incidentText: 'Suspicious outbound traffic detected', severity: 'high' });
    expect(res.status).toBe(200);
  });

  it('returns 400 when incidentText exceeds 10000 characters', async () => {
    const res = await request(app)
      .post('/api/tools/incident-report/analyze')
      .send({ incidentText: 'a'.repeat(10001) });
    expect(res.status).toBe(400);
  });
});
