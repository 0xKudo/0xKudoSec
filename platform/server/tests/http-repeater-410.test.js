import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import router from '../../../tools/http-repeater/server/routes.js';

// Mount the tool router directly (no auth) to assert its own 410 behavior.
const app = express();
app.use('/api/tools/http-repeater', router);

describe('http-repeater is desktop-only on the server', () => {
  it('returns 410 for the old send endpoint', async () => {
    const res = await request(app).post('/api/tools/http-repeater/send').send({ url: 'https://example.com' });
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/desktop app/i);
  });

  it('returns 410 for any other path', async () => {
    const res = await request(app).get('/api/tools/http-repeater/anything');
    expect(res.status).toBe(410);
  });
});
