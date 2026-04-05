import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath as _fileURLToPath } from 'url';
const _dirname = _fileURLToPath(new URL('.', import.meta.url));
config({ path: resolve(_dirname, '../../.env') });
import express from 'express';
import helmet from 'helmet';
import { corsMiddleware } from './middleware/cors.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';

import apiRoutes from './routes/tools.js';
import ingestRoutes from './routes/ingest.js';
import siemRoutes from './routes/siem.js';
import { loadTools } from './loader.js';
import { attachWebSocketServer } from './services/wsBroadcast.js';
import { startRetentionCron } from './services/retentionCron.js';

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: process.env.NODE_ENV === 'production' ? 'same-origin' : 'cross-origin' },
}));
app.use(corsMiddleware);
app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/ingest', express.json({ limit: '10mb' }), apiRateLimiter, ingestRoutes);
app.use('/api/siem', express.json({ limit: '50kb' }), apiRateLimiter, siemRoutes);
app.use(express.json({ limit: '50kb' }));
app.use('/api', apiRateLimiter);
app.use('/api', apiRoutes);

// JWT error handler — must be defined after routes, takes 4 args
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  console.error('[server error]', err.message, err.stack?.split('\n')[1]?.trim());
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// createApp sets up the express app and loads tools.
// Call start() to actually bind to a port (not called during tests).
export async function createApp() {
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
  });
}
