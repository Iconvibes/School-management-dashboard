/**
 * Bulk roster import engine (Phase 1).
 *
 * Pure planning + a store-driven apply step:
 *
 *   parseRows()   -> CSV text -> normalized rows keyed by canonical columns
 *   planImport()  -> rows + school context -> per-row statuses, auto-generated
 *                    logins, dedupe decisions, new class arms, parent resolution
 *   applyImport() -> plans + a store-like interface -> creates users / arms /
 *                    parent links (works against BOTH the demo and Mongo stores)
 *
 * planImport is deliberately side-effect free so the wizard can call it in
 * "dry run" mode and render a preview before anything is written.
 *
 * Auto-logins: students/teachers rarely have emails. When a row omits one we
 * generate `first.last@<school>.edu.ng`, de-duplicated with a numeric suffix.
 * Passwords default to the wizard-provided defaultPassword (or the row's own).
 */
import { parseCSV } from "./csv.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Canonical templates (the exact headers we tell schools to use). */
export const TEMPLATES = {
  STUDENT: {
    headers: ["name", "email", "class", "phone", "password", "parent name", "parent phone"],
    example: [
      ["Kunle Adebayo", "kunle.adebayo@gmail.com", "SS1 Science", "0803 123 4567", "", "Mrs. Folake Adebayo", "0803 123 4567"],
      ["Chidinma Obi", "", "SS1 Science", "0807 987 6543", "", "Mr. Emeka Obi", "0807 987 6543"],
    ],
  },
  TEACHER: {
    // `assigned class` stays the display/default arm; `subjects` and
    // `assigned classes` carry the subject-specialist scope (multiple values
    // separated by `;` or `|` inside one cell). Both are optional — a school
    // can import plain single-arm teachers exactly like before.
    headers: ["name", "email", "assigned class", "subjects", "assigned classes", "phone", "password"],
    example: [
      ["Mrs. Adaeze Okafor", "a.okafor@school.edu.ng", "SS1 Science", "Mathematics", "SS1 Science; SS2 Science; SS3 Science", "0805 111 2222", ""],
      ["Mr. Tunde Bakare", "", "JSS1", "English Language", "JSS1; JSS2; JSS3", "0805 333 4444", ""],
    ],
  },
};

/** Header aliases so schools can paste their own Excel columns. */
const ALIASES = {
  name: ["name", "full name", "student name", "teacher name", "student", "teacher", "names"],
  email: ["email", "email address", "emailaddress", "mail"],
  password: ["password", "pass", "temp password", "temporary password"],
  classArm: ["class", "class arm", "classarm", "assigned class", "assignedclass", "arm", "class name", "stream"],
  // Subject-specialist teaching scope: a teacher teaches SUBJECTS across
  // MULTIPLE arms. Multiple values live in one cell, separated by `;` or `|`.
  subjects: ["subjects", "subject", "subject taught", "subjectstaught", "courses", "course"],
  assignedClasses: ["assigned classes", "assignedclasses", "class arms", "classarms", "classes taught", "classestaught", "arms taught", "armstaught"],
  phone: ["phone", "phone number", "phonenumber", "telephone", "mobile", "contact", "tel"],
  parentName: ["parent name", "parentname", "guardian name", "guardianname", "parent/guardian", "parent", "guardian"],
  parentPhone: ["parent phone", "parentphone", "guardian phone", "guardianphone"],
};

const keyOf = (h) => String(h || "").toLowerCase().replace(/[\s_\-/()]+/g, "");

const ALIAS_KEYS = {};
for (const [canonical, list] of Object.entries(ALIASES)) {
  for (const alias of list) ALIAS_KEYS[keyOf(alias)] = canonical;
}

/** Map a CSV header row to canonical columns. Returns unknown headers too. */
export function mapColumns(headers) {
  const map = {};
  const unknown = [];
  headers.forEach((h, i) => {
    const canonical = ALIAS_KEYS[keyOf(h)];
    if (canonical) map[canonical] = i;
    else if (String(h).trim()) unknown.push(h);
  });
  return { map, unknown };
}

