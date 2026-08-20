import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

export async function GET(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const severity = searchParams.get("severity") || "all";
  const classArm = searchParams.get("classArm") || undefined;

  const risks = await store.detectAcademicRisks(session.schoolId);

  let filtered = risks;
  if (severity !== "all") {
    filtered = filtered.filter((r) => r.severity === severity);
  }
  if (classArm) {
    filtered = filtered.filter((r) => r.classArm === classArm);
  }

  // Enrich with student names
  const enriched = [];
  for (const risk of filtered) {
    const student = await store.findUserById?.(risk.studentId);
    enriched.push({
      ...risk,
      studentName: student?.name || "Unknown",
      studentEmail: student?.email || "",
    });
  }

  return NextResponse.json({ risks: enriched, total: enriched.length });
}
