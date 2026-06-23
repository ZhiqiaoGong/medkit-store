// Health endpoints for liveness/readiness checks.
import { Router } from 'express';
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.get('/ready', (_req, res) => {
  // In a real app, check DB/Redis here.
  res.json({ ready: true });
});

export default router;
