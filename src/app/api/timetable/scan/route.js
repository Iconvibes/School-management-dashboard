import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { runConflictScan } from "@/lib/conflict-scan";

/**
 * POST /api/timetable/scan — the admin's manual "Scan now" (Overview health
 * card / Timetable tab). SUPER_ADMIN only. Always scans and records, so a
 * fresh conflict is flagged as "new" the moment the admin checks.
 */
export async function POST() {
  const session = await requirePermission(["SUPER_ADMIN"], "timetable.manage");
  if (isDenied(session)) return session;
  const result = await runConflictScan({ store, schoolId: session.schoolId });
  return Response.json(result);
}
