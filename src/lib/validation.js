/**
 * Zod validation for the API surface.
 *
 * Every route that accepts a body is validated here; the pattern is
 * `firstValidationMessage(schema, body)` → reject on the first invalid field.
 * Message priority and field order mirror the routes' historical hand-rolled
 * checks exactly, so the user-facing copy never changes.
 *
 * Deliberate exceptions (documented in each route): school PATCH
 * (deeply conditional, interpolated messages — already thorough + tested),
 * role re-roll (validated by src/lib/roles.js), notifications delete/read
 * (tolerate empty id lists by design), rename-arm/rollover (store-validated
 * via result.error).
 *
 * Zod 4 syntax: the `{ error }` param customizes the missing/type message;
 * `.min/.max/.refine` carry their own. Where a route's original checks were
 * interleaved with business logic (users POST, leads), the route runs a
 * SEQUENCE of small schemas in the original order.
 */
import { z } from "zod";
import { isSchoolDay, isPeriod } from "@/lib/timetable";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@/lib/passwords";

export const loginSchema = z.object({
  schoolId: z
    .string({ error: "Please select your school first" })
    .min(1, "Please select your school first"),
  // Parents and teachers sign in by NAME; everyone else by email. Either is
  // acceptable — the compound rule lives in the route (it must fire before
  // the password check to keep the historical message priority).
  email: z.string().optional(),
  name: z.string().optional(),
  password: z
    .string({ error: "Password is required" })
    .min(1, "Password is required"),
  role: z.string().optional(),
  next: z.string().optional(),
});

const REQUIRED = "School name, admin name, email and password are required";

// Field order mirrors the historical check order (required-all → password
// length → email format). The email-format check is a superRefine so it runs
// AFTER the field checks — otherwise zod would report a bad email before a
// short password, reversing the route's historical priority.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const registerSchema = z
  .object({
    schoolName: z.string({ error: REQUIRED }).min(1, REQUIRED),
    adminName: z.string({ error: REQUIRED }).min(1, REQUIRED),
    email: z.string({ error: REQUIRED }).min(1, REQUIRED),
    password: z
      .string({ error: REQUIRED })
      .min(6, "Password must be at least 6 characters"),
  })
  .superRefine((data, ctx) => {
    if (!EMAIL_RE.test(String(data.email))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please provide a valid email address",
        path: ["email"],
      });
    }
  });

/**
 * Reject on the first invalid field: returns the first issue's message, or
 * null when the input is valid. The route turns that message into its
 * error response.
 */
export function firstValidationMessage(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return null;
  return result.error.issues[0].message;
}

// ============================================================================
// auth — change password
// ============================================================================

const PW_BOTH = "Current password and new password are required";

export const changePasswordSchema = z.object({
  currentPassword: z.string({ error: PW_BOTH }).min(1, PW_BOTH),
  newPassword: z
    .string({ error: PW_BOTH })
    .min(1, PW_BOTH)
    .min(PASSWORD_MIN_LENGTH, `New password must be at least ${PASSWORD_MIN_LENGTH} characters`),
});

// ============================================================================
// admin — digest preference
// ============================================================================

export const digestSchema = z.object({
  frequency: z.enum(["off", "daily", "weekly"], {
    error: "frequency must be one of: off, daily, weekly",
  }),
});

// ============================================================================
// attendance
// ============================================================================

const ATT_REQ = "classArm, date and rows[] are required";

export const attendanceSchema = z.object({
  classArm: z.string({ error: ATT_REQ }).min(1, ATT_REQ),
  date: z.string({ error: ATT_REQ }).min(1, ATT_REQ),
  rows: z.array(z.unknown(), { error: ATT_REQ }).min(1, ATT_REQ),
});

// ============================================================================
// scores
// ============================================================================

const SCORE_REQ = "classArm, subject and rows[] are required";

// Per-row checks run in the original per-row order (studentId → CA → exam),
// and the CA/Exam bounds replicate the historical `Number(x) || 0` coercion
// (a non-numeric score silently becomes 0 and passes, exactly as before).
// caScore/examScore must be DECLARED (as unknown) so the superRefines below
// can see them — zod strips undeclared keys before refinements run.
const scoreRowSchema = z
  .object({
    studentId: z
      .string({ error: "Each row requires a studentId" })
      .min(1, "Each row requires a studentId"),
    caScore: z.unknown().optional(),
    examScore: z.unknown().optional(),
  })
  .superRefine((row, ctx) => {
    const ca = Number(row.caScore) || 0;
    if (ca < 0 || ca > 40) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CA scores must be between 0 and 40", path: ["caScore"] });
    }
  })
  .superRefine((row, ctx) => {
    const exam = Number(row.examScore) || 0;
    if (exam < 0 || exam > 60) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Exam scores must be between 0 and 60", path: ["examScore"] });
    }
  });

