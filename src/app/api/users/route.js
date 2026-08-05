import { getSession, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";

export async function GET(request) {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "SUPER_ADMIN" && session.role !== "TEACHER") {
    return jsonError("Forbidden", 403);
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") || undefined;
  let classArm = searchParams.get("classArm") || undefined;

  // Teachers may only list students of their own class arm
  if (session.role === "TEACHER") {
    if (role && role !== "STUDENT") return jsonError("Forbidden", 403);
    const user = await store.findUserById(session.userId);
    if (!user) return jsonError("Account no longer exists", 401);
    // Assigned teachers are locked to their class; unassigned may see all students
    if (user.assignedClass) {
      if (!classArm) classArm = user.assignedClass; // default to their own class
      else if (classArm !== user.assignedClass) {
        return jsonError("Teachers can only access their assigned class", 403);
      }
    }
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
    const user = await store.findUserById(session.userId);
    if (!user) return jsonError("Account no longer exists", 401);
    if (user.assignedClass) {
      // Locked to their own class — ignore whatever the client sent.
      assignedClass = user.assignedClass;
    } else {
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
