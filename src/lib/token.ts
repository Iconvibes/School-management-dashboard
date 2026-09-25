/**
 * Pure JWT helpers — NO Next.js imports.
 *
 * Both the route-handler layer (auth.ts) and the page-route proxy
 * (src/proxy.js) need to sign/verify the session token. Keeping that logic
 * here means one secret, one cookie name and one expiry across every layer,
 * without dragging `next/headers` into the proxy bundle.
 */
import jwt from "jsonwebtoken";

const SECRET: string =
  process.env.JWT_SECRET || "edutrack-dev-secret-change-in-prod";
export const COOKIE_NAME = "edutrack_token" as const;
export const MAX_AGE: number = 60 * 60 * 24 * 7; // 7 days — matches jwt's expiresIn below

// Impersonation session timeout — how long a platform admin can stay
// logged in as a school admin before being auto-logged out.
// Configurable via IMPERSONATION_TIMEOUT_MINUTES env var (default 30).
export const IMPERSONATION_TIMEOUT_MS: number =
  (Number(process.env.IMPERSONATION_TIMEOUT_MINUTES) || 30) * 60 * 1000;

/**
 * Claims carried by an EduTrack session token. Everything except the first
 * three fields is optional: regular logins stamp only the base claims, while
 * impersonation sessions add the timeout/audit metadata that policy.ts and
 * the logout route read.
 */
export interface SessionClaims {
  userId: string;
  role: string;
  schoolId: string;
  /** Session-revocation counter — bumped on password change. */
  tokenVersion?: number;
  /** Present only on impersonation sessions — requireAuth enforces the timeout. */
  impersonatedAt?: number;
  impersonatorId?: string | null;
  impersonatorName?: string;
  impersonationSessionId?: string;
}

export function signToken(payload: SessionClaims): string {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

/** Returns the decoded payload, or null when invalid/expired. */
export function verifyToken(token: string): SessionClaims | null {
  try {
    // `unknown` first: jwt.verify's string | JwtPayload union doesn't
    // structurally overlap SessionClaims, so a direct cast is rejected.
    return jwt.verify(token, SECRET) as unknown as SessionClaims;
  } catch {
    return null;
  }
}
