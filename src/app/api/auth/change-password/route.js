import bcrypt from "bcryptjs";
import { NextResponse } from "next/server.js";
import { setAuthCookie, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requireAuth } from "@/lib/policy";

const PASSWORD_MIN_LENGTH = 6;

/**
 * POST /api/auth/change-password
 *
 * Lets any authenticated user change their own password (self-service).
 * Body: { currentPassword, newPassword }
 *
 * Verifies the current password against the store, then updates. No
 * admin/reset-password route — this is the "student changes their own
 * password after first login" path.
 *
 * Session revocation: the account's tokenVersion is bumped, so every token
 * signed BEFORE this change (including a stolen one) is rejected by
 * requireAuth on its very next use. The CURRENT session is re-issued with the
 * new version — the device that just proved the current password stays signed
 * in; everything else dies.
 *
 * Keeps the student's stored generatedPassword in sync: the dashboard's
 * Password column shows the student's CURRENT password, so the admin can
 * always look it up when a student forgets it. (For non-students the field
 * is cleared — it only ever held an auto-generated value.)
 */
export async function POST(request) {
  // Full layer-2 revalidation (not the raw cookie read): requireAuth re-checks
  // the account against the store on every call, including tokenVersion — so
  // a token issued before a password change can never be used to change the
  // password again.
  const session = await requireAuth();
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) {
    return jsonError("Current password and new password are required");
  }
  if (String(newPassword).length < PASSWORD_MIN_LENGTH) {
    return jsonError(`New password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  const user = await store.findUserByIdWithAuth(session.userId);
  if (!user) return jsonError("User not found", 404);

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) return jsonError("Current password is incorrect", 403);

  const nextVersion = (user.tokenVersion || 0) + 1;
  const updated = await store.updateUser(session.userId, {
    password: newPassword,
    // The admin's Login Details tab reads this field — keep it showing the
    // account's CURRENT password so logins can always be looked up/exported.
    generatedPassword: newPassword,
    // Revoke every token issued before this change.
    tokenVersion: nextVersion,
  });
  if (!updated) return jsonError("Failed to update password", 500);

  // Re-issue the current session stamped with the new version — the device
  // that just changed the password stays signed in; all other sessions die.
  const res = NextResponse.json({ success: true });
  setAuthCookie(res, {
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
    tokenVersion: nextVersion,
  });
  return res;
}
