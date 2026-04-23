const ROLES_CLAIM = 'https://0xkudo.com/roles';

export const requirePaid = (req, res, next) => {
  const roles = req.auth?.[ROLES_CLAIM] ?? [];
  if (!roles.includes('paid')) {
    return res.status(403).json({ error: 'This feature requires a paid subscription.' });
  }
  next();
};
