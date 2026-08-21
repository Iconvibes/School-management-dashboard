import mongoose from "mongoose";
import { installTenantScope } from "@/lib/tenant-scope";

// Fail-closed tenant scoping: register the guard BEFORE any model compiles.
// Models are only ever compiled through mongo-store's import chain, and
// db.js is its first import — so this always runs first. The plugin
// self-selects schemas that carry a schoolId path (see tenant-scope.js).
installTenantScope();

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
        // 100k-concurrent-user tuning. At 100k users with 20-30 instances,
        // the pool budget is: instances × maxPoolSize = total Mongo connections.
        // 20 × 200 = 4,000 max (MongoDB Atlas M50+ supports 5,000+).
        // minPoolSize keeps warm connections ready (avoids cold-connect
        // latency on traffic bursts). maxIdleTimeMS releases stale connections.
        // waitQueueTimeoutMS fails fast when the pool is saturated.
        maxPoolSize: Number(process.env.MONGODB_POOL_SIZE) || 200,
        minPoolSize: 10,
        maxIdleTimeMS: 30000,
        waitQueueTimeoutMS: 5000,
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

/**
 * Close the Mongo connection and reset the cache (graceful shutdown).
 * No-op in demo mode or when nothing is connected, so it is safe to call
 * from the server-boot SIGTERM handler in src/instrumentation.js.
 */
export async function closeDB() {
  const cached = globalForMongoose.mongooseCache;
  if (!cached?.conn) return;
  await mongoose.disconnect();
  cached.conn = null;
  cached.promise = null;
}
