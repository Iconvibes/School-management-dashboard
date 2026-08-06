import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { assertSameTenant, isDenied, mayEditUser, requireAuth } from "@/lib/policy";

export async function PATCH(request, { params }) {
  const session = await requireAuth(["SUPER_ADMIN", "REGISTRAR"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const target = await store.findUserById(id);
  if (!target) return jsonError("User not found", 404);
  const tenantErr = assertSameTenant(target, session);
  if (tenantErr) return tenantErr;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  if (!mayEditUser(session.role, target, body)) {
    return jsonError("Registrars can only edit student and parent records", 403);
  }

  // role is deliberately NOT updatable here — prevents self-escalation
  // When linking/unlinking a parent, validate the parent belongs to THIS
  // school and is actually a PARENT account (no cross-tenant linking).
  let parentId = body.parentId;
  if (body.parentId !== undefined && body.parentId !== null) {
    const parent = await store.findUserById(body.parentId);
    if (!parent || parent.schoolId !== session.schoolId || parent.role !== "PARENT") {
      return jsonError("Parent must be a parent account in your school", 400);
    }
  }

  const user = await store.updateUser(id, {
    name: body.name,
    assignedClass: body.assignedClass,
    payrollStatus: body.payrollStatus,
    feePaid: body.feePaid,
    parentId,
    phone: body.phone,
    address: body.address,
  });

  if (!user) return jsonError("User not found", 404);
  return Response.json({ user });
}

export async function DELETE(request, { params }) {
  // Deleting records is destructive — SUPER_ADMIN only. A registrar edits the
  // roster through PATCH (name, class, parent link, reset password) but never
  // removes accounts.
  const session = await requireAuth(["SUPER_ADMIN"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const target = await store.findUserById(id);
  if (!target) return jsonError("User not found", 404);
  const tenantErr = assertSameTenant(target, session);
  if (tenantErr) return tenantErr;

  const ok = await store.deleteUser(id);
  if (!ok) return jsonError("User not found", 404);
  return Response.json({ success: true });
}
