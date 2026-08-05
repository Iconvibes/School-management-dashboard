import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const SECRET = process.env.JWT_SECRET || "edutrack-dev-secret-change-in-prod";
export const COOKIE_NAME = "edutrack_token";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

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
  return Response.json({ error: message, ...extra }, { status });
}
