// Seed minimal products for local testing.
import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../src/models/Product.js';
import { redis } from '../src/lib/redis.js';

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI missing');
  await mongoose.connect(uri, { autoIndex: true });

  // Clear and insert a small dataset.
  const previousSkus = await Product.distinct('sku');
  await Product.deleteMany({});
  const products = await Product.insertMany([
    {
      name: 'Essential First Aid Kit',
      sku: 'BASE-FIRST-AID',
      type: 'BASE',
      price: 39,
      imageUrl: '/products/essential-first-aid-kit.webp',
      stock: { total: 50 },
    },
    {
      name: 'Wound Care Pack',
      sku: 'ADD-WOUND-CARE',
      type: 'ADDON',
      price: 12,
      imageUrl: '/products/wound-care-pack.webp',
      stock: { total: 200 },
    },
    {
      name: 'Burn Relief Pack',
      sku: 'ADD-BURN-RELIEF',
      type: 'ADDON',
      price: 14,
      imageUrl: '/products/burn-relief-pack.webp',
      stock: { total: 150 },
    },
    {
      name: 'Outdoor Emergency Pack',
      sku: 'ADD-OUTDOOR',
      type: 'ADDON',
      price: 18,
      imageUrl: '/products/outdoor-emergency-pack.webp',
      stock: { total: 100 },
    },
  ]);

  const cacheKeys = [...new Set([...previousSkus, ...products.map(product => product.sku)])]
    .map(sku => `product:${sku}`);
  if (cacheKeys.length > 0) await redis.del(...cacheKeys);
  await redis.incr('product:version');

  console.log('Seeded products');
  await redis.quit();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
