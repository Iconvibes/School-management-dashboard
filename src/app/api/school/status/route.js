import { NextResponse } from "next/server.js";
import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { invalidateSchoolAuthSnapshots, isDenied, requirePermission } from "@/lib/policy";
import { sendMail } from "@/lib/mailer";
import { schoolStatusSchema, firstValidationMessage } from "@/lib/validation";

/**
 * School account status — POST /api/school/status with one of:
 *   { action: "deactivate" }  freeze — blocks every non-super-admin login,
 *                             keeps ALL data, reactivatable later;
 *   { action: "reactivate" }  back to active from frozen;
 *   { action: "restore" }     back to active from DELETED, within the 30-day
 *                             grace period — the school was deleted but its
 *                             data is still intact, so restoring revives it.
 * Only the SUPER_ADMIN can flip it (school.edit), and only they can still
 * sign in to a frozen/deleted school to do so.
 */
export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "school.edit");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const invalid = firstValidationMessage(schoolStatusSchema, body);
  if (invalid) return jsonError(invalid, 400);
  const status =
    body.action === "deactivate"
      ? "frozen"
      : body.action === "reactivate" || body.action === "restore"
        ? "active"
        : null;

  const school = await store.setSchoolStatus(session.schoolId, status);
  if (!school) return jsonError("School not found", 404);

  // Every cached auth snapshot carries the school's status — a freeze,
  // reactivation or restore must be visible to all users on their very next
  // request, never one TTL later.
  await invalidateSchoolAuthSnapshots(session.schoolId);

  // Safety confirmation: alert the school's SUPER_ADMIN(s) whenever the
  // account is frozen, reactivated or restored. Best-effort — a mailer outage
  // or missing SMTP config must never fail the action itself. An in-app
  // notification is also created so the confirmation is always visible in the
  // dashboard, SMTP or not.
  try {
    const supers = await store.listUsers({ schoolId: session.schoolId, role: "SUPER_ADMIN" });
    const verb =
      body.action === "deactivate"
        ? { past: "frozen", now: "All staff and student logins are blocked. No data has been deleted, and you can reactivate the account at any time by signing back in." }
        : body.action === "restore"
          ? { past: "restored", now: "The account was deleted but its data was kept — all logins have resumed and everything is back." }
          : { past: "reactivated", now: "All staff and student logins have resumed." };
    const subject = `${school.name} has been ${verb.past}`;
    const preview = verb.now;
    const emailBody = [
      `Hi,`,
      "",
      `Your school \"${school.name}\" has been ${verb.past}.`,
      "",
      verb.now,
      "",
      "If you did not make this change, please contact support immediately.",
      "",
      "— Edutrack",
    ].join("\n");
    await Promise.all(
      supers.map((s) =>
        s.email ? sendMail({ to: s.email, subject, text: emailBody }) : Promise.resolve()
      )
    );
    await store.createNotification({
      schoolId: session.schoolId,
      kind: "alert",
      to: supers.map((s) => s.id),
      subject,
      preview,
      body: emailBody,
    });
  } catch (err) {
    // The confirmation must never take the status change down with it.
    console.error("[school-status] alert failed:", err?.message || err);
  }

  return NextResponse.json({ success: true, school });
}
