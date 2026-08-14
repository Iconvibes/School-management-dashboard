import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { assertSameTenant, isDenied, mayEditUser, requirePermission } from "@/lib/policy";

export async function PATCH(request, { params }) {
  const session = await requirePermission(["SUPER_ADMIN", "REGISTRAR"], "users.edit");
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

  // A parent's or teacher's full name doubles as their login identifier
  // (name-based login) — renaming them to a name that already belongs to
  // ANOTHER account of the same role in the school would make that login
  // ambiguous: the name lookup returns one match and the other account is
  // shadowed. Reject the rename; renaming to their OWN current name resolves
  // to the same record and stays allowed. Role- and tenant-scoped, mirroring
  // the create guards on the POST route.
  if (body.name !== undefined && target.role === "PARENT") {
    const clash = await store.findParentByNameInSchool(session.schoolId, body.name);
    if (clash && clash.id !== target.id) {
      return jsonError(
        `A parent named "${String(body.name).trim()}" already exists in your school.`,
        409
      );
    }
  }
  if (body.name !== undefined && target.role === "TEACHER") {
    const clash = await store.findTeacherByNameInSchool(session.schoolId, body.name);
    if (clash && clash.id !== target.id) {
      return jsonError(
        `A teacher named "${String(body.name).trim()}" already exists in your school.`,
        409
      );
    }
  }

  // Teaching assignments (subjects × arms) are SUPER_ADMIN-only — they define
  // a teacher's classroom scope, so they stay with the console owner. The
  // field-level mayEditUser guard already keeps REGISTRAR off teacher records;
  // this second check stops a REGISTRAR slipping them onto a student row too.
  // Non-empty only (same shape as the POST route): an empty [] must never
  // block a legit edit that carries the shared form's default arrays.
  if ((body.subjects?.length || 0) > 0 || (body.assignedClasses?.length || 0) > 0) {
    if (session.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);
    const valid = (v) => Array.isArray(v) && v.every((s) => typeof s === "string");
    if (body.subjects !== undefined && !valid(body.subjects)) {
      return jsonError("subjects must be an array of strings");
    }
    if (body.assignedClasses !== undefined && !valid(body.assignedClasses)) {
      return jsonError("assignedClasses must be an array of strings");
    }
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
    subjects: body.subjects,
    assignedClasses: body.assignedClasses,
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
  // Deleting records is destructive — users.manage (SUPER_ADMIN only). A
  // registrar edits the roster through PATCH (name, class, parent link, reset
  // password) but never removes accounts.
  const session = await requirePermission(["SUPER_ADMIN"], "users.manage");
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
