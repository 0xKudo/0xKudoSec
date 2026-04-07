import { expressjwt } from 'express-jwt';
import { expressJwtSecret } from 'jwks-rsa';

export const requireAuth = (req, res, next) => {
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
  const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

  return expressjwt({
    secret: expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
    }),
    audience: AUTH0_AUDIENCE,
    issuer: `https://${AUTH0_DOMAIN}/`,
    algorithms: ['RS256'],
  })(req, res, next);
};

// Middleware to require a specific Auth0 role.
// Must be used after requireAuth. Roles are injected by the
// "Add roles to token" Auth0 Action into the custom claim.
const ROLES_CLAIM = 'https://tools.laynekudo.com/roles';

export const requireRole = (role) => (req, res, next) => {
  const roles = req.auth?.[ROLES_CLAIM] ?? [];
  if (!roles.includes(role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  }
  next();
};
