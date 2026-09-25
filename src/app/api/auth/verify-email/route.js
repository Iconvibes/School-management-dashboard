import { NextResponse } from "next/server.js";
import { jsonError } from "@/lib/auth";
import { verifyEmail } from "@/lib/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/verify-email
 *
 * Body: { token }
 *
 * Verifies the email using the token from the verification link.
 * Returns 200 on success.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { token } = body;
  if (!token || typeof token !== "string") {
    return jsonError("Verification token is required");
  }

  // Rate limit: 10 attempts per token
  const rl = await checkRateLimit({ request, windowMs: 15 * 60 * 1000, max: 10, prefix: "verify", key: token.slice(0, 8) });
  if (rl) {
    return jsonError("Too many attempts. Please request a new verification link.", 429);
  }

  const result = await verifyEmail(token);

  if (!result.success) {
    return jsonError(result.error, 400);
  }

  return NextResponse.json({
    success: true,
    message: "Email verified successfully! Your account is now fully activated.",
  });
}
