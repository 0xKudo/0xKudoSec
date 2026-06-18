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
      // Fira Code is loaded via @import in theme.css from Google Fonts —
      // styleSrc allows the CSS import, fontSrc allows the actual font
      // files Google's stylesheet references (served from a different host).
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", `https://${AUTH0_DOMAIN}`, wsOrigin],
      // Some bundled dependency spins up a Web Worker via a blob: URL
      // (CSP error message confirms this — "worker-src was not explicitly
      // set, so script-src is used as a fallback", and script-src 'self'
      // doesn't cover blob: workers). Allow it explicitly rather than
      // loosening script-src itself.
      workerSrc: ["'self'", 'blob:'],
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

    // Serve the bundled shell at /app — Electron's mainWindow.loadURL points
    // here in local mode. The cloud/VPS deployment serves the shell via nginx
    // separately, so this is local-mode-only. Resolved relative to this file's
    // own location (same sibling-directory assumption already relied on for
    // serverEntry resolution in platform/electron/main.js): platform/server/
    // and platform/shell/dist/ are siblings under platform/ in both dev and
    // the packaged app's resources directory.
    const shellDistPath = resolve(_dirname, '../shell/dist');
    // Vite builds index.html with root-relative asset paths (/assets/...),
    // since it assumes the app is served from "/". In local mode it's served
    // from "/app" instead, so the browser requests /assets/... at the bare
    // server root — not /app/assets/.... Serve the same dist/assets directory
    // at the root-level /assets path too so those absolute references resolve
    // correctly without needing a separate Vite build config per deployment
    // target. Scoped to /assets specifically (not the whole "/") so it can't
    // shadow /api or /health regardless of registration order.
    app.use('/assets', express.static(resolve(shellDistPath, 'assets')));
    app.use('/app', express.static(shellDistPath));
    app.get(/^\/app(\/.*)?$/, (req, res) => {
      // If express.static didn't find this (e.g. a transient miss right after
      // a fresh install, or a typo'd path), don't mask it as index.html —
      // that previously caused "Refused to apply style... MIME type text/html"
      // errors when a CSS/JS asset request fell through here instead of 404ing.
      // Only the SPA's actual client-side routes (no file extension) should
      // get the index.html fallback.
      if (/\.[a-zA-Z0-9]+$/.test(req.path)) {
        return res.status(404).end();
      }
      res.sendFile(join(shellDistPath, 'index.html'));
    });
  }
  await loadTools(app);
  return app;
}

export default app;

// Only start listening when not running under Vitest
import { fileURLToPath } from 'url';
if (!process.env.VITEST) {
  const PORT = process.env.PORT || 4000;
  createApp().then(async () => {
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Allowed origin: ${process.env.ALLOWED_ORIGIN}`);
    });
    attachWebSocketServer(server);
    if (process.env.STORAGE_MODE !== 'local') {
      const { attachIngestReceiver } = await import('./ws/ingestReceiver.js');
      attachIngestReceiver(server);
    }
    startRetentionCron();
    scheduleNoiseCron();
    scheduleKbCron();
  });
}
