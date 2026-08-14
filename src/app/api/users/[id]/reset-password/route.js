import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { assertSameTenant, isDenied, mayResetPassword, requirePermission } from "@/lib/policy";
import { generatePassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/passwords";

/**
 * Reset a user's password (Phase 3 — "lost the credentials sheet").
 *
 * POST /api/users/[id]/reset-password
 *   body: { password?: string }   — omit to auto-generate a temporary one
 *
 * SUPER_ADMIN + REGISTRAR (users.password.reset), tenant-scoped. A registrar
 * may reset student and parent passwords (handing out logins is a registrar
 * duty) but never staff or teacher credentials. Returns the NEW password in
 * plaintext so the school can hand it out (printed, copied, read over the
 * phone).
 */
export async function POST(request, { params }) {
  const session = await requirePermission(["SUPER_ADMIN", "REGISTRAR"], "users.password.reset");
  if (isDenied(session)) return session;

  const { id } = await params;
  const target = await store.findUserById(id);
  if (!target) return jsonError("User not found", 404);
  const tenantErr = assertSameTenant(target, session);
  if (tenantErr) return tenantErr;
  if (!mayResetPassword(session.role, target.role)) {
    return jsonError("Registrars can only reset student and parent passwords", 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const provided = typeof body.password === "string" ? body.password.trim() : "";
  let newPassword = provided;
  if (!newPassword) {
    newPassword = generatePassword();
  } else if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return jsonError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  } else if (newPassword.length > PASSWORD_MAX_LENGTH) {
    // bcrypt silently truncates at 72 bytes — rejecting longer passwords up
    // front avoids the trap where two different long passwords both work.
    return jsonError(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }

  const user = await store.updateUser(id, {
    password: newPassword,
    // Keep the Login Details lookup current: the reset password is recorded
    // so the admin can always look up (and export) what any account now is.
    generatedPassword: newPassword,
    // A teacher reset returns them to the school-name bootstrap: passwordSet
    // flips back to false, so the school-name login (and the school name as
    // "current password" in change-password) works again until they set a
    // new password of their own.
    ...(target.role === "TEACHER" ? { passwordSet: false } : {}),
  });
  if (!user) return jsonError("User not found", 404);

  return Response.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    newPassword,
  });
}
