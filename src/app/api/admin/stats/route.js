import { store } from "@/lib/store";
import { cacheGet, cacheSet } from "@/lib/cache";
import { isDenied, requirePermission } from "@/lib/policy";

// The heaviest page in the app (10+ countDocuments per load) becomes 1 cache
// GET for 99.9% of hits (traffic audit §6.3). 30–60s is the right window: a
// stale dashboard for under a minute beats ten Mongo counts per admin load.
const STATS_TTL_SECONDS = 45;

export async function GET() {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR"], "stats.view");
  if (isDenied(session)) return session;

  const cacheKey = `stats:${session.schoolId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return Response.json({ stats: cached });

  const stats = await store.getDashboardStats(session.schoolId);
  await cacheSet(cacheKey, stats, STATS_TTL_SECONDS);
  return Response.json({ stats });
}
