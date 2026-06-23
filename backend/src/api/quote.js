import express from 'express';
import { buildOrderItems } from '../lib/pricing.js';
import { redis } from '../lib/redis.js';

const router = express.Router();
const QUOTE_TTL = 600; // 10 minutes — just for orphan cleanup, version handles real invalidation

async function quoteCacheKey(baseSku, addons) {
  const version = await redis.get('product:version') || '0';
  const base = baseSku || 'none';
  const addonPart = addons
    .slice()
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map(a => `${a.sku}:${a.quantity}`)
    .join(',');
  return `quote:v${version}:${base}:${addonPart}`;
}

// POST /api/quote — return a price breakdown without persisting anything.
router.post('/', async (req, res, next) => {
  try {
    const { baseSku, addons = [] } = req.body;

    if (!baseSku && addons.length === 0) {
      return res.status(400).json({ error: 'At least one of baseSku or addons is required' });
    }

    const key = await quoteCacheKey(baseSku, addons);
    const cached = await redis.get(key);
    if (cached) return res.json(JSON.parse(cached));

    const { items, total } = await buildOrderItems(baseSku, addons);

    const base       = items.find(i => i.type === 'BASE') ?? null;
    const addonItems = items.filter(i => i.type === 'ADDON');

    const result = {
      base:   base ? { sku: base.sku, price: base.price } : null,
      addons: addonItems.map(({ sku, price, quantity, subtotal }) => ({ sku, price, quantity, subtotal })),
      total,
    };

    await redis.setex(key, QUOTE_TTL, JSON.stringify(result));
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
