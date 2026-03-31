import { vi } from 'vitest';

// Mock requireAuth so tool tests don't need real JWTs.
// Sets req.auth to a fake user that matches what real Auth0 tokens provide.
vi.mock('../middleware/requireAuth.js', () => ({
  requireAuth: (req, res, next) => {
    req.auth = { sub: 'test|user123', email: 'test@example.com', name: 'Test User' };
    next();
  },
}));

// Mock db.js so tests don't need a real PostgreSQL connection.
vi.mock('../services/db.js', () => ({
  default: {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  },
}));
