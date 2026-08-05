import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { setAuthCookie, jsonError } from "@/lib/auth";

export async function POST(request) {
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

  const res = NextResponse.json(
    { success: true, user: safeUser, school },
    { status: 201 }
  );
  setAuthCookie(res, {
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
  });
  return res;
}
