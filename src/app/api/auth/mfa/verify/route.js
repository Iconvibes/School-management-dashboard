import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { clearMfaCookie, getPendingMfa, jsonError, setAuthCookie, setMfaCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTotp } from "@/lib/totp";
import { resolvePostLoginRedirect } from "@/lib/portal-guard";
import { MFA_MAX_ATTEMPTS, signMfaToken } from "@/lib/token";

/**
 * POST /api/auth/mfa/verify — second step of a staff login.
 *
 * The browser must hold the 10-minute MFA pending ticket (purpose
 * "challenge") issued by the password step. A correct TOTP code swaps it for
 * the real session; the ?next= deep link survives because the client sends it
 * here and it is re-validated against the fresh role.
 *
 * Brute-force defenses: IP rate limit (5/min) AND a per-ticket attempt cap —
 * each wrong code re-signs the ticket with attempts+1; at MFA_MAX_ATTEMPTS the
 * ticket is destroyed and the user must start the login over.
 *
 * The two layers interact: because the IP limit is checked first, a single
 * attacker behind one IP gets 4 rapid guesses, a ~60s pause (429), then a 5th
 * guess that destroys the ticket. The per-ticket cap is what binds an attacker
 * rotating IPs. Staff behind a shared NAT IP can self-lockout — the standard
 * rate-limit trade-off (see src/lib/rate-limit.js).
 *
 * Phase-2 hardening notes: the 10-min pending JWT is stateless, so a stolen
 * ticket + captured code (within its ~60s window) could mint a second session;
 * a used-ticket (jti) registry or login-fingerprint binding closes that. And
 * there is deliberately NO recovery path here — a lost authenticator is a
 * permanent lockout until an audited admin reset exists (role-audit trail).
 */
export async function POST(request) {
  const limited = checkRateLimit({
    request,
    windowMs: 60 * 1000,
    max: 5,
    prefix: "auth-mfa-verify",
  });
  if (limited) return limited;

  const pending = await getPendingMfa();
  if (!pending || pending.purpose !== "challenge") {
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

  const user = await store.findUserByIdWithSecret(pending.userId);
  if (!user) return jsonError("Account no longer exists", 401);
  if (!user.mfaSecret) {
    return jsonError("MFA is no longer active on this account. Please sign in again.", 401);
  }

  if (!verifyTotp(user.mfaSecret, code)) {
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
      signMfaToken({ userId: user.id, purpose: "challenge", attempts })
    );
  }

  const res = NextResponse.json({
    success: true,
    redirect: resolvePostLoginRedirect(user.role, body.next),
  });
  clearMfaCookie(res);
  setAuthCookie(res, { userId: user.id, role: user.role, schoolId: user.schoolId });
  return res;
}
