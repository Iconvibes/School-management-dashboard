// `next/server.js` (not `next/server`): Next aliases the extensionless form
// internally, but plain `node --test` resolves this file's imports too.
import { NextResponse } from "next/server.js";
import bcrypt from "bcrypt";
import { store } from "@/lib/store";
import { setAuthCookie, jsonError } from "@/lib/auth";
import { checkRateLimit, isLockedOut } from "@/lib/rate-limit";
import { loginSchema, firstValidationMessage } from "@/lib/validation";
import { verifyTurnstile } from "@/lib/turnstile";
import { resolvePostLoginRedirect } from "@/lib/portal-guard";
import { matchesChildName, matchesSchoolName } from "@/lib/passwords";

// Failures-only, multi-bucket brute-force guard (checked at each FAILURE
// path, never on success):
//   - the IP bucket (20 failed logins / 15 min) catches scripted distributed
//     attempts across many accounts;
//   - the account bucket (10 failed logins / 15 min per email-or-name + school)
//     catches targeted guessing on one account without locking out the rest of
//     the school — whether or not the account exists (no oracle);
//   - the teacher-name bucket (5 failed logins / 15 min per teacher name +
//     school) blunts the school-name scheme: the school name is PUBLIC (it's
//     in the picker) and it IS every teacher's password, so an attacker who
//     knows the scheme can probe names against it. Each name gets a tighter
//     cap than the account bucket, and the IP bucket still caps how many
//     DIFFERENT names one source can try;
//   - the school bucket (5000 failed logins / 15 min per school) caps one
//     tenant's blast radius — a scripted attack on one school can't burn the
//     shared budget or exhaust Mongo for the other tenants.
//   - the ACCOUNT LOCKOUT: once the account bucket trips (the 10th failure
//     in 15 min), the account is hard-locked for 1 hour — even the CORRECT
//     password is rejected until the hour passes. The lockout is checked
//     BEFORE the user lookup and bcrypt compare, so a locked account costs
//     the server nothing to reject. (The IP bucket deliberately has no
//     lockout: schools share IPs, and at 08:00 one school's NAT can
//     legitimately produce dozens of failed attempts.)
// Successful logins never consume budget, so legitimate role-switching and
// testing can't trip the limiter.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_IP_MAX = 20;
const LOGIN_ACCOUNT_MAX = 10;
const LOGIN_ACCOUNT_LOCKOUT_MS = 60 * 60 * 1000; // 1h hard block after 10 fails
const LOGIN_TEACHER_NAME_MAX = 5;
const LOGIN_SCHOOL_MAX = 5000;

