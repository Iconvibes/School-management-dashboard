import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

export function isDemoMode() {
  return !MONGODB_URI;
}

const globalForMongoose = globalThis;

if (!globalForMongoose.mongooseCache) {
  globalForMongoose.mongooseCache = { conn: null, promise: null };
}

export async function connectDB() {
  const cached = globalForMongoose.mongooseCache;
  if (cached.conn) return cached.conn;
  if (!MONGODB_URI) return null;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false })
      .then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
