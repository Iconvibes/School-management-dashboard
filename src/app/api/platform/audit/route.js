import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/audit
 * List audit log entries (platform admin only).
 * Query params: action, schoolId, search, limit, offset
 */
export async function GET(req) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || undefined;
  const schoolId = searchParams.get("schoolId") || undefined;
  const search = searchParams.get("search") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const limit = searchParams.has("limit") ? Number(searchParams.get("limit")) : 50;
  const offset = searchParams.has("offset") ? Number(searchParams.get("offset")) : 0;

  const result = await store.listAuditLogs({ action, schoolId, search, from, to, limit, offset });
  const stats = await store.getAuditLogStats();

  return Response.json({ ...result, stats });
}
