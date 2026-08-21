/**
 * Admin API — Data Access Audit Log (GDPR Art. 30)
 *
 * GET /api/admin/data-access-log — list audit log entries
 * Supports query params: actorId, action, limit
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/policy";
import { store } from "@/lib/store";

export async function GET(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "school.edit");
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const actorId = searchParams.get("actorId") || undefined;
  const action = searchParams.get("action") || undefined;
  const limit = Number(searchParams.get("limit")) || 100;

  const entries = await store.listDataAccessLog(session.schoolId, {
    actorId,
    action,
    limit,
  });

  return NextResponse.json({ entries });
}
