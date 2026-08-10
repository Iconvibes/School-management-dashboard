// Token sign/verify, the cookie name and expiry live in ./token.js (pure, no
// Next imports) so the page-route proxy shares one source of truth.
import {
  COOKIE_NAME,
  MAX_AGE,
  signToken,
  verifyToken,
} from "@/lib/token";
// `next/headers.js` (not `next/headers`): Next aliases the extensionless form
// internally, but plain `node --test` resolves this file's imports too, so the
// policy tests in tests/policy.test.js can exercise the real guard. Both forms
// point at the same dist implementation.
import { cookies } from "next/headers.js";
// `next/server.js` (not `next/server`): same alias rule as next/headers.js above
// — Next resolves both, but plain `node --test` needs the explicit extension.
import { NextResponse } from "next/server.js";

export { COOKIE_NAME, signToken, verifyToken };

/** Read and verify the session cookie in a Route Handler / Server Component. */
export async function getSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Attach the JWT as an HTTP-only cookie to a NextResponse. */
export function setAuthCookie(res, payload) {
  res.cookies.set(COOKIE_NAME, signToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}

export function clearAuthCookie(res) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export function jsonError(message, status = 400, extra = {}) {
  // NextResponse (not Response): some callers pass the result to
  // setAuthCookie/clearAuthCookie, which need res.cookies.
  return NextResponse.json({ error: message, ...extra }, { status });
}
