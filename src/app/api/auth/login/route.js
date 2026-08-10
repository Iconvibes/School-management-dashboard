// `next/server.js` (not `next/server`): Next aliases the extensionless form
// internally, but plain `node --test` resolves this file's imports too.
import { NextResponse } from "next/server.js";
import bcrypt from "bcryptjs";
import { store } from "@/lib/store";
import { setAuthCookie, jsonError } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolvePostLoginRedirect } from "@/lib/portal-guard";
import { matchesChildName } from "@/lib/passwords";

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

  let ok = await bcrypt.compare(password, user.password);
  // Parents sign in with their email plus ANY linked child's full name (e.g.
  // "Adam Tope Johnson" → "adamtopejohnson") — one parent, several children,
  // all reachable from the same session. The stored hash matches the most
  // recently linked child; this fallback accepts the rest.
  if (!ok && user.role === "PARENT") {
    const children = await store.getChildren(user.id);
    ok = matchesChildName(password, children);
  }
  if (!ok) {
    return jsonError("Invalid credentials for this school", 401);
  }

  // Frozen or deleted school: block everyone except the founding SUPER_ADMIN,
  // who must be able to get back in to reactivate (frozen) or restore
  // (deleted, within the 30-day grace period). An EXPIRED deleted school is
  // purged right here — the lazy check that guarantees the wipe happens even
  // if the background sweeper hasn't run yet. All of this runs AFTER the
  // password so a wrong password still gets the generic error — account
  // status is never leaked to credential guessing.
  const schoolRec = await store.getSchoolById(user.schoolId);
  if (schoolRec?.status === "frozen" && user.role !== "SUPER_ADMIN") {
    return jsonError(
      "This school's account has been deactivated. Please contact your school administrator.",
      403
    );
  }
  if (schoolRec?.status === "deleted") {
    const graceOver =
      !schoolRec.deletedAt ||
      Date.parse(schoolRec.deletedAt) + store.SCHOOL_DELETION_GRACE_MS <= Date.now();
    if (graceOver) {
      // Best-effort — the wipe must never be blocked by a store hiccup.
      await store.purgeSchool(user.schoolId).catch(() => {});
      return jsonError(
        "This school's account was permanently deleted. Please contact support if this is a mistake.",
        403
      );
    }
    if (user.role !== "SUPER_ADMIN") {
      return jsonError(
        "This school's account has been deleted and can still be restored by the school administrator.",
        403
      );
    }
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
    redirect: resolvePostLoginRedirect(user.role, next),
  });

  setAuthCookie(res, {
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
    // Session-revocation stamp: requireAuth rejects any token whose version
    // is older than the live account (a password change bumps it).
    tokenVersion: user.tokenVersion || 0,
  });
  return res;
}
