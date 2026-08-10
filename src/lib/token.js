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

// ---- MFA second-step cookie -------------------------------------------------
//
// Between the password step and the MFA step there is NO session — only this
// short-lived "pending" ticket proving the browser passed the first factor
// (or registration). It carries the userId, a purpose ("challenge" when a
// code must be verified, "enroll" when the user must first set up TOTP) and
// an attempt counter for brute-force capping. 10 minutes, then full re-login.

export const MFA_COOKIE_NAME = "edutrack_mfa_pending";
export const MFA_MAX_AGE = 10 * 60; // seconds — matches expiresIn below
export const MFA_MAX_ATTEMPTS = 5;

export function signMfaToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "10m" });
}

/** Returns the decoded payload, or null when invalid/expired. */
export function verifyMfaToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}
