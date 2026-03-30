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
import { loadTools } from './loader.js';

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: process.env.NODE_ENV === 'production' ? 'same-origin' : 'cross-origin' },
}));
app.use(corsMiddleware);
app.use(express.json({ limit: '50kb' }));
app.use('/api', apiRateLimiter);
app.use('/api', apiRoutes);

// JWT error handler — must be defined after routes, takes 4 args
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next(err);
});

// createApp sets up the express app and loads tools.
// Call start() to actually bind to a port (not called during tests).
export async function createApp() {
  await loadTools(app);
  return app;
}

export default app;

// Only start listening when run directly (not imported by tests)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const PORT = process.env.PORT || 4000;
  createApp().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Allowed origin: ${process.env.ALLOWED_ORIGIN}`);
    });
  });
}
