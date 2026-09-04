import { Router } from 'express';

const router = Router();

// Network Scanner runs nmap locally in the 0xKudo desktop app.
// No scanning executes on the server.
router.all('*', (_req, res) =>
  res.status(410).json({ error: 'Network Scanner runs locally in the 0xKudo desktop app.' }));

export default router;
