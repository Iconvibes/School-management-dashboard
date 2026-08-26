import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { store } from "@/lib/store";
import { setAuthCookie } from "@/lib/auth";
import { resolvePostLoginRedirect } from "@/lib/portal-guard";

/**
 * POST /api/platform/auth/login
 * Platform admin login — separate from school login flow.
 * Only PLATFORM_ADMIN role can login through this endpoint.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  // Find user by email across all schools (platform admins don't belong to a specific school picker)
  const user = await store.findUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Only PLATFORM_ADMIN can login here
  if (user.role !== "PLATFORM_ADMIN") {
    return NextResponse.json({ error: "This portal is for platform administrators only" }, { status: 403 });
  }

  // Verify password
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Get the auth snapshot for token version
  const authUser = await store.findAuthSnapshot(user.id);
  if (!authUser) {
    return NextResponse.json({ error: "Account not found" }, { status: 401 });
  }

  const res = NextResponse.json({
    success: true,
    redirect: resolvePostLoginRedirect(user.role, body.next),
  });

  setAuthCookie(res, {
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
    tokenVersion: authUser.tokenVersion || 0,
  });

  return res;
}
