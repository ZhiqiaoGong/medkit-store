// Seed minimal products for local testing.
import 'dotenv/config';
import mongoose from 'mongoose';
import { redis } from '../src/lib/redis.js';
import { seedSampleProducts } from '../src/lib/seed-products.js';

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI or MONGODB_URI missing');
  await mongoose.connect(uri, { autoIndex: true });

  const result = await seedSampleProducts({ onlyIfEmpty: false });
  console.log(`Seeded products: ${result.inserted} inserted`);
  await redis.quit();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
