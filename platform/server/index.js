import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath as _fileURLToPath } from 'url';
const _dirname = _fileURLToPath(new URL('.', import.meta.url));
config({ path: resolve(_dirname, '../../.env') });
import express from 'express';
import { randomUUID } from 'crypto';
import helmet from 'helmet';
import { corsMiddleware } from './middleware/cors.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';

import apiRoutes from './routes/tools.js';
import ingestRoutes from './routes/ingest.js';
import siemRoutes from './routes/siem.js';
import noiseRoutes from './routes/noise.js';
import billingRoutes, { webhookHandler } from './routes/billing.js';
import { loadTools } from './loader.js';
import { migrateLocal } from './db/migrate-sqlite.js';
import { attachWebSocketServer } from './services/wsBroadcast.js';
import { startRetentionCron } from './services/retentionCron.js';
import { scheduleNoiseCron } from './services/noiseCron.js';
import { scheduleKbCron } from './services/kbCron.js';

const app = express();

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
const wsOrigin = ALLOWED_ORIGIN.replace(/^https?/, 'wss');

app.use(helmet({
  crossOriginResourcePolicy: { policy: process.env.NODE_ENV === 'production' ? 'same-origin' : 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", `https://${AUTH0_DOMAIN}`, wsOrigin],
      frameAncestors: ["'none'"],
      reportUri: ['/api/csp-report'],
    },
  },
}));
app.use(corsMiddleware);

// Correlation ID — attach to every request, return in response header
app.use((req, res, next) => {
  req.id = randomUUID();
  res.set('X-Request-ID', req.id);
  next();
});
app.get('/health', (req, res) => res.json({ ok: true }));
app.post('/api/csp-report', express.json({ type: 'application/csp-report', limit: '10kb' }), (req, res) => {
  console.warn('[csp-violation]', JSON.stringify(req.body));
  res.status(204).end();
});
app.use('/api/ingest', express.json({ limit: '10mb' }), apiRateLimiter, ingestRoutes);
app.use('/api/siem/noise', express.json({ limit: '50kb' }), apiRateLimiter, noiseRoutes);
app.use('/api/siem', express.json({ limit: '50kb' }), apiRateLimiter, siemRoutes);
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), apiRateLimiter, webhookHandler);
app.use('/api/billing', express.json({ limit: '50kb' }), apiRateLimiter, billingRoutes);
app.use(express.json({ limit: '50kb' }));
app.use('/api', apiRateLimiter);
app.use('/api', apiRoutes);

// JWT error handler — must be defined after routes, takes 4 args
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const requestId = req.id || 'unknown';
  console.error(`[server error] requestId=${requestId}`, err.message, err.stack);
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error', requestId });
  } else {
    res.status(500).json({ error: err.message || 'Internal server error', requestId });
  }
});

// createApp sets up the express app and loads tools.
// Call start() to actually bind to a port (not called during tests).
export async function createApp() {
  if (process.env.STORAGE_MODE === 'local') {
    const { join } = await import('path');
    const dbPath = process.env.SQLITE_PATH || join(
      process.env.APPDATA || process.env.HOME || '.',
      '0xKudo', 'siem.db'
    );
    migrateLocal(dbPath);

    const { default: exportRoutes } = await import('./routes/export.js');
    app.use('/api/local/export', apiRateLimiter, exportRoutes);
  }
  await loadTools(app);
  return app;
}

export default app;

// Only start listening when not running under Vitest
import { fileURLToPath } from 'url';
if (!process.env.VITEST) {
  const PORT = process.env.PORT || 4000;
  createApp().then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Allowed origin: ${process.env.ALLOWED_ORIGIN}`);
    });
    attachWebSocketServer(server);
    startRetentionCron();
    scheduleNoiseCron();
    scheduleKbCron();
  });
}