const cell = (cells, i) => (i !== undefined && i < cells.length ? String(cells[i] ?? "") : "");

/**
 * Split a multi-value CSV cell ("A; B|C") into trimmed, de-duped strings.
 * Semicolon and pipe both work as separators — semicolon is the common Excel
 * in-cell separator, pipe is the one that can never collide with the CSV
 * delimiter (a European-locale file may itself use `;`).
 */
export function splitList(value) {
  return [...new Set(
    String(value || "")
      .split(/[;|]/)
      .map((s) => s.trim())
      .filter(Boolean)
  )];
}

/**
 * Parse CSV text into normalized rows for a role.
 * @param {"STUDENT"|"TEACHER"} role
 * @param {string} csvText
 * @returns {{ rows?: Array, unknown?: string[], error?: string }}
 */
export function parseRows(role, csvText) {
  const table = parseCSV(csvText);
  if (table.length === 0) return { error: "The file is empty." };

  const headers = table[0].map((h) => String(h).trim());
  const { map, unknown } = mapColumns(headers);
  if (map.name === undefined) {
    return {
      error:
        "Could not find a “name” column. Download the template, or check that the first row is a header row.",
    };
  }

  const data = table
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""));

  if (data.length === 0) {
    return { error: "No data rows found below the header row." };
  }

  const rows = data.map((cells, i) => ({
    row: i + 2, // 1-based, offset for the header
    name: cell(cells, map.name).trim(),
    email: cell(cells, map.email).trim(),
    password: cell(cells, map.password).trim(),
    classArm: cell(cells, map.classArm).trim(),
    phone: cell(cells, map.phone).trim(),
    parentName: role === "STUDENT" ? cell(cells, map.parentName).trim() : "",
    parentPhone: role === "STUDENT" ? cell(cells, map.parentPhone).trim() : "",
    // Teacher subject-specialist scope — multi-value cells, split + cleaned.
    subjects: role === "TEACHER" ? splitList(cell(cells, map.subjects)) : [],
    assignedClasses: role === "TEACHER" ? splitList(cell(cells, map.assignedClasses)) : [],
  }));

  return { rows, unknown };
}

// ---- Email / password helpers ----------------------------------------------

const TITLE_RE =
  /\b(mr|mrs|ms|miss|dr|chief|alhaji|alhajia|hajia|pastor|deacon|deaconess|sir|ma|madam|engr|prof|rev|hrh)\b\.?/gi;

