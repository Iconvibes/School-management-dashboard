import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { parseRows, planImport, buildCredentials, applyImport } from "@/lib/importer";
import { importSchema, firstValidationMessage } from "@/lib/validation";

const MAX_ROWS = 5000;

/**
 * Bulk roster import (Phase 1).
 *
 * POST /api/users/import
 *   body: {
 *     role: "STUDENT" | "TEACHER",
 *     csv: "<raw csv text>",
 *     dryRun?: boolean,          // preview only — validate, write nothing
 *     options?: { defaultPassword?: string, createArms?: boolean }
 *   }
 *
 * Response (dryRun or not) carries per-row statuses so the wizard can render
 * an editable preview and, after confirm, a printable credentials sheet.
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

  const invalid = firstValidationMessage(importSchema, body);
  if (invalid) return jsonError(invalid);
  const role = String(body.role || "").toUpperCase();
  const csv = typeof body.csv === "string" ? body.csv : "";

  const dryRun = body.dryRun === true;
  const options = body.options || {};
  const defaultPassword = String(options.defaultPassword || "");
  const createArms = options.createArms !== false;

  const parsed = parseRows(role, csv);
  if (parsed.error) return jsonError(parsed.error, 400);
  if (parsed.rows.length > MAX_ROWS) {
    return jsonError(`Too many rows (max ${MAX_ROWS}). Split the file and import in batches.`);
  }

  const [school, existingUsers, existingParents] = await Promise.all([
    store.getSchoolById(session.schoolId),
    store.listUsers({ schoolId: session.schoolId }),
    store.listUsers({ schoolId: session.schoolId, role: "PARENT" }),
  ]);
  if (!school) return jsonError("School not found", 404);

  const planned = planImport({
    role,
    rows: parsed.rows,
    schoolName: school.name,
    activeArms: school.activeArms || [],
    existingUsers,
    existingParents,
    defaultPassword,
    createArms,
  });

  const safeRows = planned.plans.map(({ password: _pw, parentKey: _pk, ...row }) => row);

  if (dryRun) {
    return Response.json({
      dryRun: true,
      role,
      unknownColumns: parsed.unknown || [],
      newArms: planned.newArms,
      summary: planned.summary,
      rows: safeRows,
    });
  }

  const applied = await applyImport({
    store,
    schoolId: session.schoolId,
    role,
    plans: planned.plans,
    parentRefs: planned.parentRefs,
    newArms: planned.newArms,
  });

  // Only hand out credentials for accounts that actually got created.
  const failedRows = new Set(
    applied.failed.filter((f) => f.row != null).map((f) => f.row)
  );
  const okPlans = planned.plans.filter(
    (p) => p.status === "ok" && !failedRows.has(p.row)
  );
  const credentials = buildCredentials(role, okPlans, planned.parentRefs, {
    skipParentKeys: applied.failedParentKeys,
  });

  return Response.json({
    dryRun: false,
    role,
    unknownColumns: parsed.unknown || [],
    newArms: planned.newArms,
    summary: planned.summary,
    rows: safeRows,
    created: applied.created,
    failed: applied.failed,
    credentials,
  });
}
