import { Router } from 'express';
import { getRequestMetrics } from '../middlewares/observability.js';

const router = Router();

function hasMetricsAccess(req) {
  const token = process.env.METRICS_TOKEN;
  if (!token) return true;

  return req.get('authorization') === `Bearer ${token}` || req.get('x-metrics-token') === token;
}

router.get('/metrics', (req, res) => {
  if (!hasMetricsAccess(req)) {
    return res.status(401).json({
      error: 'Metrics token required',
      requestId: req.id,
    });
  }

  res.json(getRequestMetrics());
});

export default router;
