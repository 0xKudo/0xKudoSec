import { Router } from 'express';

const router = Router();

// HTTP Repeater runs locally in the 0xKudo desktop app (requests originate from the
// user's machine, not the VPS). No request execution happens on the server.
router.all('*', (_req, res) =>
  res.status(410).json({ error: 'HTTP Repeater runs locally in the 0xKudo desktop app.' }));

export default router;