export const scoresSchema = z.object({
  classArm: z.string({ error: SCORE_REQ }).min(1, SCORE_REQ),
  subject: z.string({ error: SCORE_REQ }).min(1, SCORE_REQ),
  rows: z.array(scoreRowSchema, { error: SCORE_REQ }).min(1, SCORE_REQ),
});

// ============================================================================
// fees
// ============================================================================

export const feeStructureSchema = z.object({
  classArm: z.string({ error: "classArm is required" }).min(1, "classArm is required"),
  // Historical semantics: `Number(amount)` — a non-numeric value is NaN →
  // reject; 0 is a legal amount for a structure.
  amount: z.unknown().refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, "A valid amount is required"),
});

/** Shared by admin payments (fees/payments POST) and parent payments. */
export const feePaymentSchema = z.object({
  studentId: z.string({ error: "studentId is required" }).min(1, "studentId is required"),
  amount: z.unknown().refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, "A valid amount is required"),
});

export const confirmPaymentSchema = z.object({
  id: z.string({ error: "id is required" }).min(1, "id is required"),
});

export const receiptSchema = z.object({
  studentId: z
    .string({ error: "studentId and receiptNo are required" })
    .min(1, "studentId and receiptNo are required"),
  receiptNo: z
    .string({ error: "studentId and receiptNo are required" })
    .min(1, "studentId and receiptNo are required"),
});

const REMINDER_TOO_LONG = "Reminder message is too long (max 4000 characters)";

// Optional strings: a non-string value is coerced to "" by the routes (so it
// passes), exactly like the historical `typeof x === "string" ? x.trim() : ""`.
export const reminderMessageSchema = z.object({
  message: z.unknown().optional().refine((v) => typeof v !== "string" || v.length <= 4000, REMINDER_TOO_LONG),
  messageStudent: z.unknown().optional().refine((v) => typeof v !== "string" || v.length <= 4000, REMINDER_TOO_LONG),
});

// ============================================================================
// school — status, reminder templates
// ============================================================================

export const schoolStatusSchema = z.object({
  action: z.enum(["deactivate", "reactivate", "restore"], {
    error: 'action must be "deactivate", "reactivate" or "restore"',
  }),
});

const TEMPLATES_MSG = "Reminder messages are too long (max 4000 characters each)";

export const reminderTemplatesSchema = z.object({
  parent: z.unknown().optional().refine((v) => typeof v !== "string" || v.length <= 4000, TEMPLATES_MSG),
  student: z.unknown().optional().refine((v) => typeof v !== "string" || v.length <= 4000, TEMPLATES_MSG),
});

// ============================================================================
// timetable — slot entry + class-alert preference
// ============================================================================

const TT_REQ = "classArm, day, period, subject and teacherId are required";

export const timetableEntrySchema = z.object({
  classArm: z.string({ error: TT_REQ }).min(1, TT_REQ),
  day: z.string({ error: TT_REQ }).refine(isSchoolDay, TT_REQ),
  period: z.unknown({ error: TT_REQ }).refine(isPeriod, TT_REQ),
  subject: z.string({ error: TT_REQ }).min(1, TT_REQ),
  teacherId: z.string({ error: TT_REQ }).min(1, TT_REQ),
});

export const classAlertSchema = z.object({
  leadMinutes: z
    .unknown()
    .optional()
    .refine((v) => v === undefined || [0, 5, 10, 15, 30].includes(Number(v)), "leadMinutes must be one of 0, 5, 10, 15 or 30"),
});

// ============================================================================
// users — create, patch-arrays, reset password, merge, quick-add, import
// ============================================================================

const NAME_ROLE = "Name and role are required";

// Step 1 of the create-user sequence: name + role required, email required
// for every non-name-only role (parents/teachers sign in by name).
// email is DECLARED (optional) so the superRefine below can see it — zod
// strips undeclared keys before refinements run.
export const userIdentitySchema = z
  .object({
    name: z.string({ error: NAME_ROLE }).min(1, NAME_ROLE),
    role: z.string({ error: NAME_ROLE }).min(1, NAME_ROLE),
    email: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const roleEnum = String(data.role || "").toUpperCase();
    const nameOnly = roleEnum === "PARENT" || roleEnum === "TEACHER";
    if (!nameOnly && !String(data.email || "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email is required for this role",
        path: ["email"],
      });
    }
  });

// Step 2: the role must be creatable by the portal (uppercase-insensitive).
export const userRoleSchema = z.object({
  role: z
    .string()
    .refine(
      (v) => ["STUDENT", "TEACHER", "PARENT", "BURSAR", "REGISTRAR"].includes(String(v).toUpperCase()),
      "Role must be STUDENT, TEACHER, PARENT, BURSAR or REGISTRAR"
    ),
});

