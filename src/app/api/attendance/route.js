import { getSession, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";

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
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "SUPER_ADMIN" && session.role !== "TEACHER") {
    return jsonError("Forbidden", 403);
  }

  const { searchParams } = new URL(request.url);
  let classArm = searchParams.get("classArm") || "";
  const date = searchParams.get("date") || localDateStr();

  if (!classArm) return jsonError("classArm query param is required");

  if (session.role === "TEACHER") {
    const teacher = await store.findUserById(session.userId);
    if (!teacher) return jsonError("Account no longer exists", 401);
    if (!teacher.assignedClass) {
      return jsonError("You have not been assigned a class arm yet. Contact your school admin.", 403);
    }
    if (classArm !== teacher.assignedClass) {
      return jsonError("Teachers can only access their assigned class", 403);
    }
  }

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
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "SUPER_ADMIN" && session.role !== "TEACHER") {
    return jsonError("Forbidden", 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { classArm, date, rows } = body;
  if (!classArm || !date || !Array.isArray(rows) || rows.length === 0) {
    return jsonError("classArm, date and rows[] are required");
  }

  if (session.role === "TEACHER") {
    const teacher = await store.findUserById(session.userId);
    if (!teacher) return jsonError("Account no longer exists", 401);
    if (!teacher.assignedClass || teacher.assignedClass !== classArm) {
      return jsonError("Teachers can only record attendance for their assigned class", 403);
    }
  }

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
