import corsLib from 'cors';

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

export const corsMiddleware = corsLib({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin browser requests, curl, Postman)
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
