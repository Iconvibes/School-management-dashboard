import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission, requireClassScope } from "@/lib/policy";

export async function GET(request) {
  // BURSAR is included so their dashboard loads (the admin console fetches
  // the roster on mount regardless of role); viewing names/emails for
  // reconciliation is a legitimate bursar need. Editing is still gated.
  const session = await requirePermission(
    ["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER"],
    "roster.view"
  );
  if (isDenied(session)) return session;

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") || undefined;
  let classArm = searchParams.get("classArm") || undefined;

  // Opt-in pagination: ?limit=200&offset=400. A hard cap keeps a huge page
  // from ever materializing; omitting limit keeps the legacy whole-roster
  // behavior (the admin console still fetches everything today — flip it to
  // paged calls once a school exceeds ~1-2k students; see docs/scaling.md).
  const limitRaw = searchParams.get("limit");
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  // Math.floor: a non-integer limit would make the demo store slice silently
  // while the Mongo driver throws on limit(50.5) — floor before the cap so
  // both stores see the same value.
  const limit =
    limitRaw === null ? undefined : Math.min(500, Math.max(1, Math.floor(Number(limitRaw)) || 100));

  // Teachers may only list students — of their own class arm (assigned), or
  // of any arm (unassigned).
  if (session.role === "TEACHER") {
    if (role && role !== "STUDENT") return jsonError("Forbidden", 403);
    const scope = await requireClassScope(session, { classArm, mode: "resolve", unassigned: "allow" });
    if (isDenied(scope)) return scope;
    classArm = scope.classArm;
  }

  const query = { schoolId: session.schoolId, role, classArm };
  const [users, total] = await Promise.all([
    store.listUsers({ ...query, limit, offset }),
    limit === undefined ? Promise.resolve(null) : store.countUsers(query),
  ]);

  return Response.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      schoolId: u.schoolId,
      assignedClass: u.assignedClass || "",
      // Subject-specialist teaching scope — the admin's Teachers tab and the
      // teacher dashboard render from these.
      subjects: Array.isArray(u.subjects) ? u.subjects : [],
      assignedClasses: Array.isArray(u.assignedClasses) ? u.assignedClasses : [],
      payrollStatus: u.payrollStatus,
      feePaid: u.feePaid,
      parentId: u.parentId || null,
      phone: u.phone || "",
    })),
    // Present only when the caller asked for a page (paged clients render
    // "X of Y" without a second round-trip).
    ...(total !== null ? { total } : {}),
  });
}

export async function POST(request) {
  const session = await requirePermission(
    ["SUPER_ADMIN", "REGISTRAR", "TEACHER"],
    "students.add"
  );
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { name, email, password, role, phone = "" } = body;
  let assignedClass = body.assignedClass || "";
  // Normalize case: clients may send "student"/"teacher" from UI state.
  const roleEnum = String(role || "").toUpperCase();

  if (!name || !email || !roleEnum) {
    return jsonError("Name, email and role are required");
  }
  // SUPER_ADMIN may create any role; REGISTRAR may build the student roster
  // (students + their parents); TEACHER may only add students.
  if (!["STUDENT", "TEACHER", "PARENT", "BURSAR", "REGISTRAR"].includes(roleEnum)) {
    return jsonError("Role must be STUDENT, TEACHER, PARENT, BURSAR or REGISTRAR");
  }
  if (session.role === "REGISTRAR" && !["STUDENT", "PARENT"].includes(roleEnum)) {
    return jsonError("Registrars can only add student and parent accounts", 403);
  }

  // Students never think about a password: when the admin adds a student
  // without one, it's auto-derived as their name + class arm, all lowercase
  // and unspaced ("Adam Tope" in "JSS1" → "adamtopejss1"). Staff roles
  // always require an admin-chosen password.
  let userPassword = password;
  let generatedPassword = null;
  if (roleEnum === "STUDENT" && !String(userPassword || "").trim()) {
    const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    generatedPassword = `${slug(name)}${slug(assignedClass)}`;
    userPassword = generatedPassword;
  }
  if (!String(userPassword || "")) {
    return jsonError("Password is required");
  }
  if (String(userPassword).length < 6 && !generatedPassword) {
    return jsonError("Password must be at least 6 characters");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return jsonError("Please provide a valid email address");
  }

  // Teachers may only add STUDENT accounts, and only into an arm they teach.
  // (A teacher with NO arms may add students to any arm of the school.)
  if (session.role === "TEACHER") {
    if (roleEnum !== "STUDENT") {
      return jsonError("Teachers can only add student accounts", 403);
    }
    const scope = await requireClassScope(session, { classArm: assignedClass, mode: "force", unassigned: "allow" });
    if (isDenied(scope)) return scope;
    assignedClass = scope.classArm;
    if (!scope.teacher.assignedClasses?.length) {
      if (!assignedClass) {
        return jsonError("Please choose a class arm for this student");
      }
      const school = await store.getSchoolById(session.schoolId);
      if (!(school?.activeArms || []).includes(assignedClass)) {
        return jsonError("Please choose a valid class arm");
      }
    }
  }

  // Teaching assignments (subjects × arms) define a teacher's classroom
  // scope — SUPER_ADMIN-only, same gate as the PATCH route. The gate fires
  // only for NON-EMPTY arrays: the admin console sends subjects: [] on every
  // user create (the shared form state), so a REGISTRAR adding a student must
  // not trip it.
  if ((body.subjects?.length || 0) > 0 || (body.assignedClasses?.length || 0) > 0) {
    if (session.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);
    const valid = (v) => Array.isArray(v) && v.every((s) => typeof s === "string");
    if (body.subjects !== undefined && !valid(body.subjects)) {
      return jsonError("subjects must be an array of strings");
    }
    if (body.assignedClasses !== undefined && !valid(body.assignedClasses)) {
      return jsonError("assignedClasses must be an array of strings");
    }
  }

  const existing = await store.findUserByEmailInSchool(session.schoolId, email);
  if (existing) return jsonError("An account with this email already exists in your school");

  const user = await store.createUser({
    schoolId: session.schoolId,
    name,
    email,
    password: userPassword,
    role: roleEnum,
    assignedClass,
    phone,
    // Subject-specialist teaching scope (SUPER_ADMIN/REGISTRAR add-teacher
    // modal). Students ignore these fields.
    subjects: body.subjects,
    assignedClasses: body.assignedClasses,
  });

  // Never return the password hash — same strip the GET route applies.
  const { password: _pw, ...safeUser } = user;

  // An auto-generated student password is returned ONCE so the admin can
  // hand it to the student — it can never be recovered later (bcrypt).
  return Response.json(
    {
      success: true,
      user: safeUser,
      ...(generatedPassword ? { generatedPassword } : {}),
    },
    { status: 201 }
  );
}
