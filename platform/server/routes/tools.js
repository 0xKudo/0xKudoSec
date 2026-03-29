import { Router } from 'express';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Populated by loader.js after manifests are discovered
router.get('/tools', (req, res) => {
  res.json(req.app.locals.toolManifests || []);
});

export default router;
