import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

export async function GET(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const isTeacher = session.role === "TEACHER";

  if (isTeacher) {
    const performance = await store.getTeacherPerformance(session.schoolId, session.userId);
    return NextResponse.json({ performance });
  }

  const teacherId = searchParams.get("teacherId");
  if (teacherId) {
    const performance = await store.getTeacherPerformance(session.schoolId, teacherId);
    return NextResponse.json({ performance });
  }

  // Return performance for all teachers
  const users = await store.listUsers?.(session.schoolId, { role: "TEACHER" }) || [];
  const allPerformance = [];

  for (const teacher of users) {
    const perf = await store.getTeacherPerformance(session.schoolId, teacher.id);
    if (perf.classMetrics.length > 0) {
      allPerformance.push({
        teacherId: teacher.id,
        teacherName: teacher.name,
        ...perf,
      });
    }
  }

  allPerformance.sort((a, b) => b.overallAverage - a.overallAverage);
  return NextResponse.json({ performance: allPerformance });
}
