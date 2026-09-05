import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import router from '../../../tools/subdomain-enumerator/server/routes.js';

const app = express();
app.use('/api/tools/subdomain-enumerator', router);

describe('subdomain enumerator is desktop-only on the server', () => {
  it('returns 410 for the old enumerate endpoint', async () => {
    const res = await request(app).post('/api/tools/subdomain-enumerator/enumerate').send({ domain: 'example.com' });
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/desktop app/i);
  });

  it('returns 410 for any other path', async () => {
    const res = await request(app).get('/api/tools/subdomain-enumerator/anything');
    expect(res.status).toBe(410);
  });
});
