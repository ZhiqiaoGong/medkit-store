// Health endpoints for liveness/readiness checks.
import { Router } from 'express';
import mongoose from 'mongoose';
import { redis } from '../lib/redis.js';

const router = Router();
const REDIS_READY_TIMEOUT_MS = 500;

async function isRedisReady() {
  let timeoutId;
  try {
    return await Promise.race([
      redis.ping().then(response => response === 'PONG'),
      new Promise(resolve => {
        timeoutId = setTimeout(() => resolve(false), REDIS_READY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.get('/ready', async (_req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  const redisReady = await isRedisReady();
  const ready = mongoReady && redisReady;

  res.status(ready ? 200 : 503).json({
    ready,
    checks: {
      mongo: mongoReady ? 'up' : 'down',
      redis: redisReady ? 'up' : 'down',
    },
  });
});

export default router;