// Human portal names for the role-mismatch message (the login page's tabs).
const PORTAL_LABELS = Object.freeze({
  SUPER_ADMIN: "Super Admin",
  BURSAR: "Bursar",
  REGISTRAR: "Registrar",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent",
});

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  // Zod validation — first invalid field wins. The email/name compound rule
  // runs first on purpose (it must beat the password message, matching the
  // historical behavior; zod refinements would run after field checks).
  const { email, name } = body || {};
  if (!email && !name) {
    return jsonError("Email or name is required");
  }
  const invalid = firstValidationMessage(loginSchema, body);
  if (invalid) return jsonError(invalid);
  const { password, role, schoolId, next } = loginSchema.parse(body);

  // Cloudflare Turnstile bot check — only enforced when TURNSTILE_SECRET_KEY
  // is configured (see src/lib/turnstile.js for the fail-open-on-outage rule).
  const turnstile = await verifyTurnstile(body?.cfTurnstileResponse);
  if (turnstile.enabled && !turnstile.ok) {
    return jsonError("Bot check failed. Please try again.", 403);
  }

  const accountKey = `${String(email || name || "").trim().toLowerCase()}@${schoolId}`;

  // Hard-lockout pre-check — BEFORE the user lookup and bcrypt compare, so a
  // locked account costs the server nothing to reject. (Deliberately vague:
  // revealing the exact lockout length is an oracle for account existence.)
  if (await isLockedOut({ request, prefix: "auth-login", key: accountKey })) {
    return jsonError(
      "Too many failed attempts for this account. Please try again later.",
      429
    );
  }

  // Record the failed attempt in EVERY applicable bucket and return the 429
  // when any is exhausted, otherwise the caller's error response.
  const deny = async (status, message) => {
    // Teacher name logins get a THIRD bucket, tighter than the account one
    // (5 vs 10) and keyed on the raw name — so hammering one name trips it
    // before the account bucket would, and parent/email logins never touch it.
    const teacherNameKey =
      name && role === "TEACHER"
        ? `teacher-name:${String(name).trim().toLowerCase()}@${schoolId}`
        : "";
    const limited =
      (await checkRateLimit({
        request,
        windowMs: LOGIN_WINDOW_MS,
        max: LOGIN_IP_MAX,
        prefix: "auth-login",
      })) ||
      (await checkRateLimit({
        request,
        windowMs: LOGIN_WINDOW_MS,
        max: LOGIN_ACCOUNT_MAX,
        prefix: "auth-login",
        key: accountKey,
        // 10th failure in 15 min → 1h hard lockout for this account.
        lockoutMs: LOGIN_ACCOUNT_LOCKOUT_MS,
      })) ||
      (teacherNameKey &&
        (await checkRateLimit({
          request,
          windowMs: LOGIN_WINDOW_MS,
          max: LOGIN_TEACHER_NAME_MAX,
          prefix: "auth-login",
          key: teacherNameKey,
        }))) ||
      (await checkRateLimit({
        request,
        windowMs: LOGIN_WINDOW_MS,
        max: LOGIN_SCHOOL_MAX,
        prefix: "auth-login-school",
        key: `school:${schoolId}`,
      }));
    return limited || jsonError(message, status);
  };

  // School-scoped lookup: a teacher/student of School A can NEVER sign in
  // with credentials that belong to School B — even with an identical email.
  // A provided name resolves a PARENT or TEACHER account of that school
  // (name-based portals — parents sign in by name, and so do teachers). The
  // role hint picks the right lookup; without one, parents are tried first.
  const user = name
    ? role === "TEACHER"
      ? await store.findTeacherByNameInSchool(schoolId, name)
      : await store.findParentByNameInSchool(schoolId, name)
    : await store.findUserByEmailInSchool(schoolId, email);
  if (!user) {
    // A teacher signs in by NAME — so a name that isn't in the school is
    // almost always "the admin never added me", not a typo'd credential.
    // Point them at the school admin instead of a generic failure.
    if (name && role === "TEACHER") {
      return deny(
        401,
        `Sorry, "${String(name).trim()}" doesn't exist in this school. Please contact your school administrator.`
      );
    }
    // Shared, warm, and deliberately account-agnostic: the SAME wording for an
    // unknown account and a wrong password, so the message never reveals
    // whether an account exists (no account oracle) — just what to check.
    return deny(
      401,
      "Sorry, those details didn't match what we have on file. Please double-check your email or name and password, then try again."
    );
  }

  if (role && user.role !== role) {
    const label = PORTAL_LABELS[user.role] || user.role;
    return deny(
      401,
      `Sorry, this account belongs to the ${label} portal. Please switch to that tab and try again.`
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
  // Teachers sign in with their name plus the SCHOOL NAME as the password
  // (slugged — case/spacing-insensitive) — the bootstrap credential, and a
  // school rename never locks anyone out. Legacy email logins keep working
  // through the stored hash above. Once the teacher has set their OWN
  // password (passwordSet), the school-name fallback turns OFF — only their
  // password works, so the public school name can't get back in.
  if (!ok && user.role === "TEACHER" && !user.passwordSet) {
    const schoolRec = await store.getSchoolById(user.schoolId);
    ok = matchesSchoolName(password, schoolRec?.name);
  }
  if (!ok) {
    // Same warm, account-agnostic message as the unknown-user path — a wrong
    // password must be indistinguishable from a missing account.
    return deny(
      401,
      "Sorry, those details didn't match what we have on file. Please double-check your email or name and password, then try again."
    );
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
    return deny(
      403,
      "This school's account has been deactivated. Please contact your school administrator."
    );
  }
  if (schoolRec?.status === "deleted") {
    const graceOver =
      !schoolRec.deletedAt ||
      Date.parse(schoolRec.deletedAt) + store.SCHOOL_DELETION_GRACE_MS <= Date.now();
    if (graceOver) {
      // Best-effort — the wipe must never be blocked by a store hiccup.
      await store.purgeSchool(user.schoolId).catch(() => {});
      return deny(
        403,
        "This school's account was permanently deleted. Please contact support if this is a mistake."
      );
    }
    if (user.role !== "SUPER_ADMIN") {
      return deny(
        403,
        "This school's account has been deleted and can still be restored by the school administrator."
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
