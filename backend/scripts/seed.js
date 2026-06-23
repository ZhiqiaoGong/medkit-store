// Seed minimal products for local testing.
import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../src/models/Product.js';

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI missing');
  await mongoose.connect(uri, { autoIndex: true });

  // Clear and insert a small dataset
  await Product.deleteMany({});
  await Product.insertMany([
    { name: 'AVP Base 01', sku: 'BASE-AVP-01', type: 'BASE',  price: 2999, version: '1.2.0', stock: { total: 50 } },
    { name: 'Pro Mic',     sku: 'ADD-MIC-PRO', type: 'ADDON', price: 199,  stock: { total: 200 } },
    { name: 'Battery XL',  sku: 'ADD-BATT-XL', type: 'ADDON', price: 149,  stock: { total: 150 } },
    { name: 'Battery Std', sku: 'ADD-BATT-STD', type: 'ADDON', price: 99,   stock: { total: 300 } },
  ]);

  console.log('Seeded products');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
