import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { readConflictHealth } from "@/lib/conflict-scan";

/**
 * GET /api/timetable/health — the admin Overview's Schedule Health metric.
 * SUPER_ADMIN only. Returns the school's most recent timetable-conflict scan
 * (counts + resolved conflicts + "new since last scan") plus the next
 * scheduled fixed-hour scan. READ ONLY: scanning is the daily background
 * job's (src/instrumentation.js) and the admin's manual "Scan now" job —
 * a dashboard load can never trigger one.
 */
export async function GET(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "timetable.manage");
  if (isDenied(session)) return session;
  const health = await readConflictHealth({ store, schoolId: session.schoolId });
  return Response.json(health);
}
