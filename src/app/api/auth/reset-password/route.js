import { NextResponse } from "next/server.js";
import { jsonError } from "@/lib/auth";
import { consumeResetToken } from "@/lib/password-reset";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@/lib/passwords";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/reset-password
 *
 * Body: { token, newPassword }
 *
 * Validates the reset token (must be valid, unexpired, unused) and
 * updates the user's password. The token is consumed (single-use).
 *
 * Returns 200 on success, 400/422 on validation errors.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { token, newPassword } = body;

  if (!token || typeof token !== "string") {
    return jsonError("Reset token is required");
  }

  if (!newPassword || typeof newPassword !== "string") {
    return jsonError("New password is required");
  }

  // Validate password strength
  const trimmed = newPassword.trim();
  if (trimmed.length < PASSWORD_MIN_LENGTH) {
    return jsonError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (trimmed.length > PASSWORD_MAX_LENGTH) {
    return jsonError(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }

  // Rate limit: 10 attempts per token (prevents brute-force on token)
  const rl = await checkRateLimit({ request, windowMs: 15 * 60 * 1000, max: 10, prefix: "reset-pw", key: token.slice(0, 8) });
  if (rl) {
    return jsonError("Too many attempts. Please request a new reset link.", 429);
  }

  // Consume the token and update password
  const result = await consumeResetToken(token, trimmed);

  if (!result.success) {
    return jsonError(result.error, 400);
  }

  return NextResponse.json({
    success: true,
    message: "Password updated successfully. You can now sign in with your new password.",
  });
}
