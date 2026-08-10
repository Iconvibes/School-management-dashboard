import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { setMfaCookie, jsonError } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { signMfaToken } from "@/lib/token";

export async function POST(request) {
  // New-tenant guard: 5 school registrations per IP per hour.
  const limited = checkRateLimit({
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

  const { schoolName, adminName, email, password } = body;

  if (!schoolName || !adminName || !email || !password) {
    return jsonError("School name, admin name, email and password are required");
  }
  if (String(password).length < 6) {
    return jsonError("Password must be at least 6 characters");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return jsonError("Please provide a valid email address");
  }

  // New tenants start empty, so no clash is possible on register.
  // Uniqueness is enforced per-school (schoolId + email) by the store/model.
  const { school, user } = await store.createSchoolAndAdmin({
    schoolName,
    adminName,
    email,
    password,
  });

  // Never leak the password hash back to the client
  const { password: _pw, ...safeUser } = user;

  // The founding SUPER_ADMIN is staff, so no session yet — the first step of
  // their life in the app is forced MFA self-enrollment (the pending ticket
  // proves this browser just registered the tenant). After confirm, the real
  // session is issued and they land on onboarding.
  const res = NextResponse.json(
    { success: true, user: safeUser, school, mfaSetupRequired: true },
    { status: 201 }
  );
  setMfaCookie(res, signMfaToken({ userId: user.id, purpose: "enroll", attempts: 0 }));
  return res;
}
