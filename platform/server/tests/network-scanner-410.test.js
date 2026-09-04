import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

describe('network-scanner is desktop-only on the server', () => {
  it('returns 410 for the old scan endpoint', async () => {
    const res = await request(app).post('/api/tools/network-scanner/scan').send({ target: '1.1.1.1' });
    expect(res.status).toBe(410);
  });
  it('returns 410 for the old scan-stream endpoint', async () => {
    const res = await request(app).get('/api/tools/network-scanner/scan-stream/123-abc');
    expect(res.status).toBe(410);
  });
});
