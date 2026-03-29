import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

vi.mock('../services/claude.js', () => ({
  askClaude: vi.fn().mockResolvedValue(JSON.stringify({
    decodedPayload: 'echo hello',
    encodingLayers: ['base64'],
    payloadType: 'shell command',
    intent: 'Prints "hello" to stdout. Benign.',
    threatLevel: 'low',
    isMalicious: false,
    indicators: [],
    explanation: 'This is a simple base64-encoded shell command that prints hello.',
  })),
}));

import { createApp } from '../index.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

describe('POST /api/tools/payload-obfuscation-explainer/analyze', () => {
  it('returns 400 when payload is missing', async () => {
    const res = await request(app)
      .post('/api/tools/payload-obfuscation-explainer/analyze')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/payload/);
  });

  it('returns 400 when payload is empty', async () => {
    const res = await request(app)
      .post('/api/tools/payload-obfuscation-explainer/analyze')
      .send({ payload: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with analysis for a valid payload', async () => {
    const res = await request(app)
      .post('/api/tools/payload-obfuscation-explainer/analyze')
      .send({ payload: 'aGVsbG8=' });
    expect(res.status).toBe(200);
    expect(res.body.decodedPayload).toBeDefined();
    expect(res.body.threatLevel).toBeDefined();
    expect(res.body.explanation).toBeDefined();
  });

  it('returns 400 for invalid encoding hint', async () => {
    const res = await request(app)
      .post('/api/tools/payload-obfuscation-explainer/analyze')
      .send({ payload: 'aGVsbG8=', encodingHint: 'invalid' });
    expect(res.status).toBe(400);
  });
});
