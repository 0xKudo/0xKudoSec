import corsLib from 'cors';

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

export const corsMiddleware = corsLib({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman) in development
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    if (origin === allowedOrigin) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
