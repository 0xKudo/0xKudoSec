import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

vi.mock('../services/claude.js', () => ({
  askClaude: vi.fn().mockResolvedValue(JSON.stringify({
    verdict: 'phishing',
    confidence: 'high',
    summary: 'This email impersonates a financial institution and uses urgency to trick the recipient into clicking a malicious link.',
    indicators: [
      { type: 'sender-spoofing', detail: 'From address does not match the claimed organization domain' },
      { type: 'urgency', detail: 'Threatens account suspension within 24 hours' },
      { type: 'suspicious-link', detail: 'Link domain does not match claimed sender' },
    ],
    suspiciousUrls: ['http://secure-login.totally-not-a-bank.com/verify'],
    suspiciousSender: 'support@bank-secure-login.com',
    recommendedActions: [
      'Do not click any links in this email',
      'Report to IT security team',
      'Block sender domain at email gateway',
    ],
  })),
}));

import { createApp } from '../index.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

describe('POST /api/tools/phishing-analyzer/analyze', () => {
  it('returns 400 when emailText is missing', async () => {
    const res = await request(app)
      .post('/api/tools/phishing-analyzer/analyze')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/emailText/);
  });

  it('returns 400 when emailText is empty', async () => {
    const res = await request(app)
      .post('/api/tools/phishing-analyzer/analyze')
      .send({ emailText: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with full analysis for valid emailText', async () => {
    const res = await request(app)
      .post('/api/tools/phishing-analyzer/analyze')
      .send({ emailText: 'From: support@bank-secure-login.com\nClick here to verify your account' });
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('phishing');
    expect(Array.isArray(res.body.indicators)).toBe(true);
    expect(Array.isArray(res.body.recommendedActions)).toBe(true);
  });

  it('returns 400 when emailText exceeds 20000 characters', async () => {
    const res = await request(app)
      .post('/api/tools/phishing-analyzer/analyze')
      .send({ emailText: 'a'.repeat(20001) });
    expect(res.status).toBe(400);
  });
});
