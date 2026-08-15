import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import {
  parseNames,
  planQuickAdd,
  applyImport,
  buildCredentials,
} from "@/lib/quick-add";
import { quickAddClassArmSchema, quickAddPasswordSchema, firstValidationMessage } from "@/lib/validation";

const MAX_NAMES = 500;

/**
 * Quick-batch add (Phase 2).
 *
 * POST /api/users/quick-add
 *   body: {
 *     names: string[] | string,   // names, or free-form text (parseNames splits)
 *     classArm: string,           // must be one of the school's active arms
 *     defaultPassword?: string
 *   }
 *
 * Creates student accounts with auto-generated logins — no spreadsheet needed.
 * Reuses the import engine so validation, dedupe, logins and the credentials
 * sheet all behave exactly like the CSV flow.
 */
export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN", "REGISTRAR"], "students.manage");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const armInvalid = firstValidationMessage(quickAddClassArmSchema, body);
  if (armInvalid) return jsonError(armInvalid);
  const classArm = String(body.classArm || "").trim();

  // Always normalize through parseNames so array and string inputs behave
  // identically (whitespace, empty entries, case-insensitive dedupe).
  const names = parseNames(Array.isArray(body.names) ? body.names.join("\n") : body.names);
  if (names.length === 0) {
    return jsonError("No student names found. Add at least one name (one per line).");
  }
  if (names.length > MAX_NAMES) {
    return jsonError(`Too many names (max ${MAX_NAMES}). Split into batches or use the CSV importer.`);
  }

  const pwInvalid = firstValidationMessage(quickAddPasswordSchema, body);
  if (pwInvalid) return jsonError(pwInvalid);
  const defaultPassword = String(body.defaultPassword || "");

  const school = await store.getSchoolById(session.schoolId);
  if (!school) return jsonError("School not found", 404);
  if (!(school.activeArms || []).includes(classArm)) {
    return jsonError(
      `“${classArm}” is not a class arm in your school. Pick one from the list.`
    );
  }

  const existingUsers = await store.listUsers({ schoolId: session.schoolId });

  const planned = planQuickAdd({
    names,
    classArm,
    schoolName: school.name,
    activeArms: school.activeArms || [],
    existingUsers,
    defaultPassword,
  });

  const applied = await applyImport({
    store,
    schoolId: session.schoolId,
    role: "STUDENT",
    plans: planned.plans,
    parentRefs: planned.parentRefs,
    newArms: planned.newArms,
  });

  // Credentials only for accounts that actually got created.
  const failedRows = new Set(
    applied.failed.filter((f) => f.row != null).map((f) => f.row)
  );
  const okPlans = planned.plans.filter(
    (p) => p.status === "ok" && !failedRows.has(p.row)
  );
  const credentials = buildCredentials("STUDENT", okPlans, planned.parentRefs, {
    skipParentKeys: applied.failedParentKeys,
  });

  const safeRows = planned.plans.map(({ password: _pw, parentKey: _pk, ...row }) => row);

  return Response.json({
    classArm,
    summary: planned.summary,
    created: applied.created,
    failed: applied.failed,
    credentials,
    rows: safeRows,
  });
}
