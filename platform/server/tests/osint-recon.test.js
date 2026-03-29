import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

vi.mock('../services/claude.js', () => ({
  askClaude: vi.fn().mockResolvedValue(JSON.stringify({
    summary: 'This domain appears to be a legitimate tech company with no malicious indicators.',
    riskLevel: 'low',
    flags: [],
    recommendations: ['No immediate action required.'],
  })),
}));

// Mock fetch for external API calls
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

describe('POST /api/tools/osint-recon/analyze', () => {
  it('returns 400 when target is missing', async () => {
    const res = await request(app)
      .post('/api/tools/osint-recon/analyze')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/target/);
  });

  it('returns 400 when target is empty', async () => {
    const res = await request(app)
      .post('/api/tools/osint-recon/analyze')
      .send({ target: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with results for a valid domain target', async () => {
    const res = await request(app)
      .post('/api/tools/osint-recon/analyze')
      .send({ target: 'example.com', targetType: 'domain' });
    expect(res.status).toBe(200);
    expect(res.body.target).toBe('example.com');
    expect(res.body.targetType).toBe('domain');
    expect(res.body.summary).toBeDefined();
    expect(res.body.sources).toBeDefined();
  });

  it('returns 400 for invalid target type', async () => {
    const res = await request(app)
      .post('/api/tools/osint-recon/analyze')
      .send({ target: 'example.com', targetType: 'invalid' });
    expect(res.status).toBe(400);
  });
});
