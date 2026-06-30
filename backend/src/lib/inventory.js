import Product from '../models/Product.js';
import { redis } from './redis.js';

function mergeQuantities(items) {
  const quantities = new Map();
  for (const item of items) {
    quantities.set(item.sku, (quantities.get(item.sku) || 0) + item.quantity);
  }
  return Array.from(quantities, ([sku, quantity]) => ({ sku, quantity }));
}

export async function reserveStock(items) {
  const entries = mergeQuantities(items);
  const reserved = [];

  try {
    for (const entry of entries) {
      const product = await Product.findOneAndUpdate(
        {
          sku: entry.sku,
          active: true,
          $expr: {
            $gte: [
              { $subtract: ['$stock.total', '$stock.reserved'] },
              entry.quantity,
            ],
          },
        },
        { $inc: { 'stock.reserved': entry.quantity } },
        { new: true }
      );

      if (!product) {
        const err = new Error(`Insufficient stock for ${entry.sku}`);
        err.status = 400;
        throw err;
      }
      reserved.push(entry);
    }
  } catch (err) {
    if (reserved.length > 0) await releaseStock(reserved);
    throw err;
  }
}

export async function releaseStock(items) {
  const entries = mergeQuantities(items);
  if (entries.length === 0) return;

  await Product.bulkWrite(
    entries.map(entry => ({
      updateOne: {
        filter: { sku: entry.sku, 'stock.reserved': { $gte: entry.quantity } },
        update: { $inc: { 'stock.reserved': -entry.quantity } },
      },
    }))
  );
}

export async function invalidateStockCache(items) {
  const skus = [...new Set(items.map(item => item.sku))];
  if (skus.length > 0) await redis.del(...skus.map(sku => `product:${sku}`));
  await redis.incr('product:version');
}
