import rateLimit from 'express-rate-limit';

// General API rate limiter — 60 req/min per IP
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
});

// Ingest beats — higher limit for batch log shippers (Fluent Bit sends in batches)
export const ingestBeatsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ingest rate limit exceeded. Reduce shipper batch frequency.' },
});

// Ingest key rotation — tight limit, this is a privileged credential action
export const ingestKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many key rotation attempts. Try again in a minute.' },
});

// Rule import — bulk write operation, tighter than general API
export const ruleImportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many import requests. Try again in a minute.' },
});
