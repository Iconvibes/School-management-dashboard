import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requireAuth, requireClassScope } from "@/lib/policy";

export async function GET(request) {
  const session = await requireAuth(["SUPER_ADMIN", "TEACHER"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") || undefined;
  let classArm = searchParams.get("classArm") || undefined;

  // Teachers may only list students — of their own class arm (assigned), or
  // of any arm (unassigned).
  if (session.role === "TEACHER") {
    if (role && role !== "STUDENT") return jsonError("Forbidden", 403);
    const scope = await requireClassScope(session, { classArm, mode: "resolve", unassigned: "allow" });
    if (isDenied(scope)) return scope;
    classArm = scope.classArm;
  }

  const users = await store.listUsers({
    schoolId: session.schoolId,
    role,
    classArm,
  });

  return Response.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      schoolId: u.schoolId,
      assignedClass: u.assignedClass || "",
      payrollStatus: u.payrollStatus,
      feePaid: u.feePaid,
      parentId: u.parentId || null,
      phone: u.phone || "",
    })),
  });
}

export async function POST(request) {
  const session = await requireAuth(["SUPER_ADMIN", "TEACHER"]);
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

  if (!name || !email || !password || !roleEnum) {
    return jsonError("Name, email, password and role are required");
  }
  if (!["STUDENT", "TEACHER", "PARENT"].includes(roleEnum)) {
    return jsonError("Role must be STUDENT, TEACHER or PARENT");
  }
  if (String(password).length < 6) {
    return jsonError("Password must be at least 6 characters");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return jsonError("Please provide a valid email address");
  }

  // Teachers may only add STUDENT accounts, and only into their own class arm.
  // (An unassigned teacher may add students to any arm of the school.)
  if (session.role === "TEACHER") {
    if (roleEnum !== "STUDENT") {
      return jsonError("Teachers can only add student accounts", 403);
    }
    const scope = await requireClassScope(session, { classArm: assignedClass, mode: "force", unassigned: "allow" });
    if (isDenied(scope)) return scope;
    assignedClass = scope.classArm;
    if (!scope.teacher.assignedClass) {
      if (!assignedClass) {
        return jsonError("Please choose a class arm for this student");
      }
      const school = await store.getSchoolById(session.schoolId);
      if (!(school?.activeArms || []).includes(assignedClass)) {
        return jsonError("Please choose a valid class arm");
      }
    }
  }

  const existing = await store.findUserByEmailInSchool(session.schoolId, email);
  if (existing) return jsonError("An account with this email already exists in your school");

  const user = await store.createUser({
    schoolId: session.schoolId,
    name,
    email,
    password,
    role: roleEnum,
    assignedClass,
    phone,
  });

  // Never return the password hash — same strip the GET route applies.
  const { password: _pw, ...safeUser } = user;

  return Response.json(
    { success: true, user: safeUser },
    { status: 201 }
  );
}
