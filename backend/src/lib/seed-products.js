import Product from '../models/Product.js';
import { redis } from './redis.js';
import { sampleProducts } from './sample-products.js';

export async function seedSampleProducts({ onlyIfEmpty = true } = {}) {
  if (onlyIfEmpty) {
    const count = await Product.estimatedDocumentCount();
    if (count > 0) {
      return { inserted: 0, skipped: true, reason: 'products collection is not empty' };
    }
  }

  const operations = sampleProducts.map((product) => ({
    updateOne: {
      filter: { sku: product.sku },
      update: { $setOnInsert: product },
      upsert: true,
    },
  }));

  const result = await Product.bulkWrite(operations, { ordered: false });
  const cacheKeys = sampleProducts.map((product) => `product:${product.sku}`);
  if (cacheKeys.length > 0) await redis.del(...cacheKeys);
  await redis.incr('product:version');

  return {
    inserted: result.upsertedCount ?? 0,
    skipped: false,
  };
}

export async function seedSampleProductsOnBoot() {
  if (process.env.AUTO_SEED_PRODUCTS === 'false') {
    console.log('ℹ️ sample product seed disabled by AUTO_SEED_PRODUCTS=false');
    return;
  }

  const result = await seedSampleProducts({ onlyIfEmpty: true });
  if (result.skipped) {
    console.log('ℹ️ sample product seed skipped: products collection is not empty');
    return;
  }

  console.log(`✅ sample product seed complete: ${result.inserted} inserted`);
}
