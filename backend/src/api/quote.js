import express from 'express';
import { buildOrderItems } from '../lib/pricing.js';
import { redis } from '../lib/redis.js';
import { validate } from '../middlewares/validate.js';
import { quoteSchema } from '../schemas/quote.js';

const router = express.Router();
const QUOTE_TTL = 600; // 10 minutes — just for orphan cleanup, version handles real invalidation
const QUOTE_CACHE_VERSION = '2';

function serializeItems(items) {
  return items
    .slice()
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map(a => `${a.sku}:${a.quantity}`)
    .join(',');
}

async function quoteCacheKey(bases, addons) {
  const productVersion = await redis.get('product:version') || '0';
  return `quote:v${QUOTE_CACHE_VERSION}:p${productVersion}:${serializeItems(bases)}:${serializeItems(addons)}`;
}

// POST /api/quote — return a price breakdown without persisting anything.
router.post('/', validate(quoteSchema), async (req, res, next) => {
  try {
    const { bases = [], addons = [] } = req.body;

    const key = await quoteCacheKey(bases, addons);
    const cached = await redis.get(key);
    if (cached) return res.json(JSON.parse(cached));

    const { items, total } = await buildOrderItems(bases, addons);

    const baseItems  = items.filter(i => i.type === 'BASE');
    const addonItems = items.filter(i => i.type === 'ADDON');

    const result = {
      bases:  baseItems.map(({ sku, price, quantity, subtotal }) => ({ sku, price, quantity, subtotal })),
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
