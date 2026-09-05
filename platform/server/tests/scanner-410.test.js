import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import router from '../../../tools/scanner/server/routes.js';

const app = express();
app.use('/api/tools/scanner', router);

describe('vulnerability scanner is desktop-only on the server', () => {
  it('returns 410 for the old scan endpoint', async () => {
    const res = await request(app).post('/api/tools/scanner/scan').send({ url: 'https://example.com' });
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/desktop app/i);
  });

  it('returns 410 for any other path', async () => {
    const res = await request(app).get('/api/tools/scanner/anything');
    expect(res.status).toBe(410);
  });
});