/** "Mrs. Adaeze Okafor" -> "adaeze.okafor" (first + last word, no titles). */
export function emailSlug(name) {
  const words = String(name || "")
    .replace(TITLE_RE, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "user";
  if (words.length === 1) return words[0];
  return `${words[0]}.${words[words.length - 1]}`;
}

/** "Greenfield International School" -> "greenfieldinternational.edu.ng" */
export function schoolDomain(schoolName) {
  const base =
    String(schoolName || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 30) || "edutrack";
  return `${base}.edu.ng`;
}

/** Reserve a unique local@domain against `used` (Set of lowercased emails). */
export function uniqueEmail(baseLocal, domain, used) {
  let candidate = `${baseLocal}@${domain}`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${baseLocal}${n}@${domain}`;
    n++;
  }
  used.add(candidate);
  return candidate;
}

export const normPhone = (p) => String(p || "").replace(/\D/g, "");

/**
 * Flag plans as duplicates when an existing user shares the same name in the
 * same class arm. The phone-based isPossibleDuplicate check inside planImport
 * can't fire for flows that never carry phones (quick-add, placeholders), so
 * this name+arm guard makes re-running those lists idempotent.
 * @param {Array} plans          plans from planImport (mutated in place)
 * @param {Array} existingUsers  all users in the school
 * @param {Object} [opts]
 * @param {string} [opts.role]   role to match against (default STUDENT)
 * @param {string} [opts.message] duplicate reason shown in the UI
 * @returns {number} how many plans were newly flagged as duplicates
 */
export function flagNameArmDuplicates(
  plans,
  existingUsers = [],
  { role = "STUDENT", message = "A student with this name is already in this class" } = {}
) {
  const existingKeys = new Set(
    existingUsers
      .filter((u) => u.role === role)
      .map((u) => `${String(u.name || "").trim().toLowerCase()}|${u.assignedClass || ""}`)
  );
  let flagged = 0;
  for (const p of plans) {
    if (p.status !== "ok") continue;
    const key = `${String(p.name || "").trim().toLowerCase()}|${p.assignedClass || ""}`;
    if (existingKeys.has(key)) {
      p.status = "duplicate";
      p.error = message;
      flagged++;
    }
  }
  return flagged;
}

// ---- Planning ---------------------------------------------------------------

/**
 * Validate rows and decide exactly what an import would do — no writes.
 * @param {Object} params
 * @param {"STUDENT"|"TEACHER"} params.role
 * @param {Array} params.rows       normalized rows from parseRows()
 * @param {string} params.schoolName
 * @param {string[]} params.activeArms
 * @param {Array} params.existingUsers    all users in the school (dup checks)
 * @param {Array} params.existingParents  PARENT users in the school
 * @param {string} [params.defaultPassword]
 * @param {boolean} [params.createArms]
 */
export function planImport({
  role,
  rows,
  schoolName,
  activeArms = [],
  existingUsers = [],
  existingParents = [],
  defaultPassword = "",
  createArms = true,
}) {
  const domain = schoolDomain(schoolName);
  const usedEmails = new Set(existingUsers.map((u) => String(u.email || "").toLowerCase()));
  const knownArms = new Set(activeArms);
  const armsToAdd = new Set();
  const parentRefs = new Map(); // key -> { key, id?, name, email, phone, password, isNew }
  const plans = [];
  let errors = 0;
  let duplicates = 0;

  const findExistingParent = (name, phone) => {
    const norm = normPhone(phone);
    if (norm) {
      const hit = existingParents.find((p) => normPhone(p.phone) === norm);
      if (hit) return hit;
    }
    return existingParents.find(
      (p) => String(p.name || "").trim().toLowerCase() === String(name || "").trim().toLowerCase()
    );
  };

  const ensureParent = (name, phone, password) => {
    const existing = findExistingParent(name, phone);
    if (existing) {
      const key = `existing:${existing.id}`;
      if (!parentRefs.has(key)) {
        parentRefs.set(key, {
          key,
          id: existing.id,
          name: existing.name,
          email: existing.email,
          phone: existing.phone || "",
          password: "",
          isNew: false,
        });
      }
      return key;
    }
    // New parent — dedupe within the file by phone, then by name.
    const norm = normPhone(phone);
    if (norm) {
      const hit = [...parentRefs.values()].find(
        (r) => r.isNew && normPhone(r.phone) === norm
      );
      if (hit) return hit.key;
    }
    const hitByName = [...parentRefs.values()].find(
      (r) =>
        r.isNew &&
        String(r.name).trim().toLowerCase() === String(name).trim().toLowerCase()
    );
    if (hitByName) return hitByName.key;

    const email = uniqueEmail(emailSlug(name), domain, usedEmails);
    const key = `new:${email}`;
    parentRefs.set(key, {
      key,
      name,
      email,
      phone,
      // Rows can carry their own passwords; fall back to the default only
      // when the row has none (both are validated >= 6 chars upstream).
      password: password || defaultPassword,
      isNew: true,
    });
    return key;
  };

  const isPossibleDuplicate = (name, arm, phone) => {
    const norm = normPhone(phone);
    if (!norm) return false; // no phone -> too weak a signal, let it through
    const nameKey = String(name).trim().toLowerCase();
    return existingUsers.some(
      (u) =>
        u.role === role &&
        String(u.name || "").trim().toLowerCase() === nameKey &&
        (arm ? u.assignedClass === arm : true) &&
        normPhone(u.phone) === norm
    );
  };

  for (const r of rows) {
    const rowErrors = [];
    const name = r.name.trim();
    if (!name) rowErrors.push("Name is required");

    // Teacher subject-specialist scope: the singular `assigned class` column
    // stays the display/default arm; the multi-value `assigned classes` column
    // is the full set of arms taught. Every arm gets the same known/create
    // treatment as the singular one. Students keep the single arm.
    const isTeacher = role === "TEACHER";
    const arm = r.classArm.trim();
    // The multi-value `assigned classes` list is the authoritative arm set;
    // the singular `assigned class` column is only appended when it names an
    // arm not already in that list (dedupe keeps the list's own order).
    const armList = isTeacher
      ? [...new Set(
          [...(r.assignedClasses || []), ...(arm ? [arm] : [])].filter(Boolean)
        )]
      : arm
        ? [arm]
        : [];
    const primaryArm = isTeacher && !arm && armList.length ? armList[0] : arm;
    for (const a of armList) {
      if (!knownArms.has(a)) {
        if (createArms) armsToAdd.add(a);
        else rowErrors.push(`Unknown class arm “${a}” — add it in Settings or enable auto-create`);
      }
    }

    const providedEmail = r.email.toLowerCase();
    if (providedEmail && !EMAIL_RE.test(providedEmail)) {
      rowErrors.push("Invalid email format");
    }

    const rawPassword = r.password || defaultPassword || "";
    let password = rawPassword;
    let generatedPassword = null;
    if (!password) {
      // Students auto-derive a password as name + class arm (lowercased,
      // unspaced — "Adam Tope" → "adamtopejss1") so they never need an
      // admin-chosen one. Staff imports still require a valid password.
      if (role === "STUDENT") {
        const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        generatedPassword = `${slug(name)}${slug(primaryArm)}`;
        password = generatedPassword;
      } else {
        rowErrors.push("Password must be at least 6 characters");
      }
    } else if (password.length < 6) {
      rowErrors.push("Password must be at least 6 characters");
    }
    // Record whatever password the account ends up with — the auto-derived
    // name+classarm value above, or a row/default-provided one — so the admin
    // can always look it up from Login Details / the credentials export.
    // Mirrors the single-add users route (parity with createUser).
    if (generatedPassword === null && password) {
      generatedPassword = password;
    }

    // Parent columns: a phone without a name is unusable.
    if (role === "STUDENT" && !r.parentName.trim() && r.parentPhone.trim()) {
      rowErrors.push("Parent name is required when a parent phone is given");
    }

    let status = "ok";
    let error = "";
    let email = providedEmail;

    if (rowErrors.length > 0) {
      status = "error";
      errors++;
      error = rowErrors.join(" · ");
    } else {
      if (providedEmail) {
        if (usedEmails.has(providedEmail)) {
          status = "duplicate";
          error = "An account with this email already exists in your school";
        } else {
          usedEmails.add(providedEmail);
        }
      } else {
        email = uniqueEmail(emailSlug(name), domain, usedEmails);
      }

      if (status === "ok" && isPossibleDuplicate(name, primaryArm, r.phone)) {
        status = "duplicate";
        error = "Possible duplicate entry (same name, class and phone)";
      }
      if (status === "duplicate") duplicates++;
    }

    let parentKey = "";
    if (role === "STUDENT" && status === "ok" && (r.parentName.trim() || r.parentPhone.trim())) {
      parentKey = ensureParent(r.parentName.trim(), r.parentPhone.trim(), r.password || defaultPassword);
    }

    plans.push({
      row: r.row,
      name,
      email,
      assignedClass: primaryArm,
      // Teacher subject-specialist scope — what applyImport passes to
      // createUser. Empty for students (and legacy single-arm teachers).
      subjects: isTeacher ? (r.subjects || []) : [],
      assignedClasses: isTeacher ? armList : [],
      phone: r.phone,
      password,
      generatedPassword,
      parentKey,
      parentName: r.parentName,
      status,
      error,
    });
  }

  const newParents = [...parentRefs.values()].filter((p) => p.isNew);

  return {
    plans,
    parentRefs: [...parentRefs.values()],
    newArms: [...armsToAdd].sort(),
    summary: {
      total: rows.length,
      ok: plans.filter((p) => p.status === "ok").length,
      errors,
      duplicates,
      newArms: armsToAdd.size,
      parentsToCreate: newParents.length,
    },
  };
}

/** The printable login sheet: ok rows + newly created parents. */
export function buildCredentials(role, plans, parentRefs, { skipParentKeys = new Set() } = {}) {
  const creds = [];
  for (const p of plans) {
    if (p.status !== "ok") continue;
    creds.push({
      name: p.name,
      email: p.email,
      password: p.password,
      role,
      assignedClass: p.assignedClass || "",
    });
  }
  for (const p of parentRefs) {
    if (!p.isNew || skipParentKeys.has(p.key)) continue;
    creds.push({
      name: p.name,
      email: p.email,
      password: p.password,
      role: "PARENT",
      assignedClass: "",
    });
  }
  return creds;
}

// ---- Applying ---------------------------------------------------------------

/**
 * Execute a plan through a store-like interface:
 *   store.getSchoolById, store.updateSchool, store.createUser, store.updateUser
 * Both the demo and Mongo stores implement this surface.
 */
export async function applyImport({ store, schoolId, role, plans, parentRefs, newArms }) {
  const created = { students: 0, teachers: 0, parents: 0, linked: 0 };
  const failed = [];
  const failedParentKeys = new Set();

  if (newArms.length > 0) {
    const school = await store.getSchoolById(schoolId);
    const merged = [...new Set([...(school?.activeArms || []), ...newArms])];
    await store.updateSchool(schoolId, { activeArms: merged });
  }

  // Parents first (student rows reference their ids). Parent counts are small
  // so they stay sequential; a failure here is recorded, not fatal.
  const parentIds = new Map();
  for (const ref of parentRefs) {
    try {
      if (ref.isNew) {
        const user = await store.createUser({
          schoolId,
          name: ref.name,
          email: ref.email,
          password: ref.password,
          role: "PARENT",
          phone: ref.phone || "",
        });
        parentIds.set(ref.key, user.id);
        created.parents++;
      } else {
        parentIds.set(ref.key, ref.id);
      }
    } catch (err) {
      failedParentKeys.add(ref.key);
      failed.push({
        row: null,
        name: ref.name,
        error: err?.message || "Failed to create parent account",
      });
    }
  }

  // Students/teachers in bounded-parallel chunks: each createUser bcrypt-hashes
  // the password, so a sequential loop over hundreds of rows takes minutes.
  // Parents are already resolved, so ordering between chunks is irrelevant.
  const okPlans = plans.filter((p) => p.status === "ok");
  const CHUNK = 20;
  for (let i = 0; i < okPlans.length; i += CHUNK) {
    const chunk = okPlans.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (p) => {
        try {
          const user = await store.createUser({
            schoolId,
            name: p.name,
            email: p.email,
            password: p.password,
            role,
            assignedClass: p.assignedClass,
            // Subject-specialist scope rides along — the teacher lands with
            // their subjects × arms already set, matching what the admin
            // console's form would produce.
            subjects: p.subjects || [],
            assignedClasses: p.assignedClasses || [],
            phone: p.phone,
            // Record the auto-generated student password so the admin can
            // look it up from the dashboard later.
            ...(p.generatedPassword ? { generatedPassword: p.generatedPassword } : {}),
          });
          if (role === "TEACHER") created.teachers++;
          else created.students++;

          if (p.parentKey && parentIds.has(p.parentKey)) {
            await store.updateUser(user.id, { parentId: parentIds.get(p.parentKey) });
            created.linked++;
          }
        } catch (err) {
          // One bad row must not sink the whole file: report it and continue.
          failed.push({
            row: p.row,
            name: p.name,
            error: err?.message || "Failed to create account",
          });
        }
      })
    );
  }

  return { created, failed, failedParentKeys };
}
