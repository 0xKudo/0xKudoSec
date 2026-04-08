import corsLib from 'cors';

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

export const corsMiddleware = corsLib({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin browser requests, server-side tools, curl).
    // This is intentional for the current single-server deployment where all API endpoints
    // still require JWT auth. If the architecture becomes multi-server or multi-tenant,
    // revisit this. Server-to-server calls should use a dedicated auth mechanism rather
    // than relying on the no-origin bypass.
    if (!origin) {
      return callback(null, true);
    }
    if (origin === allowedOrigin) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
});
