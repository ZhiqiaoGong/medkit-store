// Simple Mongo connection helper using Mongoose.
import mongoose from 'mongoose';

export async function connectMongo(uri) {
  if (!uri) throw new Error('MONGO_URI is missing');
  // Enable strict query parsing for safer filters.
  mongoose.set('strictQuery', true);
  // Connect with default options; autoIndex is fine for dev.
  await mongoose.connect(uri, { autoIndex: true });
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}
