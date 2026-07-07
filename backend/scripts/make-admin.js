// Usage: node scripts/make-admin.js <email>
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/make-admin.js <email>');
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const user = await User.findOneAndUpdate(
  { email },
  { role: 'admin' },
  { new: true }
);

if (!user) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

console.log(`✅ ${user.email} is now admin`);
await mongoose.disconnect();
