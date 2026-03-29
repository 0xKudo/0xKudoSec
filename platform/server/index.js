import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { corsMiddleware } from './middleware/cors.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import apiRoutes from './routes/tools.js';
import { loadTools } from './loader.js';

const app = express();

app.use(helmet());
app.use(corsMiddleware);
app.use(express.json({ limit: '50kb' }));
app.use('/api', apiRateLimiter);
app.use('/api', apiRoutes);

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
