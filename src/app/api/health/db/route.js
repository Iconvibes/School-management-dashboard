import mongoose from "mongoose";
import { isDemoMode } from "@/lib/store";

/**
 * GET /api/health/db — database readiness probe for load balancers, k8s
 * liveness checks and UptimeRobot. Public, cheap, no auth.
 *
 *   - demo mode: always ok (the demo store has no external dependency);
 *   - Mongo mode: ok only when the Mongoose pool is CONNECTED (readyState 1),
 *     otherwise 503 degraded — so an orchestrator can take an instance out
 *     of rotation before a Mongo outage turns its requests into 10s timeouts.
 *
 * Extended for 100k scaling: includes Mongo pool utilization stats,
 * SSE connection counts, and cache driver info so operators can monitor
 * saturation before it causes failures.
 */
export async function GET() {
  // Lazy imports: sse-manager has a module-level setInterval that keeps
  // the process alive — importing it eagerly during tests hangs the runner.
  const [{ getConnectionStats }, { cacheDriverName }] = await Promise.all([
    import("@/lib/sse-manager"),
    import("@/lib/cache"),
  ]);

  if (isDemoMode()) {
    const sse = getConnectionStats();
    return Response.json({
      status: "ok",
      mode: "demo",
      db: "demo-store",
      cache: cacheDriverName(),
      sse: { totalConnections: sse.totalConnections, schools: sse.totalSchools },
    });
  }

  const state = mongoose.connection.readyState;

  if (state !== 1) {
    return Response.json(
      { status: "degraded", mode: "mongo", readyState: state },
      { status: 503 }
    );
  }

  // Pool utilization — the critical metric for connection budgeting.
  let poolStats = null;
  try {
    const admin = mongoose.connection.db.admin();
    const serverStatus = await admin.serverStatus();
    const conn = serverStatus.connections || {};
    poolStats = {
      current: conn.current || 0,    // currently active connections
      available: conn.available || 0, // remaining in pool
      totalCreated: conn.totalCreated || 0, // lifetime connections created
    };
  } catch {
    // serverStatus may not be available on all Mongo tiers (e.g. serverless)
    try {
      poolStats = {
        readyState: mongoose.connection.readyState,
        poolSize: mongoose.connection.db?.pool?.totalConnectionCount?.() || null,
      };
    } catch {
      // Pool stats unavailable — don't fail the health check
    }
  }

  const sse = getConnectionStats();

  return Response.json({
    status: "ok",
    mode: "mongo",
    readyState: state,
    pool: poolStats,
    cache: cacheDriverName(),
    sse: {
      totalConnections: sse.totalConnections,
      schools: sse.totalSchools,
    },
  });
}
