import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';

// db mock is in setup.js — pool.query returns { rows: [], rowCount: 0 }
import pool from '../services/db.js';

let app;
beforeAll(async () => {
  app = await createApp();
});

const VALID_KEY = process.env.INGEST_API_KEY || 'testkey';

const SAMPLE_EVENT = {
  '@timestamp': '2026-03-30T12:00:00.000Z',
  message: 'An account was successfully logged on.',
  agent: { type: 'winlogbeat' },
  host: { name: 'DESKTOP-TEST', ip: ['192.168.1.100'] },
  winlog: { event_id: 4624, channel: 'Security', event_data: { SubjectUserName: 'layne' } },
  event: { category: ['authentication'], severity: 'information' },
};

describe('POST /api/ingest/beats', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app)
      .post('/api/ingest/beats')
      .send([SAMPLE_EVENT]);
    expect(res.status).toBe(401);
  });

  it('returns 401 when API key is wrong', async () => {
    const res = await request(app)
      .post('/api/ingest/beats')
      .set('Authorization', 'Bearer wrongkey')
      .send([SAMPLE_EVENT]);
    expect(res.status).toBe(401);
  });

  it('returns 400 when body is not an array or object', async () => {
    const res = await request(app)
      .post('/api/ingest/beats')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .set('Content-Type', 'application/json')
      .send('"just a string"');
    expect(res.status).toBe(400);
  });

  it('accepts a valid batch and returns accepted count', async () => {
    const res = await request(app)
      .post('/api/ingest/beats')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send([SAMPLE_EVENT]);
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
  });

  it('accepts a single event object (not array)', async () => {
    const res = await request(app)
      .post('/api/ingest/beats')
      .set('Authorization', `Bearer ${VALID_KEY}`)
      .send(SAMPLE_EVENT);
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
  });
});
