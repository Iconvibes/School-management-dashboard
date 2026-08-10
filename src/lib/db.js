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
      .connect(MONGODB_URI, {
        bufferCommands: false,
        // 10k-concurrent-user tuning. The default pool is 100; ops can raise
        // or lower it per Mongo tier via MONGODB_POOL_SIZE without code
        // changes. Fail-fast timeouts beat a request queueing on a dead
        // replica for minutes.
        maxPoolSize: Number(process.env.MONGODB_POOL_SIZE) || 100,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        // In production, index builds are an explicit deploy step
        // (`npm run ensure-indexes`): auto-building them on first connect can
        // lock a large collection and stall the app. Dev keeps autoIndex so
        // schemas stay self-contained. See docs/scaling.md.
        autoIndex: process.env.NODE_ENV !== "production",
      })
      .then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
