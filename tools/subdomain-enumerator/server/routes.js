import { Router } from 'express';

const router = Router();

// Subdomain Enumerator runs locally in the 0xKudo desktop app (lookups + DNS brute-force
// originate from the user's machine, not the VPS). Nothing executes on the server.
router.all('*', (_req, res) =>
  res.status(410).json({ error: 'Subdomain Enumerator runs locally in the 0xKudo desktop app.' }));

export default router;
