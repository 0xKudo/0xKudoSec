import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import router from '../../../tools/intruder/server/routes.js';

const app = express();
app.use('/api/tools/intruder', router);

describe('intruder is desktop-only on the server', () => {
  it('returns 410 for the old attack endpoint', async () => {
    const res = await request(app).post('/api/tools/intruder/attack').send({ payloads: ['a'] });
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/desktop app/i);
  });

  it('returns 410 for any other path', async () => {
    const res = await request(app).get('/api/tools/intruder/anything');
    expect(res.status).toBe(410);
  });
});
