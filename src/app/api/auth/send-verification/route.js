import { NextResponse } from "next/server.js";
import { requireAuth, isDenied } from "@/lib/policy";
import { store } from "@/lib/store";
import { sendVerificationEmail } from "@/lib/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";
import { jsonError } from "@/lib/auth";
import * as log from "@/lib/log";

/**
 * POST /api/auth/send-verification
 *
 * Resend the verification email for the current user's school.
 * Rate-limited to 3 requests per hour per school.
 */
export async function POST(request) {
  const session = await requireAuth();
  if (isDenied(session)) return session;

  // Only school admins can trigger verification
  if (session.role !== "SUPER_ADMIN") {
    return jsonError("Only school administrators can verify email", 403);
  }

  // Rate limit: 3 per hour per school
  const rl = await checkRateLimit({ request: null, windowMs: 60 * 60 * 1000, max: 3, prefix: "verify-email", key: session.schoolId });
  if (rl) {
    return jsonError("Too many requests. Please try again later.", 429);
  }

  const school = await store.getSchoolById(session.schoolId);
  if (!school) {
    return jsonError("School not found", 404);
  }

  if (school.emailVerified) {
    return NextResponse.json({ success: true, message: "Email is already verified" });
  }

  // Find the admin user
  const users = await store.listUsers({ schoolId: session.schoolId, role: "SUPER_ADMIN" });
  const admin = users[0];
  if (!admin) {
    return jsonError("Admin user not found", 404);
  }

  try {
    await sendVerificationEmail({
      userId: admin.id,
      schoolId: session.schoolId,
      email: admin.email,
      adminName: admin.name,
      schoolName: school.name,
    });
  } catch (err) {
    log.warn("send-verification", `Failed: ${err.message}`);
    return jsonError("Failed to send verification email", 500);
  }

  return NextResponse.json({
    success: true,
    message: "Verification email sent. Check your inbox.",
  });
}
