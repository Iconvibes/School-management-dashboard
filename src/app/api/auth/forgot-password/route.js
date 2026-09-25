import { NextResponse } from "next/server.js";
import { store } from "@/lib/store";
import { jsonError } from "@/lib/auth";
import { createResetToken, findUserByEmail } from "@/lib/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";
import { PASSWORD_MIN_LENGTH } from "@/lib/passwords";
import * as log from "@/lib/log";

/**
 * POST /api/auth/forgot-password
 *
 * Body: { email }
 *
 * Finds the user by email across all schools, generates a time-limited
 * reset token (1 hour), and "sends" it via email.
 *
 * In demo/dev mode, the token URL is logged to the console so testers
 * can copy-paste it. In production, a transactional email service
 * (SendGrid, Resend, etc.) would deliver the link.
 *
 * Security: always returns 200 with a generic success message regardless
 * of whether the email exists — prevents email enumeration.
 */
export async function POST(request) {
  // Rate limit: 5 requests per email per 15 minutes
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const email = String(body.email || "").toLowerCase().trim();
  if (!email) {
    return jsonError("Email is required");
  }

  // Rate limit by email
  const rl = await checkRateLimit({ request, windowMs: 15 * 60 * 1000, max: 5, prefix: "forgot-pw", key: email });
  if (rl) {
    // Still return success to prevent email enumeration timing attacks
    return NextResponse.json({
      success: true,
      message: "If an account with that email exists, a reset link has been sent.",
    });
  }

  // Find user by email
  const user = await findUserByEmail(email);
  if (!user) {
    // Don't reveal whether the email exists
    return NextResponse.json({
      success: true,
      message: "If an account with that email exists, a reset link has been sent.",
    });
  }

  // Generate reset token
  const { token, expiresAt } = await createResetToken({
    userId: user.id,
    schoolId: user.schoolId,
    email: user.email,
  });

  // Build the reset URL
  const resetUrl = `/reset-password?token=${token}`;

  // "Send" the email — in demo mode, log to console
  // In production, replace with actual email service:
  //   await sendEmail({ to: user.email, subject: "Reset your password", html: ... });
  log.info("forgot-password", `Password reset requested for ${user.email}`);
  log.info("forgot-password", `Reset URL: ${resetUrl}`);
  log.info("forgot-password", `Token expires: ${expiresAt}`);

  if (process.env.NODE_ENV !== "production") {
    log.info("forgot-password", `═══════════════════════════════════════════`);
    log.info("forgot-password", `DEMO: Reset link for ${user.email}:`);
    log.info("forgot-password", `http://localhost:3000${resetUrl}`);
    log.info("forgot-password", `═══════════════════════════════════════════`);
  }

  return NextResponse.json({
    success: true,
    message: "If an account with that email exists, a reset link has been sent.",
    // In development, include the URL for easy testing
    ...(process.env.NODE_ENV !== "production" && { resetUrl }),
  });
}
