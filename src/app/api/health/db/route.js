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
 */
export async function GET() {
  if (isDemoMode()) {
    return Response.json({ status: "ok", mode: "demo", db: "demo-store" });
  }
  const state = mongoose.connection.readyState;
  if (state === 1) {
    return Response.json({ status: "ok", mode: "mongo", readyState: state });
  }
  return Response.json(
    { status: "degraded", mode: "mongo", readyState: state },
    { status: 503 }
  );
}
