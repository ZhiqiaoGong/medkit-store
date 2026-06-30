// Minimal Product CRUD. Input validation is intentionally simple for now.
import { Router } from 'express';
import Product from '../models/Product.js';
import { validate } from '../middlewares/validate.js';
import { productCreateSchema, productUpdateSchema } from '../schemas/product.js';
import { redis } from '../lib/redis.js';
import { requireAdmin } from '../middlewares/auth.js';

const PRODUCT_TTL = 300; // seconds
const cacheKey = (sku) => `product:${sku}`;

const router = Router();

// Create a new product (BASE or ADDON).
router.post('/products', requireAdmin, validate(productCreateSchema), async (req, res, next) => {
  try {
    const doc = await Product.create(req.body);
    await redis.incr('product:version');
    res.status(201).json(doc);
  } catch (err) {
    // Handle duplicate SKU error nicely.
    if (err?.code === 11000) {
      err.status = 409;
      err.message = 'SKU already exists';
    }
    next(err);
  }
});

// List products with optional filters (?type=BASE|ADDON&active=true|false).
router.get('/products', async (req, res, next) => {
  try {
    const { type, active } = req.query;
    const q = {};
    if (type) q.type = type;
    if (active !== undefined) q.active = active === 'true';
    const list = await Product.find(q).sort({ createdAt: -1 }).limit(200);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// Get a single product by SKU.
router.get('/products/:sku', async (req, res, next) => {
  try {
    const key = cacheKey(req.params.sku);
    const cached = await redis.get(key);
    if (cached) return res.json(JSON.parse(cached));

    const doc = await Product.findOne({ sku: req.params.sku });
    if (!doc) return res.status(404).json({ error: 'Product not found' });

    await redis.setex(key, PRODUCT_TTL, JSON.stringify(doc));
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// Patch update by Mongo _id.
router.patch('/products/:id', requireAdmin, validate(productUpdateSchema), async (req, res, next) => {
  try {
    const doc = await Product.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Product not found' });

    const previousSku = doc.sku;
    doc.set(req.body);
    if (doc.stock.reserved > doc.stock.total) {
      return res.status(400).json({ error: 'Reserved stock cannot exceed total stock' });
    }
    await doc.save();

    await redis.del(...new Set([cacheKey(previousSku), cacheKey(doc.sku)]));
    await redis.incr('product:version');
    res.json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      err.status = 409;
      err.message = 'SKU already exists';
    }
    next(err);
  }
});

// Delete by Mongo _id.
router.delete('/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const doc = await Product.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Product not found' });
    await redis.del(cacheKey(doc.sku));
    await redis.incr('product:version');
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
