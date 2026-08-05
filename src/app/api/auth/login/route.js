import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { store } from "@/lib/store";
import { setAuthCookie, jsonError } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const ROLE_HOME = {
  SUPER_ADMIN: "/admin/dashboard",
  TEACHER: "/teacher/dashboard",
  STUDENT: "/student/dashboard",
  PARENT: "/parent/dashboard",
};

export async function POST(request) {
  // Brute-force guard: 10 login attempts per IP per 15 minutes.
  const limited = checkRateLimit({
    request,
    windowMs: 15 * 60 * 1000,
    max: 10,
    prefix: "auth-login",
  });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { email, password, role, schoolId } = body;
  if (!schoolId) {
    return jsonError("Please select your school first");
  }
  if (!email || !password) {
    return jsonError("Email and password are required");
  }

  // School-scoped lookup: a teacher/student of School A can NEVER sign in
  // with credentials that belong to School B — even with an identical email.
  const user = await store.findUserByEmailInSchool(schoolId, email);
  if (!user) {
    return jsonError("Invalid credentials for this school", 401);
  }

  if (role && user.role !== role) {
    return jsonError(
      `This account is registered as ${user.role}. Please select the correct portal.`,
      401
    );
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return jsonError("Invalid credentials for this school", 401);
  }

  const school = await store.getSchoolById(schoolId);

  const res = NextResponse.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      assignedClass: user.assignedClass,
      payrollStatus: user.payrollStatus,
    },
    school: {
      id: school?.id || schoolId,
      name: school?.name || "",
      brandColor: school?.brandColor || "#2563EB",
    },
    redirect: ROLE_HOME[user.role] || "/",
  });

  setAuthCookie(res, {
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
  });
  return res;
}