// Step 3 (runs after the password-derivation block): optional email format.
export const userEmailSchema = z.object({
  email: z
    .string()
    .optional()
    .refine((v) => !v || EMAIL_RE.test(String(v)), "Please provide a valid email address"),
});

// subjects/assignedClasses shape guard — used by the users/[id] PATCH route
// inside its SUPER_ADMIN gate (kept in the route, exactly where it was).
export const userPatchArraysSchema = z.object({
  subjects: z
    .unknown()
    .optional()
    .refine((v) => v === undefined || (Array.isArray(v) && v.every((s) => typeof s === "string")), "subjects must be an array of strings"),
  assignedClasses: z
    .unknown()
    .optional()
    .refine((v) => v === undefined || (Array.isArray(v) && v.every((s) => typeof s === "string")), "assignedClasses must be an array of strings"),
});

// Empty (or absent) password → the route generates one; present passwords
// must be within bcrypt-safe bounds (trimmed, matching the route).
export const resetPasswordSchema = z.object({
  password: z
    .string({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` })
    .optional()
    .refine(
      (v) => {
        const t = typeof v === "string" ? v.trim() : "";
        return t === "" || t.length >= PASSWORD_MIN_LENGTH;
      },
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
    )
    .refine(
      (v) => {
        const t = typeof v === "string" ? v.trim() : "";
        return t === "" || t.length <= PASSWORD_MAX_LENGTH;
      },
      `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
    ),
});

export const mergeParentsSchema = z
  .object({
    keepId: z.string({ error: "keepId and removeId are required" }).min(1, "keepId and removeId are required"),
    removeId: z.string({ error: "keepId and removeId are required" }).min(1, "keepId and removeId are required"),
  })
  .superRefine((data, ctx) => {
    if (data.keepId && data.keepId === data.removeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot merge an account into itself",
        path: ["keepId"],
      });
    }
  });

export const quickAddClassArmSchema = z.object({
  classArm: z.string({ error: "Choose a class arm first" }).min(1, "Choose a class arm first"),
});

export const quickAddPasswordSchema = z.object({
  defaultPassword: z
    .string({ error: "Default password must be at least 6 characters" })
    .optional()
    .refine((v) => !v || v.length >= 6, "Default password must be at least 6 characters"),
});

const IMPORT_MAX_BYTES = 2_000_000; // ~2 MB of CSV (users/import)
const PLACEHOLDERS_MAX_BYTES = 200_000; // paper-register counts CSV (users/placeholders)

export const importSchema = z.object({
  role: z
    .string()
    .refine(
      (v) => ["STUDENT", "TEACHER"].includes(String(v).toUpperCase()),
      "Role must be STUDENT or TEACHER"
    ),
  csv: z
    .string({ error: "CSV content is required" })
    .refine((v) => v.trim().length > 0, "CSV content is required")
    .max(IMPORT_MAX_BYTES, "File is too large (max 2 MB)"),
  options: z
    .object({
      defaultPassword: z
        .string({ error: "Default password must be at least 6 characters" })
        .optional()
        .refine((v) => !v || v.length >= 6, "Default password must be at least 6 characters"),
    })
    .optional(),
});

export const placeholdersSchema = z.object({
  csv: z
    .string({ error: "CSV content is required" })
    .refine((v) => v.trim().length > 0, "CSV content is required")
    .max(PLACEHOLDERS_MAX_BYTES, "File is too large"),
  defaultPassword: z
    .string({ error: "Default password must be at least 6 characters" })
    .optional()
    .refine((v) => !v || v.length >= 6, "Default password must be at least 6 characters"),
});

// ============================================================================
// public marketing — leads + newsletter (sequential schemas for leads)
// ============================================================================

const LEAD_ID = "Please provide your name and school name";

// Step 1: name + school name present (trimmed).
export const leadIdentitySchema = z.object({
  name: z.string({ error: LEAD_ID }).refine((v) => String(v).trim().length > 0, LEAD_ID),
  school: z.string({ error: LEAD_ID }).refine((v) => String(v).trim().length > 0, LEAD_ID),
});

// Step 2: the name must contain at least one letter.
export const leadNameSchema = z.object({
  name: z.string().refine((v) => /\p{L}/u.test(String(v).trim()), "Please provide a valid name"),
});

// Step 3: email format (empty email fails, like the original).
export const leadEmailSchema = z.object({
  email: z
    .string({ error: "Please provide a valid email address" })
    .refine((v) => EMAIL_RE.test(String(v).trim().toLowerCase()), "Please provide a valid email address"),
});

export const newsletterSchema = z.object({
  email: z
    .string({ error: "Please provide a valid email address" })
    .refine((v) => EMAIL_RE.test(String(v).trim().toLowerCase()), "Please provide a valid email address"),
});
