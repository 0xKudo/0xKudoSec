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
// All access paths (query, withUserPool().query, withUser's client, the pools'
// connect().query) funnel to one shared query mock, so a test that does
// pool.query.mockResolvedValueOnce(...) controls every path including req.db.
const { dbQuery } = vi.hoisted(() => ({
  dbQuery: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

vi.mock('../services/db.js', () => {
  const client = { query: dbQuery, release: () => {} };
  const connectable = { connect: async () => client, query: dbQuery };
  return {
    default: {
      query: dbQuery,
      withUser: (userId, fn) => fn(client),
      withUserPool: () => ({ query: dbQuery }),
      getPool: () => connectable,
      getOpsPool: () => connectable,
      getIngestAuthPool: () => connectable,
    },
  };
});
