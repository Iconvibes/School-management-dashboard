import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { DAYS, isPeriod, isSchoolDay } from "@/lib/timetable";
import { runConflictScan } from "@/lib/conflict-scan";

// Who may read the timetable. Teachers see their assigned arms, students
// their own arm, parents their children's arms; staff see every arm. Writes
// are SUPER_ADMIN-only (timetable.manage) — the schedule is set by the admin,
// not by the people on it.
const TIMETABLE_ROLES = ["SUPER_ADMIN", "TEACHER", "PARENT", "STUDENT"];

/** School-week display order (Monday first, not alphabetical). */
function sortEntries(entries) {
  return [...entries].sort(
    (a, b) =>
      DAYS.indexOf(a.day) - DAYS.indexOf(b.day) ||
      Number(a.period) - Number(b.period)
  );
}

/**
 * GET /api/timetable?classArm=&day=
 * Role-scoped weekly schedule:
 *   - SUPER_ADMIN (staff): any arm — ?classArm narrows, otherwise all arms.
 *   - TEACHER: only their assigned arms (subject-specialist scope).
 *   - STUDENT: only their own class arm.
 *   - PARENT: only their linked children's arms.
 * Each entry carries the teacher's name; the caller's own UI decides how to
 * highlight (a teacher's portal highlights their own slots).
 */
export async function GET(request) {
  const session = await requirePermission(TIMETABLE_ROLES, "timetable.view");
  if (isDenied(session)) return session;

  const { searchParams } = new URL(request.url);
  // conflicts=1 — SUPER_ADMIN-only integrity scan across EVERY arm, including
  // pre-existing data (legacy imports, manual edits). Lists teachers booked in
  // two arms at the same day+period, plus any duplicated arm slots. Also
  // records the scan (and diffs vs the previous one), so the Timetable tab's
  // button keeps the Overview health metric fresh.
  if (searchParams.get("conflicts") === "1") {
    if (session.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);
    const result = await runConflictScan({ store, schoolId: session.schoolId });
    return Response.json({
      conflicts: result.conflicts,
      scannedAt: result.scannedAt,
      newConflictCount: result.newConflictCount,
    });
  }

  const classArm = searchParams.get("classArm") || "";
  const day = searchParams.get("day") || "";
  // mine=1 (TEACHER only): return ONLY the caller's own slots — the class-alert
  // scheduler and the "my timetable" view must never ring or show a colleague's
  // class. Without it, teachers get every slot in their arms (the grid-style
  // view) and filter client-side for display.
  const mine = searchParams.get("mine") === "1";

  // null = any arm (staff). Everyone else is locked to their own arms.
  let allowedArms = null;
  if (session.role === "TEACHER" || session.role === "STUDENT") {
    const snap = await store.findAuthSnapshot(session.userId);
    allowedArms =
      session.role === "TEACHER"
        ? snap.assignedClasses?.length
          ? snap.assignedClasses
          : snap.assignedClass
            ? [snap.assignedClass]
            : []
        : snap.assignedClass
          ? [snap.assignedClass]
          : [];
    if (allowedArms.length === 0) {
      return jsonError(
        session.role === "TEACHER"
          ? "You have not been assigned a class arm yet. Contact your school admin."
          : "You are not assigned to a class arm yet.",
        403
      );
    }
  } else if (session.role === "PARENT") {
    const children = await store.getChildren(session.userId);
    allowedArms = [...new Set(children.map((c) => c.assignedClass).filter(Boolean))];
    if (allowedArms.length === 0) {
      return jsonError("Your linked children are not assigned to a class arm yet.", 403);
    }
  }

  if (classArm && allowedArms && !allowedArms.includes(classArm)) {
    return jsonError("Forbidden", 403);
  }

  let entries = await store.getTimetable({
    schoolId: session.schoolId,
    day: day || undefined,
  });
  if (classArm) entries = entries.filter((e) => e.classArm === classArm);
  else if (allowedArms) entries = entries.filter((e) => allowedArms.includes(e.classArm));
  // mine=1 locks the list to the caller's own teaching slots (and is rejected
  // for non-teachers — only they have a personal weekly schedule).
  if (mine) {
    if (session.role !== "TEACHER") return jsonError("Forbidden", 403);
    entries = entries.filter((e) => e.teacherId === session.userId);
  }

  // Resolve teacher names so both portals can render "who teaches" without a
  // second request (the lists are small: one row per teacher).
  const teachers = await store.listUsers({ schoolId: session.schoolId, role: "TEACHER" });
  const nameById = Object.fromEntries(teachers.map((t) => [t.id, t.name]));
  entries = sortEntries(entries).map((e) => ({
    ...e,
    teacherName: nameById[e.teacherId] || "Unassigned",
  }));

  return Response.json({ entries, arms: allowedArms, day: day || null });
}

