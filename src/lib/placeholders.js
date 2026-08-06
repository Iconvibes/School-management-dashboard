/**
 * Paper-register onboarding (Phase 2).
 *
 * Many schools keep their register on paper: they know exactly how many
 * students are in each class arm, but the names live in a notebook. This
 * layer lets an admin fill a tiny template — "Class Arm, Number of Students"
 * — and generates placeholder accounts ("Student 1", "Student 2", …) per arm,
 * each with an auto-generated login. The roster is real at the scale the
 * school needs; names get tidied later.
 *
 * It reuses planImport / applyImport so logins, validation and the credentials
 * sheet behave exactly like the CSV and quick-add flows, plus the shared
 * name+arm duplicate guard — which makes re-running a count file idempotent:
 * "45" twice creates 45 once, and recounting 45 → 50 creates only the 5 new
 * placeholders.
 */
import { parseCSV } from "./csv.js";
import { planImport, applyImport, buildCredentials, flagNameArmDuplicates } from "./importer.js";

/** The template schools download and fill in. */
export const COUNT_TEMPLATE = {
  headers: ["Class Arm", "Number of Students"],
  example: [
    ["SS1 Science", "45"],
    ["JSS1 Blue", "38"],
  ],
};

const keyOf = (h) => String(h || "").toLowerCase().replace(/[\s_\-/()]+/g, "");

const ARM_ALIASES = ["classarm", "class", "arm", "stream", "classname", "class"];
const COUNT_ALIASES = [
  "numberofstudents",
  "number",
  "students",
  "count",
  "enrolment",
  "enrollment",
  "classsize",
  "size",
];

/** Per-arm and total caps, so one fat-fingered row can't hang the import. */
export const MAX_PER_ARM = 500;
export const MAX_TOTAL = 5000;

/**
 * Parse the "Class Arm, Number of Students" template into per-arm counts.
 * @param {string} csvText
 * @returns {{ pairs?: Array<{classArm: string, count: number}>, errors?: string[], error?: string }}
 */
export function parseCountCsv(csvText) {
  const table = parseCSV(csvText);
  if (table.length === 0) return { error: "The file is empty." };

  const headers = table[0].map((h) => String(h).trim());
  let armIdx = -1;
  let countIdx = -1;
  headers.forEach((h, i) => {
    const k = keyOf(h);
    if (armIdx === -1 && ARM_ALIASES.includes(k)) armIdx = i;
    if (countIdx === -1 && COUNT_ALIASES.includes(k)) countIdx = i;
  });
  if (armIdx === -1 || countIdx === -1) {
    return {
      error:
        'Could not find the "Class Arm" and "Number of Students" columns. Download the template and fill in the counts.',
    };
  }

  const data = table
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (data.length === 0) {
    return { error: "No data rows found below the header row." };
  }

  const byArm = new Map();
  const errors = [];
  let total = 0;

  data.forEach((cells, i) => {
    const rowNo = i + 2; // 1-based, offset for the header
    const arm = String(cells[armIdx] ?? "").trim();
    const raw = String(cells[countIdx] ?? "").trim();
    if (!arm) {
      errors.push(`Row ${rowNo}: class arm is missing`);
      return;
    }
    // Strict integer: allow thousands commas, reject negatives, floats,
    // exponents and anything non-numeric ("-3" must not become 3, "45.5"
    // must not create 46 students).
    const digitsOnly = raw.replace(/,/g, "").trim();
    const count = /^\d+$/.test(digitsOnly) ? Number(digitsOnly) : NaN;
    if (!Number.isInteger(count) || count < 1) {
      errors.push(`Row ${rowNo} (“${arm}”): “${raw || "blank"}” is not a valid number of students`);
      return;
    }
    if (count > MAX_PER_ARM) {
      errors.push(`Row ${rowNo} (“${arm}”): max ${MAX_PER_ARM} students per class arm`);
      return;
    }
    byArm.set(arm, (byArm.get(arm) || 0) + count);
  });

  if (errors.length > 0) return { errors };

  const pairs = [...byArm.entries()].map(([classArm, count]) => ({ classArm, count }));
  total = pairs.reduce((s, p) => s + p.count, 0);
  if (total > MAX_TOTAL) {
    return { error: `Total exceeds the ${MAX_TOTAL}-student limit. Split into batches.` };
  }
  return { pairs, total };
}

/**
 * Generate normalized placeholder rows ("Student N" per arm) in the same
 * shape parseRows returns, ready for planImport.
 * @param {Array<{classArm: string, count: number}>} pairs
 * @returns {Array} normalized rows
 */
export function generatePlaceholderRows(pairs) {
  const rows = [];
  let row = 2; // 1-based, offset by a virtual header row
  for (const { classArm, count } of pairs) {
    for (let n = 1; n <= count; n++) {
      rows.push({
        row: row++,
        name: `Student ${n}`,
        email: "",
        password: "",
        classArm,
        phone: "",
        parentName: "",
        parentPhone: "",
      });
    }
  }
  return rows;
}

/**
 * Plan placeholder generation for a set of per-arm counts.
 *
 * @param {Object} params
 * @param {Array<{classArm: string, count: number}>} params.pairs
 * @param {string} params.schoolName
 * @param {string[]} [params.activeArms]
 * @param {Array} [params.existingUsers]
 * @param {string} [params.defaultPassword]
 * @returns {Object} planImport result + `arms` breakdown
 *   arms: [{ classArm, count, existing, toCreate }]
 */
export function planPlaceholders({
  pairs,
  schoolName,
  activeArms = [],
  existingUsers = [],
  defaultPassword = "",
}) {
  const planned = planImport({
    role: "STUDENT",
    rows: generatePlaceholderRows(pairs),
    schoolName,
    activeArms,
    existingUsers,
    existingParents: [],
    defaultPassword,
    createArms: true,
  });

  flagNameArmDuplicates(planned.plans, existingUsers, {
    message: "A placeholder with this name already exists in this class",
  });

  planned.summary = {
    ...planned.summary,
    ok: planned.plans.filter((p) => p.status === "ok").length,
    duplicates: planned.plans.filter((p) => p.status === "duplicate").length,
    errors: planned.plans.filter((p) => p.status === "error").length,
  };

  // Per-arm breakdown: how many of the requested count already exist vs new.
  const arms = pairs.map(({ classArm, count }) => {
    const inArm = planned.plans.filter((p) => p.assignedClass === classArm);
    const toCreate = inArm.filter((p) => p.status === "ok").length;
    const existing = count - toCreate;
    return { classArm, count, existing, toCreate };
  });

  return { ...planned, arms };
}

export { applyImport, buildCredentials };
