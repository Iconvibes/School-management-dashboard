/**
 * Quick-batch add engine (Phase 2).
 *
 * The CSV wizard is the right tool for a full roster, but a school's admin
 * shouldn't need a spreadsheet to add a handful of new admissions. This layer
 * turns a free-form list of names ("one per line", or comma separated) into
 * the same normalized rows the import pipeline already understands, then
 * reuses planImport / applyImport so logins, validation, dedupe and the
 * credentials sheet behave identically to the CSV flow.
 *
 * The one addition is a name+class-arm duplicate guard: the CSV planner only
 * dedupes on phone, which quick-add rows never carry, so we also match
 * existing students by exact name within the same arm.
 */
import { planImport, applyImport, buildCredentials, flagNameArmDuplicates } from "./importer.js";

const LIST_MARKER = /^\s*(?:\d+[.)]\s*|[-*•]\s*)*/;

/**
 * Extract student names from free-form text.
 * - one name per line, or comma-separated names on a line
 * - strips list markers ("1.", "- ", "• ")
 * - collapses inner whitespace, drops empty/whitespace-only entries
 * - de-duplicates case-insensitively
 * @param {string} text
 * @returns {string[]}
 */
export function parseNames(text) {
  const names = [];
  const seen = new Set();
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(LIST_MARKER, "").trim();
    if (!line) continue;
    for (const name of splitLine(line)) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/**
 * Split one line into names, guarding the "Last, First" convention.
 * Commas separate multi-word names ("Kunle Adebayo, Chidinma Obi"), but a
 * single-word fragment after a comma ("Adebayo, Kunle") is absorbed into the
 * neighbouring name instead of becoming a bogus one-word student.
 */
function splitLine(line) {
  const parts = line.split(",").map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (parts.length <= 1) return parts;
  const names = [];
  let buffer = "";
  for (const part of parts) {
    if (part.includes(" ")) {
      if (buffer) {
        names.push(buffer);
        buffer = "";
      }
      names.push(part);
    } else {
      buffer = buffer ? `${buffer} ${part}` : part;
    }
  }
  if (buffer) names.push(buffer);
  return names;
}

/**
 * Build normalized STUDENT rows (same shape parseRows returns) and run them
 * through planImport, then tighten the duplicate guard for the name-only case.
 *
 * @param {Object} params
 * @param {string[]} params.names
 * @param {string} params.classArm          the arm every student is added to
 * @param {string} params.schoolName
 * @param {string[]} [params.activeArms]
 * @param {Array} [params.existingUsers]
 * @param {string} [params.defaultPassword]
 * @returns {Object} the planImport result (plans, summary, parentRefs, newArms)
 */
export function planQuickAdd({
  names,
  classArm,
  schoolName,
  activeArms = [],
  existingUsers = [],
  defaultPassword = "",
}) {
  const arm = String(classArm || "").trim();
  const rows = names.map((name, i) => ({
    row: i + 2, // 1-based, offset by a virtual header row
    name,
    email: "",
    password: "",
    classArm: arm,
    phone: "",
    parentName: "",
    parentPhone: "",
  }));

  const planned = planImport({
    role: "STUDENT",
    rows,
    schoolName,
    activeArms,
    existingUsers,
    existingParents: [],
    defaultPassword,
    createArms: true, // the arm is picked from the school's list, so it exists
  });

  // Name-only duplicate guard: the CSV planner matches on phone, which
  // quick-add never has, so flag existing students with the same name in the
  // same arm. Re-running the same list must not double entries.
  flagNameArmDuplicates(planned.plans, existingUsers);

  planned.summary = {
    ...planned.summary,
    ok: planned.plans.filter((p) => p.status === "ok").length,
    duplicates: planned.plans.filter((p) => p.status === "duplicate").length,
    errors: planned.plans.filter((p) => p.status === "error").length,
  };
  return planned;
}

export { applyImport, buildCredentials };
