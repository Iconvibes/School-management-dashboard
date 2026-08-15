import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission, requireClassScope } from "@/lib/policy";
import { attendanceSchema, firstValidationMessage } from "@/lib/validation";

// Local (not UTC) date so registers default to the actual school day
function localDateStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * GET /api/attendance?classArm=&date=YYYY-MM-DD
 * Returns the register for a class arm on a date, with student details.
 * SUPER_ADMIN may read any arm; TEACHER only their assigned arm.
 */
export async function GET(request) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER"], "attendance.view");
  if (isDenied(session)) return session;

  const { searchParams } = new URL(request.url);
  let classArm = searchParams.get("classArm") || "";
  const date = searchParams.get("date") || localDateStr();

  if (!classArm) return jsonError("classArm query param is required");

  // Teachers may only read their assigned arm.
  const scope = await requireClassScope(session, { classArm, mode: "validate" });
  if (isDenied(scope)) return scope;

  const [register, students] = await Promise.all([
    store.getAttendance(session.schoolId, classArm, date),
    store.listUsers({ schoolId: session.schoolId, role: "STUDENT", classArm }),
  ]);

  const presentMap = {};
  (register?.records || []).forEach((r) => {
    presentMap[r.studentId] = r.present;
  });

  const rows = students.map((s) => ({
    studentId: s.id,
    name: s.name,
    email: s.email,
    present: presentMap[s.id] ?? null, // null = not marked yet
  }));

  const marked = rows.filter((r) => r.present !== null).length;

  return Response.json({
    date,
    classArm,
    rows,
    marked,
    total: rows.length,
    present: rows.filter((r) => r.present === true).length,
  });
}

/**
 * POST /api/attendance — save a register { classArm, date, rows: [{studentId, present}] }
 */
export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER"], "attendance.mark");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const invalid = firstValidationMessage(attendanceSchema, body);
  if (invalid) return jsonError(invalid);
  const { classArm, date, rows } = attendanceSchema.parse(body);

  // Teachers may only mark their assigned arm.
  const scope = await requireClassScope(session, { classArm, mode: "validate" });
  if (isDenied(scope)) return scope;

  // Tenant isolation: every marked student must belong to this school
  const tenantStudents = await store.listUsers({
    schoolId: session.schoolId,
    role: "STUDENT",
  });
  const tenantIds = new Set(tenantStudents.map((s) => s.id));
  const foreign = rows.find((r) => !tenantIds.has(r.studentId));
  if (foreign) return jsonError("One or more students do not belong to your school", 403);

  const saved = await store.saveAttendance(session.schoolId, classArm, date, rows);
  return Response.json({ success: true, register: saved });
}
