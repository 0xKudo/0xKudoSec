import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

vi.mock('../services/claude.js', () => ({
  askClaude: vi.fn().mockResolvedValue(JSON.stringify({
    summary: 'Host is up with several open ports indicating a web server.',
    riskLevel: 'medium',
    findings: ['Port 80 open — HTTP service exposed', 'Port 443 open — HTTPS service exposed'],
    recommendations: ['Review exposed services and apply firewall rules as needed.'],
  })),
}));

// Mock child_process to avoid real nmap execution in tests
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event, cb) => { if (event === 'close') cb(0); }),
  })),
}));

import { createApp } from '../index.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

describe('POST /api/tools/network-scanner/scan', () => {
  it('returns 400 when target is missing', async () => {
    const res = await request(app)
      .post('/api/tools/network-scanner/scan')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/target/);
  });

  it('returns 400 for invalid target format', async () => {
    const res = await request(app)
      .post('/api/tools/network-scanner/scan')
      .send({ target: 'not a valid target; rm -rf /' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid scan type', async () => {
    const res = await request(app)
      .post('/api/tools/network-scanner/scan')
      .send({ target: '127.0.0.1', scanType: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid target and scan type', async () => {
    const res = await request(app)
      .post('/api/tools/network-scanner/scan')
      .send({ target: '127.0.0.1', scanType: 'ping' });
    expect(res.status).toBe(200);
    expect(res.body.target).toBe('127.0.0.1');
    expect(res.body.scanType).toBeDefined();
  });
});
