import { Router } from 'express';

const router = Router();

// Vulnerability Scanner runs locally in the 0xKudo desktop app (probes originate from the
// user's machine, not the VPS). No scanning executes on the server.
router.all('*', (_req, res) =>
  res.status(410).json({ error: 'Vulnerability Scanner runs locally in the 0xKudo desktop app.' }));

export default router;
