import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { clearMfaCookie, getPendingMfa, jsonError, setAuthCookie, setMfaCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTotp } from "@/lib/totp";
import { resolvePostLoginRedirect } from "@/lib/portal-guard";
import { MFA_MAX_ATTEMPTS, signMfaToken } from "@/lib/token";

/**
 * POST /api/auth/mfa/confirm — finish forced self-enrollment.
 *
 * Verifies the submitted code against the secret bound to the enroll ticket,
 * saves that secret (via the dedicated setMfaSecret store op — the generic
 * user PATCH can never touch it), then issues the real session. The ?next=
 * deep link (e.g. /onboarding after registration) survives via the validated
 * redirect. Same brute-force defenses as /verify.
 */
export async function POST(request) {
  const limited = checkRateLimit({
    request,
    windowMs: 60 * 1000,
    max: 5,
    prefix: "auth-mfa-confirm",
  });
  if (limited) return limited;

  const pending = await getPendingMfa();
  if (!pending || pending.purpose !== "enroll" || !pending.secret) {
    return jsonError("MFA session expired. Please sign in again.", 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const code = String(body?.code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) {
    return jsonError("Enter the 6-digit code from your authenticator app");
  }

  const user = await store.findUserById(pending.userId);
  if (!user) return jsonError("Account no longer exists", 401);
  if (user.mfaEnabled) {
    return jsonError("MFA is already enabled on this account", 409);
  }

  if (!verifyTotp(pending.secret, code)) {
    const attempts = (pending.attempts || 0) + 1;
    if (attempts >= MFA_MAX_ATTEMPTS) {
      const res = jsonError("Too many incorrect codes. Please sign in again.", 401);
      return clearMfaCookie(res);
    }
    const res = jsonError(
      `Incorrect code. ${MFA_MAX_ATTEMPTS - attempts} attempt${MFA_MAX_ATTEMPTS - attempts === 1 ? "" : "s"} left.`,
      401
    );
    return setMfaCookie(
      res,
      signMfaToken({ userId: user.id, purpose: "enroll", secret: pending.secret, attempts })
    );
  }

  await store.setMfaSecret(user.id, pending.secret);

  const res = NextResponse.json({
    success: true,
    redirect: resolvePostLoginRedirect(user.role, body.next),
  });
  clearMfaCookie(res);
  setAuthCookie(res, { userId: user.id, role: user.role, schoolId: user.schoolId });
  return res;
}
