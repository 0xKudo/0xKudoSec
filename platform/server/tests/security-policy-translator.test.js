import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

vi.mock('../services/claude.js', () => ({
  askClaude: vi.fn().mockResolvedValue(JSON.stringify({
    plainEnglishSummary: 'You must use strong passwords and change them regularly.',
    framework: 'NIST',
    controls: [
      {
        id: 'IA-5',
        title: 'Authenticator Management',
        plainEnglish: 'Use strong passwords and rotate them on a schedule.',
        requirement: 'Mandatory',
        ownerTeams: ['IT', 'Security'],
        actionItems: ['Enforce password complexity policy', 'Set 90-day rotation schedule'],
      },
    ],
    complianceGaps: ['No MFA requirement currently documented'],
    recommendations: ['Implement MFA for all privileged accounts.'],
  })),
}));

import { createApp } from '../index.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

describe('POST /api/tools/security-policy-translator/translate', () => {
  it('returns 400 when policyText is missing', async () => {
    const res = await request(app)
      .post('/api/tools/security-policy-translator/translate')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/policyText/);
  });

  it('returns 400 when policyText is empty', async () => {
    const res = await request(app)
      .post('/api/tools/security-policy-translator/translate')
      .send({ policyText: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with translation for valid policy text', async () => {
    const res = await request(app)
      .post('/api/tools/security-policy-translator/translate')
      .send({ policyText: 'The organization shall implement authenticator management.' });
    expect(res.status).toBe(200);
    expect(res.body.plainEnglishSummary).toBeDefined();
    expect(res.body.controls).toBeDefined();
  });

  it('returns 400 for invalid framework hint', async () => {
    const res = await request(app)
      .post('/api/tools/security-policy-translator/translate')
      .send({ policyText: 'Some policy text.', frameworkHint: 'invalid' });
    expect(res.status).toBe(400);
  });
});
