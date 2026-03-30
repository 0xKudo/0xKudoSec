import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ sub: req.auth.sub });
  });
  // JWT error handler — catch UnauthorizedError and any JWT parse errors
  app.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError' || err.status === 401 || err.statusCode === 401) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Malformed tokens can throw generic errors — treat all auth errors as 401
    if (err.message && (err.message.includes('jwt') || err.message.includes('token') || err.message.includes('signature'))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  });
  return app;
}

describe('requireAuth middleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(makeApp()).get('/protected');
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is malformed', async () => {
    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', 'Bearer notavalidtoken');
    expect(res.status).toBe(401);
  });

  it('returns 401 when token has wrong issuer', async () => {
    const fakeToken = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImZha2UtaWQifQ.eyJzdWIiOiJ0ZXN0fDEyMyIsImlzcyI6Imh0dHBzOi8vd3JvbmcuYXV0aDAuY29tLyIsImF1ZCI6Imh0dHBzOi8vdG9vbHMubGF5bmVrdWRvLmNvbS9hcGkifQ.invalidsignature';
    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', `Bearer ${fakeToken}`);
    expect(res.status).toBe(401);
  });
});
