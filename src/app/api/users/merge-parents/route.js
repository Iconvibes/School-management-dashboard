import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * Merge duplicate parent accounts.
 *
 * Pre-guard data (CSV imports, manual linking, older exports) can hold two
 * accounts for one person, with children split between them. This picks a
 * canonical (kept) account, re-links EVERY child of the removed account onto
 * it, and deletes the removed account — so no child is orphaned and the kept
 * parent keeps signing in with any re-linked child's name (name-based login
 * derives the password from linked children). Deleting an account makes this
 * destructive: SUPER_ADMIN only, same as the DELETE route.
 */
export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "users.manage");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }
  const { keepId, removeId } = body ?? {};
  if (!keepId || !removeId) {
    return jsonError("keepId and removeId are required");
  }
  if (keepId === removeId) {
    return jsonError("Cannot merge an account into itself");
  }

  const keep = await store.findUserById(keepId);
  const remove = await store.findUserById(removeId);
  if (!keep || !remove) return jsonError("User not found", 404);

  if (keep.role !== "PARENT" || remove.role !== "PARENT") {
    return jsonError("Both accounts must be parents", 400);
  }
  if (keep.schoolId !== session.schoolId || remove.schoolId !== session.schoolId) {
    return jsonError("Both parents must be in your school", 400);
  }

  // Re-link every child of the removed parent onto the kept one, then delete
  // the removed account. The store's parent-link sync derives the password
  // from linked children, so the kept parent inherits all of them.
  const students = await store.listUsers({ schoolId: session.schoolId, role: "STUDENT" });
  let studentsRelinked = 0;
  for (const s of students) {
    if (s.parentId === removeId) {
      await store.updateUser(s.id, { parentId: keepId });
      studentsRelinked += 1;
    }
  }

  await store.deleteUser(removeId);

  return Response.json({ success: true, merged: { studentsRelinked } });
}
