import rateLimit from 'express-rate-limit';
import { audit } from '../services/audit.js';

// General API rate limiter — 200 req/min per IP
// Dashboard polling alone hits ~40 req/min; 200 leaves headroom for user actions
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
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

// Ingest key rotation — per-user limit (keyed on Auth0 sub, not IP)
// 5 rotations per hour. Blocks distributed attacks that bypass IP-based limiting.
export const ingestKeyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.sub || req.ip,
  message: { error: 'Too many key rotation attempts. Try again in an hour.' },
  handler: (req, res, next, options) => {
    audit(req.auth?.sub || null, 'ingest_key.rotation_blocked', { ip: req.ip }, req.ip);
    res.status(options.statusCode).json(options.message);
  },
});

// Rule import — bulk write operation, tighter than general API
export const ruleImportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many import requests. Try again in a minute.' },
});
