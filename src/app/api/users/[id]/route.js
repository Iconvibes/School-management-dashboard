import { getSession, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";

/** Verify the target user belongs to the caller's tenant. */
async function assertOwnTenant(session, id) {
  const target = await store.findUserById(id);
  if (!target) return jsonError("User not found", 404);
  if (target.schoolId !== session.schoolId) return jsonError("Forbidden", 403);
  return null;
}

export async function PATCH(request, { params }) {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

  const { id } = await params;
  const tenantErr = await assertOwnTenant(session, id);
  if (tenantErr) return tenantErr;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
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
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

  const { id } = await params;
  const tenantErr = await assertOwnTenant(session, id);
  if (tenantErr) return tenantErr;

  const ok = await store.deleteUser(id);
  if (!ok) return jsonError("User not found", 404);
  return Response.json({ success: true });
}
