import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

// Mock claude service so tests don't call the real API
vi.mock('../services/claude.js', () => ({
  askClaude: vi.fn().mockResolvedValue(JSON.stringify({
    severity: 'high',
    attackVector: 'Brute force login attempt',
    summary: 'Multiple failed SSH logins detected from a single IP.',
    recommendedActions: ['Block source IP', 'Review auth logs', 'Enable MFA'],
    confidence: 'high',
  })),
}));

import { createApp } from '../index.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

describe('POST /api/tools/alert-triage/analyze', () => {
  it('returns 400 when alertText is missing', async () => {
    const res = await request(app)
      .post('/api/tools/alert-triage/analyze')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/alertText/);
  });

  it('returns triage result for valid alertText', async () => {
    const res = await request(app)
      .post('/api/tools/alert-triage/analyze')
      .send({ alertText: 'Multiple failed SSH logins from 192.168.1.100' });
    expect(res.status).toBe(200);
    expect(res.body.severity).toBe('high');
    expect(Array.isArray(res.body.recommendedActions)).toBe(true);
  });
});
