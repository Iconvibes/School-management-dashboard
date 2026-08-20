import { NextResponse } from "next/server";
import { isDenied, requirePermission } from "@/lib/policy";
import { getEngagementSummary, calculateEngagementScore } from "@/lib/engagement";

/**
 * GET /api/admin/engagement — Parent engagement scores for the school.
 *
 * Returns engagement tiers, average score, and disengaged parent list.
 * Admins can use this to proactively reach out to disengaged parents.
 */
export async function GET(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const parentId = searchParams.get("parentId");

  if (parentId) {
    // Individual parent score
    const result = await calculateEngagementScore(session.schoolId, parentId);
    return NextResponse.json(result);
  }

  // Full school summary
  const summary = await getEngagementSummary(session.schoolId);
  return NextResponse.json(summary);
}
