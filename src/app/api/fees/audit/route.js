import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/fees/audit — the school's fee audit trail, newest first.
 * SUPER_ADMIN and BURSAR, tenant-scoped: every entry carries the caller's
 * schoolId, so one school can never see another's reconciliation history.
 */
export async function GET() {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR"], "fees.audit.view");
  if (isDenied(session)) return session;

  const entries = await store.listFeeAudit(session.schoolId, { limit: 100 });
  return Response.json({ entries });
}