/**
 * POST /api/timetable — assign a slot { classArm, day, period, subject, teacherId }.
 * SUPER_ADMIN only. Validates:
 *   - the arm belongs to the school
 *   - the teacher exists in this school AND actually teaches that subject in
 *     that arm (the subject-specialist model — a Mathematics teacher cannot
 *     be scheduled for Physics)
 *   - the teacher isn't already booked in another arm at that day + period
 *     (a teacher cannot be in two classes at once)
 */
export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "timetable.manage");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }
  const { classArm, day, period, subject, teacherId } = body || {};
  if (!classArm || !isSchoolDay(day) || !isPeriod(period) || !subject || !teacherId) {
    return jsonError("classArm, day, period, subject and teacherId are required");
  }
  const periodNum = Number(period);

  const school = await store.getSchoolById(session.schoolId);
  // No arms configured yet → the admin must set those up first; never accept
  // an arbitrary arm string against an empty list.
  if (!school?.activeArms?.length) {
    return jsonError("No class arms configured yet — add them in school settings first", 400);
  }
  if (!school.activeArms.includes(classArm)) {
    return jsonError("That class arm does not exist in your school", 400);
  }

  // Resolve the teacher through the roster (one query, no ObjectId casting
  // edge cases) and check their subject-specialist scope.
  const teachers = await store.listUsers({ schoolId: session.schoolId, role: "TEACHER" });
  const teacher = teachers.find((t) => t.id === teacherId);
  if (!teacher) return jsonError("Teacher not found in your school", 400);
  if (teacher.subjects?.length && !teacher.subjects.includes(subject)) {
    return jsonError(`${teacher.name} does not teach ${subject}`, 400);
  }
  if (teacher.assignedClasses?.length && !teacher.assignedClasses.includes(classArm)) {
    return jsonError(`${teacher.name} is not assigned to ${classArm}`, 400);
  }

  // A teacher cannot be in two classes at the same time.
  const conflict = await store.getTimetableConflict({
    schoolId: session.schoolId,
    teacherId,
    day,
    period: periodNum,
    excludeClassArm: classArm,
  });
  if (conflict) {
    return jsonError(
      `${teacher.name} already teaches ${conflict.subject} in ${conflict.classArm} on ${day}, period ${periodNum}`,
      400
    );
  }

  const entry = await store.saveTimetableEntry({
    schoolId: session.schoolId,
    classArm,
    day,
    period: periodNum,
    subject,
    teacherId,
  });
  return Response.json({ success: true, entry: { ...entry, teacherName: teacher.name } });
}

/** DELETE /api/timetable — free a slot { classArm, day, period }. SUPER_ADMIN only. */
export async function DELETE(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "timetable.manage");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }
  const { classArm, day, period } = body || {};
  if (!classArm || !isSchoolDay(day) || !isPeriod(period)) {
    return jsonError("classArm, day and period are required");
  }

  const removed = await store.deleteTimetableEntry({
    schoolId: session.schoolId,
    classArm,
    day,
    period: Number(period),
  });
  return Response.json({ success: removed });
}
