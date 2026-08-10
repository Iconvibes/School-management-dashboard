import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getPendingMfa, jsonError, setMfaCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateSecret, otpauthUri } from "@/lib/totp";
import { signMfaToken } from "@/lib/token";

/**
 * GET /api/auth/mfa/setup — begin forced self-enrollment.
 *
 * Requires the enroll-purpose pending ticket (issued by a staff login without
 * MFA, or by registration). Returns a FRESH secret + otpauth:// URI and
 * re-issues the pending ticket carrying that secret, so POST confirm can
 * verify the code against exactly the secret shown to this browser.
 *
 * The secret is bound to this ticket (never stored server-side until
 * confirmed) and re-generated on every call — refreshing the page just
 * produces a new secret to add to the authenticator.
 */
export async function GET(request) {
  const limited = checkRateLimit({
    request,
    windowMs: 60 * 1000,
    max: 10,
    prefix: "auth-mfa-setup",
  });
  if (limited) return limited;

  const pending = await getPendingMfa();
  if (!pending || pending.purpose !== "enroll") {
    return jsonError("MFA session expired. Please sign in again.", 401);
  }

  const user = await store.findUserById(pending.userId);
  if (!user) return jsonError("Account no longer exists", 401);
  if (user.mfaEnabled) {
    return jsonError("MFA is already enabled on this account", 409);
  }

  const secret = generateSecret();
  const otpauthUrl = otpauthUri(secret, { accountName: user.email });

  const res = NextResponse.json({ secret, otpauthUrl });
  return setMfaCookie(
    res,
    signMfaToken({ userId: user.id, purpose: "enroll", secret, attempts: 0 })
  );
}
