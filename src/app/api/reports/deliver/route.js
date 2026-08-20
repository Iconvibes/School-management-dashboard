import { NextResponse } from "next/server";
import { isDenied, requirePermission } from "@/lib/policy";
import { deliverReportCards, getDeliveryStatus } from "@/lib/report-delivery";

/**
 * POST /api/reports/deliver — Trigger report card delivery for a class arm.
 * Generates PDFs and notifies parents via all configured channels.
 *
 * GET /api/reports/deliver — Check delivery status for a class arm.
 */
export async function POST(req) {
  const session = await requirePermission(["SUPER_ADMIN"]);
  if (isDenied(session)) return session;

  const body = await req.json();
  const { classArm, channels } = body;

  if (!classArm) {
    return NextResponse.json({ error: "classArm is required" }, { status: 400 });
  }

  const currentSession = body.session || session.school?.currentSession || "2025/2026";
  const currentTerm = body.term || session.school?.currentTerm || "First Term";

  const result = await deliverReportCards({
    schoolId: session.schoolId,
    classArm,
    session: currentSession,
    term: currentTerm,
    school: session.school || {},
    channels: channels || ["in_app", "whatsapp", "sms", "email"],
  });

  return NextResponse.json(result);
}

export async function GET(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const classArm = searchParams.get("classArm");
  const currentSession = searchParams.get("session") || session.school?.currentSession || "2025/2026";
  const currentTerm = searchParams.get("term") || session.school?.currentTerm || "First Term";

  const status = await getDeliveryStatus({
    schoolId: session.schoolId,
    classArm,
    session: currentSession,
    term: currentTerm,
  });

  return NextResponse.json(status);
}
