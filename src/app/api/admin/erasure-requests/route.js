/**
 * Admin API — GDPR Erasure Requests
 *
 * GET  /api/admin/erasure-requests — list all requests
 * POST /api/admin/erasure-requests — approve or reject a request
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/policy";
import { store } from "@/lib/store";

export async function GET() {
  const session = await requirePermission(["SUPER_ADMIN"], "school.edit");
  if (session instanceof NextResponse) return session;

  const requests = await store.listErasureRequests(session.schoolId);
  return NextResponse.json({ requests });
}

export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "school.edit");
  if (session instanceof NextResponse) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { requestId, approved } = body;
  if (!requestId || typeof approved !== "boolean") {
    return NextResponse.json(
      { error: "requestId and approved (boolean) are required" },
      { status: 400 }
    );
  }

  const updated = await store.reviewErasureRequest(requestId, {
    approved,
    reviewedBy: session.userId,
  });

  if (!updated) {
    return NextResponse.json(
      { error: "Request not found or already processed" },
      { status: 404 }
    );
  }

  if (approved) {
    const result = await store.executeErasureRequest(requestId, {
      executedBy: session.userId,
    });
    return NextResponse.json({
      request: result?.request || updated,
      deleted: result?.deleted || null,
      message: "Erasure request approved and executed. User data permanently deleted.",
    });
  }

  return NextResponse.json({
    request: updated,
    message: "Erasure request rejected.",
  });
}
