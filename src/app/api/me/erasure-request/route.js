/**
 * GDPR Right to Erasure — Erasure Request
 *
 * POST /api/me/erasure-request — submit a data-deletion request
 * GET  /api/me/erasure-request — check request status
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/policy";
import { store } from "@/lib/store";

export async function GET() {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const request = await store.getErasureRequest(session.schoolId, session.userId);
  return NextResponse.json({ request: request || null });
}

export async function POST(request) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const existing = await store.getErasureRequest(session.schoolId, session.userId);
  if (existing && existing.status === "PENDING") {
    return NextResponse.json(
      { error: "You already have a pending erasure request" },
      { status: 409 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const erasureRequest = await store.createErasureRequest({
    schoolId: session.schoolId,
    userId: session.userId,
    userName: session.name || "Unknown",
    reason: body.reason || "",
  });

  if (typeof store.logDataAccess === "function") {
    await store.logDataAccess({
      schoolId: session.schoolId,
      actorId: session.userId,
      actorName: session.name || "Unknown",
      actorRole: session.role,
      action: "ERASURE_REQUEST",
      targetType: "USER",
      targetId: session.userId,
      detail: `Data erasure requested. Request ID: ${erasureRequest.id}`,
    });
  }

  return NextResponse.json({
    request: erasureRequest,
    message:
      "Your erasure request has been submitted. Your school administrator will review it.",
  });
}
