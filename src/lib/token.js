/**
 * Pure JWT helpers — NO Next.js imports.
 *
 * Both the route-handler layer (auth.js) and the page-route proxy
 * (src/proxy.js) need to sign/verify the session token. Keeping that logic
 * here means one secret, one cookie name and one expiry across every layer,
 * without dragging `next/headers` into the proxy bundle.
 */
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "edutrack-dev-secret-change-in-prod";
export const COOKIE_NAME = "edutrack_token";
export const MAX_AGE = 60 * 60 * 24 * 7; // 7 days — matches jwt's expiresIn below

// Impersonation session timeout — how long a platform admin can stay
// logged in as a school admin before being auto-logged out.
// Configurable via IMPERSONATION_TIMEOUT_MINUTES env var (default 30).
export const IMPERSONATION_TIMEOUT_MS =
  (Number(process.env.IMPERSONATION_TIMEOUT_MINUTES) || 30) * 60 * 1000;

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

/** Returns the decoded payload, or null when invalid/expired. */
export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}
