import { store } from "@/lib/store";
import { isDenied, requireAuth, requireOwnChild } from "@/lib/policy";

/**
 * GET /api/parent/attendance?studentId=xxx
 * Returns daily attendance records for a linked child this term.
 * The parent may only view their own children's attendance.
 *
 * Response: { records: [{ date, present }], summary: { total, present, absent } }
 */
export async function GET(request) {
  const session = await requireAuth(["PARENT"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  if (!studentId) {
    return Response.json({ error: "studentId is required" }, { status: 400 });
  }

  // Tenant + relationship check
  const child = await requireOwnChild(session, studentId, "You can only view your own children's attendance");
  if (isDenied(child)) return child;

  // Get daily attendance records for this child this term
  const records = await store.getStudentAttendanceRecords(session.schoolId, studentId);

  const present = records.filter((r) => r.present).length;
  const summary = {
    total: records.length,
    present,
    absent: records.length - present,
  };

  return Response.json({ records, summary });
}
