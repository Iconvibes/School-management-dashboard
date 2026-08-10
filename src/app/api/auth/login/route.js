import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { store } from "@/lib/store";
import { setAuthCookie, setMfaCookie, jsonError } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolvePostLoginRedirect } from "@/lib/portal-guard";
import { MFA_ROLES } from "@/lib/permissions";
import { signMfaToken } from "@/lib/token";

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

  const { email, password, role, schoolId, next } = body;
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

  // Staff must complete a second factor (or enroll) before ANY session is
  // issued — the password alone never grants a staff session. The pending
  // ticket is 10 minutes and proves only the first factor in this browser.
  if (MFA_ROLES.includes(user.role)) {
    const hasMfa = !!user.mfaSecret;
    const res = NextResponse.json({
      success: true,
      mfaRequired: hasMfa,
      mfaSetupRequired: !hasMfa,
      // Echoed so the client can carry the deep link through the MFA step
      // (the final verify/confirm re-validates it against the role).
      next: resolvePostLoginRedirect(user.role, next),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
      },
    });
    setMfaCookie(
      res,
      signMfaToken({
        userId: user.id,
        purpose: hasMfa ? "challenge" : "enroll",
        attempts: 0,
      })
    );
    return res;
  }

  // Students and parents stay password-only (self-service portals).
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
    redirect: resolvePostLoginRedirect(user.role, next),
  });

  setAuthCookie(res, {
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
  });
  return res;
}
