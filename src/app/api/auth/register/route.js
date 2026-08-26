// `next/server.js` (not `next/server`): Next aliases the extensionless form
// internally, but plain `node --test` (tests/validation.test.js) resolves
// this file's imports too — same rule as login and the headers in auth.js.
import { NextResponse } from "next/server.js";
import { store } from "@/lib/store";
import { setAuthCookie, jsonError } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { registerSchema, firstValidationMessage } from "@/lib/validation";
import { verifyTurnstile } from "@/lib/turnstile";
import { createAuditLog } from "@/modules/platform/store";
import { createPlatformAlert } from "@/modules/platform/store";

export async function POST(request) {
  // New-tenant guard: 5 school registrations per IP per hour.
  const limited = await checkRateLimit({
    request,
    windowMs: 60 * 60 * 1000,
    max: 5,
    prefix: "auth-register",
  });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  // Zod validation — first invalid field wins (field order mirrors the
  // historical check order: required → password length → email format).
  const invalid = firstValidationMessage(registerSchema, body);
  if (invalid) return jsonError(invalid);
  const { schoolName, adminName, email, password } = registerSchema.parse(body);

  // Cloudflare Turnstile bot check — only enforced when TURNSTILE_SECRET_KEY
  // is configured (see src/lib/turnstile.js).
  const turnstile = await verifyTurnstile(body?.cfTurnstileResponse);
  if (turnstile.enabled && !turnstile.ok) {
    return jsonError("Bot check failed. Please try again.", 403);
  }

  // New tenants start empty, so no clash is possible on register.
  // Uniqueness is enforced per-school (schoolId + email) by the store/model.
  const { school, user } = await store.createSchoolAndAdmin({
    schoolName,
    adminName,
    email,
    password,
  });

  // GDPR: Record consent — the school administrator consents to data
  // processing by registering the school and enrolling students/staff.
  if (typeof store.recordConsent === "function") {
    await store.recordConsent({
      schoolId: school.id,
      userId: user.id,
      consentType: "REGISTRATION",
      detail: `School registered by ${adminName}. Data processing consent obtained at registration.`,
    });
  }

  // Log platform audit entry and create alert for platform admin
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
    await createAuditLog({
      action: "school_created",
      actor: adminName,
      schoolId: school.id,
      schoolName,
      description: `${schoolName} was registered on the platform by ${adminName}`,
      meta: { email, plan: "trial", trialDays: 14 },
      ip,
    });
    await createPlatformAlert({
      schoolId: school.id,
      schoolName,
      type: "school_signup",
      severity: "info",
      title: `New school registered: ${schoolName}`,
      message: `${adminName} (${email}) registered ${schoolName} on the platform. They start a 14-day free trial.`,
      meta: { adminName, email, plan: "trial" },
    });
  } catch {
    // Platform modules may not be available in some contexts — non-fatal
  }

  // Never leak the password hash back to the client
  const { password: _pw, ...safeUser } = user;

  // The founding SUPER_ADMIN gets their session right away — the register
  // page sends them straight to the /onboarding first-run wizard.
  const res = NextResponse.json(
    { success: true, user: safeUser, school, redirect: "/onboarding" },
    { status: 201 }
  );
  // New accounts start at tokenVersion 0 (schema default / demo normalize).
  setAuthCookie(res, { userId: user.id, role: user.role, schoolId: user.schoolId, tokenVersion: 0 });
  return res;
}
