import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import School from "@/models/School";
import User from "@/models/User";
import Score from "@/models/Score";
import FeeStructure from "@/models/FeeStructure";
import FeePayment from "@/models/FeePayment";
import FeeCarryover from "@/models/FeeCarryover";
import ReminderBatch from "@/models/ReminderBatch";
import Attendance from "@/models/Attendance";
import TimetableEntry from "@/models/TimetableEntry";
import TermArchive from "@/models/TermArchive";
import ClassAlertPref from "@/models/ClassAlertPref";
import ConflictScan from "@/models/ConflictScan";
import Lead from "@/models/Lead";
import Notification from "@/models/Notification";
import FeeAudit from "@/models/FeeAudit";
import RoleAudit from "@/models/RoleAudit";
import DigestPref from "@/models/DigestPref";
import Digest from "@/models/Digest";
import { bypassTenantScope } from "@/lib/tenant-scope";
import { computeGrade } from "@/lib/grading";
import { nameSlug } from "@/lib/passwords";
import { STAFF_ROLES } from "@/lib/permissions";
import {
  blindEmailIndex,
  blindPhoneIndex,
  decryptField,
  encryptField,
} from "@/lib/field-crypto";

async function ready() {
  await connectDB();
}

const safe = (doc) => (doc ? doc.toJSON() : null);

// ---- Schools ---------------------------------------------------------------

export async function createSchoolAndAdmin({ schoolName, adminName, email, password }) {
  await ready();
  const school = await School.create({
    name: schoolName,
    activeArms: [],
    currentSession: "2025/2026",
    currentTerm: "First Term",
  });
  try {
    const user = await User.create({
      name: adminName,
      email: encryptField(email),
      emailIdx: blindEmailIndex(email),
      phone: "",
      phoneIdx: "",
      password,
      role: "SUPER_ADMIN",
      schoolId: school._id,
      payrollStatus: "PAID",
    });
    return { school: safe(school), user: safe(user) };
  } catch (err) {
    // Roll back the orphaned tenant so a failed admin create leaves no residue
    await School.findByIdAndDelete(school._id).catch(() => {});
    throw err;
  }
}

export async function findUserByEmail(email) {
  await ready();
  // Equality lookup on the blind index — the ciphertext (fresh IV per write)
  // can never be matched directly.
  // Site-wide (pre-tenant) lookups: the register-time dedupe and the demo
  // route's admin lookup run before any school exists — explicitly bypassed.
  let user = await bypassTenantScope(User.findOne({ emailIdx: blindEmailIndex(email) }));
  // Same lazy legacy migration as findUserByEmailInSchool (below).
  if (!user) {
    user = await bypassTenantScope(User.findOne({ email: email.toLowerCase() }));
    if (user) {
      await bypassTenantScope(
        User.updateOne(
          { _id: user._id },
          {
            $set: {
              email: encryptField(user.email),
              emailIdx: blindEmailIndex(user.email),
            },
          }
        )
      );
    }
  }
  return user ? userToLoginShape(user) : null;
}

/** Login lookup scoped to a tenant — this is the ONLY path login should use. */
export async function findUserByEmailInSchool(schoolId, email) {
  await ready();
  let user = await User.findOne({
    schoolId,
    emailIdx: blindEmailIndex(email),
  });
  // Lazy legacy migration: a doc written before encryption has a plaintext
  // `email` and NO emailIdx, so the blind-index lookup misses. Fall back to a
  // plaintext match and upgrade the doc in place — after this, the unique
  // emailIdx index governs it like any new record. Keeps existing logins
  // working across an upgrade without a scripted migration.
  if (!user) {
    user = await User.findOne({ schoolId, email: email.toLowerCase() });
    if (user) {
      // By-_id upgrade of a row already found through the schoolId scope above.
      await bypassTenantScope(
        User.updateOne(
          { _id: user._id },
          {
            $set: {
              email: encryptField(user.email),
              emailIdx: blindEmailIndex(user.email),
            },
          }
        )
      );
    }
  }
  return user ? userToLoginShape(user) : null;
}

// Exported so the node --test suite can pin the projection's field list — the
// auth shape is where the two stores must stay identical (a dropped field here
// silently breaks login stamping or session revocation in Mongo mode only).
export function userToLoginShape(user) {
  // Plain object INCLUDING the password hash for the auth flows (login
  // verification, password change). Never serialized directly.
  return {
    id: user._id.toString(),
    name: user.name,
    // Login needs the REAL email — decrypt.
    email: decryptField(user.email) || "",
    password: user.password,
    role: user.role,
    schoolId: user.schoolId.toString(),
    assignedClass: user.assignedClass,
    payrollStatus: user.payrollStatus,
    feePaid: user.feePaid,
    // Session-revocation counter — change-password reads it to advance the
    // version and login stamps it into new tokens. Dropping it here locks a
    // user out after their first password change (tokens stamp 0 while the
    // account sits at ≥ 1) and stops the counter from ever advancing.
    tokenVersion: user.tokenVersion || 0,
    // Teacher bootstrap flag — false until the teacher sets their own
    // password; login's school-name fallback keys off it.
    passwordSet: !!user.passwordSet,
  };
}

/** Auth-data lookup by id (password verification needs the hash). */
export async function findUserByIdWithAuth(id) {
  await ready();
  const user = await bypassTenantScope(User.findById(id));
  return user ? userToLoginShape(user) : null;
}

/**
 * Find a PARENT by their full name — the name the admin typed when creating
 * or linking them. Case-insensitive (names are plaintext in Mongo; only
 * email/phone are encrypted), tenant-scoped, role-filtered so a student
 * sharing a parent's name can never be found here. Returns the auth shape
 * (password hash included) exactly like findUserByEmailInSchool.
 */
export async function findParentByNameInSchool(schoolId, name) {
  await ready();
  const norm = String(name || "").trim();
  if (!norm) return null;
  const user = await User.findOne({
    schoolId,
    role: "PARENT",
    name: { $regex: `^${norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
  });
  return user ? userToLoginShape(user) : null;
}

/**
 * Find a TEACHER by their full name — the name the admin typed when creating
 * them. Case-insensitive, tenant-scoped, role-filtered so a student or
 * parent sharing a teacher's name can never be found here. Returns the auth
 * shape (password hash included) exactly like findParentByNameInSchool.
 */
export async function findTeacherByNameInSchool(schoolId, name) {
  await ready();
  const norm = String(name || "").trim();
  if (!norm) return null;
  const user = await User.findOne({
    schoolId,
    role: "TEACHER",
    name: { $regex: `^${norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
  });
  return user ? userToLoginShape(user) : null;
}

export async function searchSchools(search, limit = 8) {
  await ready();
  const q = (search || "").trim();
  const query = q
    ? { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }
    : {};
  const docs = await School.find(query).limit(limit);
  return docs.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    logoUrl: s.logoUrl || "",
    brandColor: s.brandColor || "#2563EB",
    // "active" | "frozen" — the login page shows a notice when someone
    // picks a deactivated school, before they type credentials.
    status: s.status || "active",
  }));
}

/** Every school id — the daily conflict-scan scheduler iterates tenants. */
export async function listSchoolIds() {
  await ready();
  const docs = await School.find({}, { _id: 1 });
  return docs.map((d) => d._id.toString());
}

export async function findUserById(id) {
  await ready();
  const user = await bypassTenantScope(User.findById(id));
  return user ? user.toJSON() : null;
}

/**
 * Raw user _ids for a school — the lean list the auth-snapshot cache uses to
 * invalidate every cached session when the school freezes/restores/deletes.
 * _id-only projection: no PII decryption, no full documents (a rare admin
 * action, but it must not read the whole roster's encrypted fields).
 */
export async function getSchoolUserIds(schoolId) {
  await ready();
  const docs = await User.find({ schoolId }).select("_id").lean();
  return docs.map((d) => d._id.toString());
}

/**
 * Lean auth hot-path lookup — role/schoolId/assignedClass/subjects/arms/
 * tokenVersion via .select() + .lean() so the per-request revalidation never
 * loads (or decrypts) the PII fields. Every authed request pays for a bare
 * indexed field read instead of an AES-GCM decrypt per request. The teaching
 * arrays ride along because requireClassScope needs them for the subject-
 * specialist scope (they are tiny); tokenVersion rides along so the auth
 * guard can revoke stale sessions after a password change.
 */
export async function findAuthSnapshot(id) {
  await ready();
  // By-_id auth lookup: the session's schoolId is verified against the token
  // by requireAuth after this returns — the one by-id read on the hot path.
  const user = await bypassTenantScope(
    User.findById(id)
      .select("role schoolId assignedClass subjects assignedClasses tokenVersion")
      .lean()
  );
  if (!user) return null;
  // Legacy migration: a doc written before the subject-teaching model has
  // only assignedClass. Derive the arms array from it (same fallback as the
  // demo store) so the multi-arm scope works without a scripted migration.
  const arms = Array.isArray(user.assignedClasses) && user.assignedClasses.length > 0
    ? user.assignedClasses
    : user.assignedClass
      ? [user.assignedClass]
      : [];
  // The school's freeze status — the auth guard rejects every non-super-admin
  // request the moment a school is deactivated. One extra indexed _id read
  // beats re-fetching the full school document on every authed request.
  let schoolStatus = "active";
  try {
    const school = await School.findById(user.schoolId).select("status").lean();
    schoolStatus = school?.status || "active";
  } catch {
    schoolStatus = "active";
  }
  return {
    id: String(user._id),
    role: user.role,
    schoolId: String(user.schoolId),
    schoolStatus,
    assignedClass: user.assignedClass || "",
    // Session-revocation counter — legacy docs without it read as 0.
    tokenVersion: user.tokenVersion || 0,
    subjects: Array.isArray(user.subjects) ? user.subjects : [],
    assignedClasses: arms,
  };
}

export async function getSchoolById(id) {
  await ready();
  return safe(await School.findById(id));
}

export async function updateSchool(id, patch) {
  await ready();
  const allowed = ["name", "logoUrl", "sealUrl", "brandColor", "activeArms", "currentSession", "currentTerm", "onboardingComplete", "periodTimes", "breakTimes", "dailySchedules", "reminderTemplates", "notificationRetentionDays", "reconcileDeletedReminders"];
  const update = {};
  allowed.forEach((k) => {
    if (patch[k] !== undefined) update[k] = patch[k];
  });
  return safe(await School.findByIdAndUpdate(id, update, { new: true }));
}

/**
 * Rename a class arm across EVERY reference in one pass — the school's
 * activeArms list, student/teacher assignedClass, teacher assignedClasses
 * arrays, fee structures, scores, attendance registers and timetable entries
 * (parity with the demo store's renameArm). Each collection is migrated with
 * its own updateMany; the school's activeArms is updated first so the rename
 * is durable even if a later collection hiccups (re-running is idempotent).
 *
 * Validation mirrors the demo store: `from` must be a current arm, `to` must
 * be non-empty and case-insensitively distinct from every existing arm.
 * Returns { school, counts } on success, { error } for a rejected rename, or
 * null when the school is missing.
 */
export async function renameArm(schoolId, from, to) {
  await ready();
  const school = await School.findById(schoolId);
  if (!school) return null;
  const source = String(from || "").trim();
  const target = String(to || "").trim();
  if (!source) return { error: "The arm to rename is required" };
  if (!target) return { error: "The new arm name is required" };
  if (!school.activeArms.includes(source)) {
    return { error: `"${source}" is not one of the school's class arms` };
  }
  if (school.activeArms.some((a) => String(a).toLowerCase() === target.toLowerCase())) {
    return { error: `"${target}" is already a class arm` };
  }
  if (source.toLowerCase() === target.toLowerCase()) {
    return { error: "The new name must differ from the current one" };
  }

  school.activeArms = school.activeArms.map((a) => (a === source ? target : a));
  await school.save();

  const counts = { students: 0, teachers: 0, feeStructures: 0, scores: 0, attendance: 0, timetable: 0 };

  // Users: students carry the arm in assignedClass; teachers may carry it in
  // BOTH assignedClass (display/default) and the assignedClasses array.
  const students = await User.find({ schoolId, role: "STUDENT", assignedClass: source }).select("_id");
  counts.students = students.length;
  if (students.length) {
    await User.updateMany(
      { schoolId, role: "STUDENT", assignedClass: source },
      { $set: { assignedClass: target } }
    );
  }
  const teachers = await User.find({
    schoolId,
    role: "TEACHER",
    $or: [{ assignedClass: source }, { assignedClasses: source }],
  }).select("_id");
  counts.teachers = teachers.length;
  if (teachers.length) {
    await User.updateMany(
      { schoolId, role: "TEACHER", $or: [{ assignedClass: source }, { assignedClasses: source }] },
      [
        {
          $set: {
            assignedClass: {
              $cond: [{ $eq: ["$assignedClass", source] }, target, "$assignedClass"],
            },
            assignedClasses: {
              $map: {
                input: { $ifNull: ["$assignedClasses", []] },
                as: "arm",
                in: { $cond: [{ $eq: ["$$arm", source] }, target, "$$arm"] },
              },
            },
          },
        },
      ]
    );
  }

  const [feeRes, scoreRes, attRes, ttRes] = await Promise.all([
    FeeStructure.updateMany({ schoolId, classArm: source }, { $set: { classArm: target } }),
    Score.updateMany({ schoolId, classArm: source }, { $set: { classArm: target } }),
    Attendance.updateMany({ schoolId, classArm: source }, { $set: { classArm: target } }),
    TimetableEntry.updateMany({ schoolId, classArm: source }, { $set: { classArm: target } }),
  ]);
  counts.feeStructures = feeRes.modifiedCount;
  counts.scores = scoreRes.modifiedCount;
  counts.attendance = attRes.modifiedCount;
  counts.timetable = ttRes.modifiedCount;

  return { school: safe(school), counts };
}

/**
 * Move the school to a new term (term rollover) — one atomic operation that
 * archives the old term's scores + attendance into TermArchive (per-row docs,
 * keyed by schoolId/session/term/kind) and clears them from the live tables,
 * clones each arm's fee structure forward (idempotent upsert on the unique
 * schoolId+classArm+session+term key), re-stamps the shared weekly timetable
 * grid onto the new term, resets every student's feePaid, and moves the
 * school's currentSession/currentTerm. `dryRun` returns the exact counts
 * WITHOUT mutating anything. Returns { school, counts } | { error } | null.
 */
export async function rolloverTerm(schoolId, { newTerm, newSession, dryRun = false }) {
  await ready();
  const school = await School.findById(schoolId);
  if (!school) return null;
  const term = String(newTerm || "").trim();
  const session = String(newSession || "").trim() || school.currentSession || "2025/2026";
  if (!term) return { error: "The new term is required" };
  if (term === school.currentTerm && session === school.currentSession) {
    return { error: `The school is already on ${session} · ${term}` };
  }
  const oldSession = school.currentSession || "2025/2026";
  const oldTerm = school.currentTerm || "First Term";

  const [scoreRows, attendanceRows, oldStructures, ttEntries, studentCount] = await Promise.all([
    Score.countDocuments({ schoolId }),
    Attendance.countDocuments({ schoolId, session: oldSession, term: oldTerm }),
    FeeStructure.find({ schoolId, session: oldSession, term: oldTerm }),
    TimetableEntry.countDocuments({ schoolId }),
    User.countDocuments({ schoolId, role: "STUDENT" }),
  ]);

  // Old-term balances are captured BEFORE the term moves — every student with
  // a balance > 0 carries that unpaid amount into the new term, where it is
  // ADDED to the new term's fee (the ledger computes amount = structure +
  // carryover). Read-only, so the dry-run reports the same count.
  const oldLedger = await getFeeLedger(schoolId);
  const carriedBalances = new Map(
    oldLedger.filter((l) => l.balance > 0).map((l) => [l.studentId, l.balance])
  );

  const counts = {
    scoresArchived: scoreRows,
    attendanceArchived: attendanceRows,
    feesCloned: oldStructures.length,
    timetableCloned: ttEntries,
    studentsReset: studentCount,
    // Students whose unpaid balance rolls into the new term (each also gets
    // an automatic reminder at the start of the new term).
    carryovers: carriedBalances.size,
  };
  if (dryRun) return { school: safe(school), counts };

  // 1. Archive the old term's scores + attendance, then clear them from live.
  //    Also snapshot the COHORT ROSTER — each enrolled student's name (and
  //    arm) rides into the archive so archived report cards keep the real
  //    name even if the student later graduates or is deleted. Roster rows
  //    are excluded from the summary counts (they are neither scores nor
  //    attendance registers).
  const [scoreDocs, attDocs, rosterStudents] = await Promise.all([
    Score.find({ schoolId }),
    Attendance.find({ schoolId, session: oldSession, term: oldTerm }),
    User.find({ schoolId, role: "STUDENT" }).select("name assignedClass"),
  ]);
  const archiveRows = [
    ...rosterStudents.map((u) => ({
      schoolId,
      session: oldSession,
      term: oldTerm,
      kind: "student",
      classArm: u.assignedClass || "",
      studentId: u._id,
      studentName: u.name,
    })),
    ...scoreDocs.map((s) => ({
      schoolId,
      session: oldSession,
      term: oldTerm,
      kind: "score",
      classArm: s.classArm,
      studentId: s.studentId,
      subject: s.subject,
      caScore: s.caScore,
      examScore: s.examScore,
      totalScore: s.totalScore,
      grade: s.grade,
    })),
    ...attDocs.map((a) => ({
      schoolId,
      session: oldSession,
      term: oldTerm,
      kind: "attendance",
      classArm: a.classArm,
      date: a.date,
      records: a.records.map((r) => ({ studentId: r.studentId, present: r.present })),
    })),
  ];
  if (archiveRows.length) await TermArchive.insertMany(archiveRows);
  await Score.deleteMany({ schoolId });
  await Attendance.deleteMany({ schoolId, session: oldSession, term: oldTerm });

  // 2. Clone each arm's fee structure forward (idempotent upsert).
  await Promise.all(
    oldStructures.map((f) =>
      FeeStructure.findOneAndUpdate(
        { schoolId, classArm: f.classArm, session, term },
        { schoolId, classArm: f.classArm, session, term, amount: f.amount },
        { upsert: true, new: true }
      )
    )
  );

  // 3. Re-stamp the shared weekly grid onto the new term.
  await TimetableEntry.updateMany({ schoolId }, { $set: { session, term } });

  // 4. Move the school forward + reset termly billing state.
  await School.findByIdAndUpdate(schoolId, { currentSession: session, currentTerm: term });
  await User.updateMany({ schoolId, role: "STUDENT" }, { $set: { feePaid: false } });

  // 5. Carry each student's unpaid balance into the new term (idempotent per
  //    student per new term). The route sends the automatic reminders.
  const carried = [];
  if (carriedBalances.size) {
    await FeeCarryover.insertMany(
      Array.from(carriedBalances, ([studentId, amount]) => ({
        schoolId,
        studentId,
        session,
        term,
        amount,
        fromSession: oldSession,
        fromTerm: oldTerm,
      }))
    );
    Array.from(carriedBalances, ([studentId, amount]) =>
      carried.push({ studentId, amount })
    );
  }

  return { school: safe(await School.findById(schoolId)), counts, carryovers: carried };
}

/**
 * Read archived term snapshots — the durable record of a rolled-over term's
 * scores + attendance. Optional `{ session, term, kind }` narrows the query.
 */
export async function listTermArchives(schoolId, { session, term, kind } = {}) {
  await ready();
  const query = { schoolId };
  if (session) query.session = session;
  if (term) query.term = term;
  if (kind) query.kind = kind;
  return (await TermArchive.find(query)).map(safe);
}

// Display order for archived terms: First → Second → Third, then by session.
const TERM_DISPLAY_ORDER = ["First Term", "Second Term", "Third Term"];

/**
 * Grouped summary of every archived term for a school — the "Previous Terms"
 * viewer's term list. Aggregates in the database (a rolled-over term at the
 * 10k-student ceiling can hold 50k+ score rows) instead of loading them all.
 * Each entry carries the term's total score/attendance counts plus a per-arm
 * breakdown.
 */
export async function getTermArchiveTerms(schoolId) {
  await ready();
  const rows = await TermArchive.aggregate([
    // Roster snapshot rows are neither scores nor attendance registers — they
    // must not inflate the score/attendance counts — but they DO prove the
    // term existed, so a rolled-over term with no scores/attendance (a fresh
    // school) still appears in the viewer with its cohort.
    { $match: { schoolId } },
    {
      $group: {
        _id: { session: "$session", term: "$term", classArm: "$classArm", kind: "$kind" },
        n: { $sum: 1 },
      },
    },
  ]);
  const groups = {};
  rows.forEach((r) => {
    const { session, term, classArm, kind } = r._id;
    const key = `${session}||${term}`;
    if (!groups[key]) {
      groups[key] = { session, term, scoreCount: 0, attendanceCount: 0, students: 0, arms: {} };
    }
    const g = groups[key];
    if (kind === "score") g.scoreCount += r.n;
    else if (kind === "attendance") g.attendanceCount += r.n;
    else if (kind === "student") g.students += r.n;
    if (!g.arms[classArm]) {
      g.arms[classArm] = { classArm, scoreCount: 0, attendanceCount: 0, students: 0 };
    }
    if (kind === "score") g.arms[classArm].scoreCount += r.n;
    else if (kind === "attendance") g.arms[classArm].attendanceCount += r.n;
    else if (kind === "student") g.arms[classArm].students += r.n;
  });
  return Object.values(groups)
    .sort((x, y) => {
      const tx = TERM_DISPLAY_ORDER.indexOf(x.term);
      const ty = TERM_DISPLAY_ORDER.indexOf(y.term);
      if (tx !== ty) return tx - ty;
      return String(x.session).localeCompare(String(y.session));
    })
    .map((g) => ({
      session: g.session,
      term: g.term,
      scoreCount: g.scoreCount,
      attendanceCount: g.attendanceCount,
      students: g.students,
      arms: Object.values(g.arms).sort((a, b) => a.classArm.localeCompare(b.classArm)),
    }));
}

/**
 * Raw archived rows for one (session, term) and optionally one class arm —
 * the API joins these with student names and computes report-card summaries.
 */
export async function getTermArchiveDetail(schoolId, { session, term, classArm } = {}) {
  await ready();
  const query = { schoolId };
  if (session) query.session = session;
  if (term) query.term = term;
  if (classArm) query.classArm = classArm;
  return (await TermArchive.find(query)).map(safe);
}

/**
 * Ordering key for "which term came last" comparisons: session string first
 * ("2025/2026" < "2026/2027"), then First < Second < Third within a session.
 */
function termRankKey(session, term) {
  const t = TERM_DISPLAY_ORDER.indexOf(term);
  return `${session}::${String(t === -1 ? 99 : t).padStart(2, "0")}`;
}

/**
 * Alumni — every student in an archived term's roster who is NO LONGER on the
 * live roster (graduated or deleted), with the term they last appeared in.
 * The archived roster snapshots names, so alumni keep the name they were
 * called in school even if the live user record is gone.
 */
export async function getAlumni(schoolId) {
  await ready();
  const [rosterRows, liveStudents] = await Promise.all([
    TermArchive.find({ schoolId, kind: "student" }).select("studentId studentName classArm session term"),
    User.find({ schoolId, role: "STUDENT" }).select("_id"),
  ]);
  const liveIds = new Set(liveStudents.map((u) => u._id.toString()));
  const lastByStudent = {};
  rosterRows.forEach((a) => {
    const key = a.studentId.toString();
    const prev = lastByStudent[key];
    const rank = termRankKey(a.session, a.term);
    if (!prev || rank > prev._rank) {
      lastByStudent[key] = {
        studentId: key,
        studentName: a.studentName,
        classArm: a.classArm,
        lastSession: a.session,
        lastTerm: a.term,
        _rank: rank,
      };
    }
  });
  return Object.values(lastByStudent)
    .filter((s) => !liveIds.has(s.studentId))
    .map(({ _rank, ...rest }) => rest)
    .sort((x, y) => x.studentName.localeCompare(y.studentName));
}

// ---- Users -----------------------------------------------------------------

export async function listUsers({ schoolId, role, classArm, limit, offset = 0 }) {
  await ready();
  const query = { schoolId };
  if (role) query.role = role;
  if (classArm) query.assignedClass = classArm;
  let cursor = User.find(query).sort({ name: 1 });
  // Optional pagination — the roster tab can page instead of loading the
  // whole school in one payload. Clamp offset and floor the limit: the demo
  // store slice() would accept (and silently mis-handle) a negative offset /
  // fractional limit, while the Mongo driver throws on both.
  if (limit !== undefined) {
    cursor = cursor
      .skip(Math.max(0, Number(offset) || 0))
      .limit(Math.max(0, Math.floor(Number(limit) || 0)));
  }
  return (await cursor).map(safe);
}

/** Total rows listUsers would return for the same query (pagination parity). */
export async function countUsers({ schoolId, role, classArm }) {
  await ready();
  const query = { schoolId };
  if (role) query.role = role;
  if (classArm) query.assignedClass = classArm;
  return User.countDocuments(query);
}

export async function createUser({ schoolId, name, email, password, role, assignedClass = "", phone = "", subjects = [], assignedClasses = [], generatedPassword }) {
  await ready();
  // Regression-pinned by tests/tenant-scope.test.js: the create payload must
  // carry schoolId, role, password and assignedClass — a previous version
  // dropped them (invisible in demo mode, cross-tenant + un-loginable users
  // in Mongo mode). The raw password rides in; the User pre("save") hook
  // hashes it. Parity with the demo store's createUser.
  const user = await User.create({
    schoolId,
    name,
    email: encryptField(email),
    // Name-only parents have NO email. The blind index of "" is "", which
    // would collide on the per-school unique emailIdx index — derive a
    // per-user sentinel instead so any number of no-email parents can
    // coexist. Empty-email lookups never match (correct: nothing should).
    emailIdx: email ? blindEmailIndex(email) : `empty-${new mongoose.Types.ObjectId()}`,
    password,
    role,
    assignedClass,
    subjects: Array.isArray(subjects) ? subjects : [],
    // Teachers default to their single assignedClass (legacy parity); an
    // explicit multi-arm list wins.
    assignedClasses:
      Array.isArray(assignedClasses) && assignedClasses.length > 0
        ? assignedClasses
        : role === "TEACHER" && assignedClass
          ? [assignedClass]
          : [],
    phone: encryptField(phone),
    phoneIdx: blindPhoneIndex(phone),
    payrollStatus: role === "TEACHER" ? "PENDING" : "PAID",
    generatedPassword: generatedPassword || "",
  });
  return safe(user);
}

/**
 * Change a user's role — a dedicated store op so the generic updateUser path
 * can NEVER touch role (that route forbids it by construction).
 */
export async function updateRole(id, newRole) {
  await ready();
  // By-_id: the role route has already tenant-scoped the caller (requireAuth +
  // assertSameTenant) before reaching here.
  return safe(await bypassTenantScope(User.findByIdAndUpdate(id, { role: newRole }, { new: true })));
}

export async function updateUser(id, patch) {
  await ready();
  const allowed = [
    "name",
    "assignedClass",
    "subjects",
    "assignedClasses",
    "payrollStatus",
    "feePaid",
    "parentId",
    "phone",
    "address",
    "password",
    "generatedPassword",
    // Session revocation: bumped by the change-password route so every token
    // signed before the change dies on its next use.
    "tokenVersion",
    // Teacher bootstrap flag: true once the teacher sets their own password
    // (school-name login turns off); reset to false by an admin reset.
    "passwordSet",
  ];
  const update = {};
  allowed.forEach((k) => {
    if (patch[k] !== undefined) update[k] = patch[k];
  });
  // findByIdAndUpdate bypasses the model's pre("save") bcrypt hook, so hash
  // explicitly here. Callers validate length before reaching the store.
  if (update.password !== undefined) {
    update.password = await bcrypt.hash(update.password, 10);
  }
  // Phone is PII — encrypt on write (email is immutable via PATCH by design,
  // so only phone needs the field-crypto treatment here). The blind index is
  // computed from the PLAINTEXT (patch.phone), never the envelope.
  if (update.phone !== undefined) {
    update.phone = encryptField(update.phone);
    update.phoneIdx = blindPhoneIndex(patch.phone);
  }
  // Parent-link sync: when a student's link changes, the parent's password
  // becomes that child's slugged full name (recorded in generatedPassword so
  // the admin can look it up). A parent linked to several children signs in
  // with ANY of their names — the login route checks every linked child.
  // Unlinking (parentId: null) changes nothing.
  // By-_id parent-link lookups: the caller is tenant-scoped by the route
  // (requireAuth + assertSameTenant), so these are legitimate bypasses.
  if (update.parentId !== undefined) {
    const child = await bypassTenantScope(User.findById(id));
    if (child && child.role === "STUDENT" && update.parentId) {
      const parent = await bypassTenantScope(User.findById(update.parentId));
      if (parent && parent.role === "PARENT" && String(parent.schoolId) === String(child.schoolId)) {
        const slug = nameSlug(update.name !== undefined ? update.name : child.name);
        await bypassTenantScope(
          User.findByIdAndUpdate(update.parentId, {
            password: await bcrypt.hash(slug, 10),
            generatedPassword: slug,
          })
        );
      }
    }
  }
  return safe(await bypassTenantScope(User.findByIdAndUpdate(id, update, { new: true })));
}

/** List a parent's linked children (tenant-scoped to the parent's school). */
export async function getChildren(parentId) {
  await ready();
  const parent = await bypassTenantScope(User.findById(parentId));
  if (!parent) return [];
  return (await User.find({ schoolId: parent.schoolId, parentId })).map(safe);
}

export async function deleteUser(id) {
  await ready();
  // By-_id + cascade deletes: the route already tenant-scoped the caller.
  const user = await bypassTenantScope(User.findById(id));
  if (!user) return false;
  await bypassTenantScope(User.findByIdAndDelete(id));
  // Cascade: a removed student takes their scores, attendance and fee
  // payments with them; a removed teacher frees their timetable slots.
  if (user.role === "STUDENT") {
    await Promise.all([
      bypassTenantScope(Score.deleteMany({ studentId: id })),
      bypassTenantScope(Attendance.deleteMany({ studentId: id })),
      bypassTenantScope(FeePayment.deleteMany({ studentId: id })),
      bypassTenantScope(FeeCarryover.deleteMany({ studentId: id })),
    ]);
  } else if (user.role === "TEACHER") {
    await bypassTenantScope(TimetableEntry.deleteMany({ teacherId: id }));
  }
  return true;
}

/** How long a deleted school's data stays recoverable before the permanent wipe. */
export const SCHOOL_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export async function setSchoolStatus(schoolId, status) {
  await ready();
  const next = status === "frozen" ? "frozen" : "active";
  return School.findByIdAndUpdate(
    schoolId,
    // Back to active — whether a reactivation or a grace-period restore, the
    // deletedAt stamp is no longer meaningful.
    { $set: { status: next }, ...(next === "active" ? { $unset: { deletedAt: "" } } : {}) },
    { new: true }
  ).then((s) => (s ? s.toJSON() : null));
}

/**
 * Delete a school (grace period): marks it "deleted" with a deletedAt stamp
 * instead of wiping it. Every byte of data stays intact and the SUPER_ADMIN
 * can restore the account until the grace period expires.
 */
export async function deleteSchool(schoolId) {
  await ready();
  const school = await School.findByIdAndUpdate(
    schoolId,
    { status: "deleted", deletedAt: new Date() },
    { new: true }
  );
  return !!school;
}

/**
 * Permanent wipe — removes the school and every tenant record for real. This
 * is what purgeExpiredDeletedSchools runs once the grace period is over (and
 * what an expired school's login triggers lazily). Platform-level leads are
 * intentionally NOT tenant-scoped, so they survive.
 */
export async function purgeSchool(schoolId) {
  await ready();
  const school = await School.findById(schoolId);
  if (!school) return false;
  await Promise.all([
    School.deleteOne({ _id: schoolId }),
    User.deleteMany({ schoolId }),
    Score.deleteMany({ schoolId }),
    FeeStructure.deleteMany({ schoolId }),
    FeePayment.deleteMany({ schoolId }),
    FeeCarryover.deleteMany({ schoolId }),
    ReminderBatch.deleteMany({ schoolId }),
    Attendance.deleteMany({ schoolId }),
    TimetableEntry.deleteMany({ schoolId }),
    TermArchive.deleteMany({ schoolId }),
    ClassAlertPref.deleteMany({ schoolId }),
    ConflictScan.deleteMany({ schoolId }),
    Notification.deleteMany({ schoolId }),
    FeeAudit.deleteMany({ schoolId }),
    RoleAudit.deleteMany({ schoolId }),
    DigestPref.deleteMany({ schoolId }),
    Digest.deleteMany({ schoolId }),
  ]);
  return true;
}

/**
 * Sweep deleted schools whose grace period has lapsed — the daily background
 * job (see src/instrumentation.js) and the login route's lazy check both call
 * this. Idempotent: a school already purged is simply skipped. Returns the
 * number of tenants permanently removed.
 */
export async function purgeExpiredDeletedSchools({ now = Date.now(), graceMs = SCHOOL_DELETION_GRACE_MS } = {}) {
  await ready();
  const cutoff = new Date(now - graceMs);
  const expired = await School.find({ status: "deleted", deletedAt: { $lt: cutoff } }).lean();
  for (const s of expired) {
    await purgeSchool(String(s._id));
  }
  return expired.length;
}

// ---- Scores ----------------------------------------------------------------

export async function saveScores({ schoolId, classArm, subject, rows }) {
  await ready();
  const saved = [];
  for (const row of rows) {
    const caScore = Math.min(40, Math.max(0, Number(row.caScore) || 0));
    const examScore = Math.min(60, Math.max(0, Number(row.examScore) || 0));
    const totalScore = caScore + examScore;
    const grade = computeGrade(totalScore);
    const score = await Score.findOneAndUpdate(
      { studentId: row.studentId, schoolId, subject, classArm },
      { schoolId, caScore, examScore, totalScore, grade },
      { upsert: true, new: true }
    );
    saved.push(score.toJSON());
  }
  return saved;
}

export async function getScoresByClassSubject({ schoolId, classArm, subject }) {
  await ready();
  return (await Score.find({ schoolId, classArm, subject })).map((s) => s.toJSON());
}

export async function getScoresByStudent(studentId) {
  await ready();
  return (await Score.find({ studentId }).sort({ subject: 1 })).map((s) => s.toJSON());
}

export async function getScoresBySchool(schoolId) {
  await ready();
  return (await Score.find({ schoolId })).map((s) => s.toJSON());
}

/**
 * Arm-scoped scores — ranking/report-card comparisons that only need one
 * class arm load a bounded slice instead of the whole school's score table
 * (the 10k-user ceiling: 10k students × 5 subjects ≈ 50k docs per request).
 */
export async function getScoresByClassArm(schoolId, classArm) {
  await ready();
  return (await Score.find({ schoolId, classArm })).map((s) => s.toJSON());
}

export async function getDashboardStats(schoolId) {
  await ready();
  const [students, teachers, paidTeachers, feePaid, scoreRecords] = await Promise.all([
    User.countDocuments({ schoolId, role: "STUDENT" }),
    User.countDocuments({ schoolId, role: "TEACHER" }),
    User.countDocuments({ schoolId, role: "TEACHER", payrollStatus: "PAID" }),
    User.countDocuments({ schoolId, role: "STUDENT", feePaid: true }),
    Score.countDocuments({ schoolId }),
  ]);

  const studentUsers = await User.find({ schoolId, role: "STUDENT" }).select("assignedClass");
  const classDistribution = {};
  studentUsers.forEach((s) => {
    classDistribution[s.assignedClass || "Unassigned"] =
      (classDistribution[s.assignedClass || "Unassigned"] || 0) + 1;
  });

  const [structures, payments, studentList, school] = await Promise.all([
    FeeStructure.find({ schoolId }),
    FeePayment.find({ schoolId }),
    User.find({ schoolId, role: "STUDENT" }).select("assignedClass feePaid"),
    School.findById(schoolId),
  ]);
  // Scope fees to the school's CURRENT session+term so the overview reflects
  // "this term" (after a rollover, the old term's figures drop out). Only
  // CONFIRMED payments count as collected; PENDING awaits the school.
  const currentSession = school?.currentSession || "2025/2026";
  const currentTerm = school?.currentTerm || "First Term";
  const currentStructures = structures.filter(
    (f) => f.session === currentSession && f.term === currentTerm
  );
  const currentPayments = payments.filter(
    (p) => p.session === currentSession && p.term === currentTerm
  );
  const totalBilled = currentStructures.reduce(
    (acc, f) => acc + f.amount * (classDistribution[f.classArm] || 0),
    0
  );
  const totalCollected = currentPayments
    .filter((p) => p.status !== "PENDING")
    .reduce((acc, p) => acc + p.amount, 0);
  const pendingPayments = currentPayments.filter((p) => p.status === "PENDING");

  // Fee collection timeline — confirmed collections per calendar day for the
  // CURRENT term, ascending, capped to the last 30 days (the Overview's area
  // chart). Bounded on purpose: the full term history isn't needed on a card.
  const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const byDay = {};
  currentPayments
    .filter((p) => p.status !== "PENDING" && p.createdAt && p.createdAt.getTime() >= cutoff30)
    .forEach((p) => {
      const day = p.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + p.amount;
    });
  const collectionTimeline = Object.keys(byDay)
    .sort()
    .map((date) => ({ date, amount: byDay[date] }));

  // Attendance trend — present/absent per SCHOOL DAY for the current term,
  // last 7 days, ascending. Multiple arms marked on the same day collapse into
  // one point (the chart must never show duplicate dates). Aggregated in the
  // database (date is a YYYY-MM-DD string in the model).
  const trendRows = await Attendance.aggregate([
    { $match: { schoolId, session: currentSession, term: currentTerm } },
    { $unwind: { path: "$records" } },
    {
      $group: {
        _id: "$date",
        present: { $sum: { $cond: [{ $eq: ["$records.present", true] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$records.present", true] }, 0, 1] } },
      },
    },
    { $sort: { _id: -1 } },
    { $limit: 7 },
  ]);
  const attendanceTrend = trendRows
    .map((r) => ({ date: r._id, present: r.present, absent: r.absent }))
    .sort((x, y) => String(x.date).localeCompare(String(y.date)));

  return {
    totalStudents: students,
    activeTeachers: teachers,
    payrollPaid: paidTeachers,
    payrollPending: teachers - paidTeachers,
    feeCollected: feePaid,
    feeRate: students ? Math.round((feePaid / students) * 100) : 0,
    feeCollectedAmount: totalCollected,
    feeOutstandingAmount: Math.max(0, totalBilled - totalCollected),
    feeBilledAmount: totalBilled,
    pendingPayments: {
      count: pendingPayments.length,
      amount: pendingPayments.reduce((acc, p) => acc + p.amount, 0),
    },
    classDistribution,
    totalScoreRecords: scoreRecords,
    collectionTimeline,
    attendanceTrend,
  };
}

// ---- Fees -------------------------------------------------------------------

export async function getFeeStructures(schoolId) {
  await ready();
  return (await FeeStructure.find({ schoolId }).sort({ classArm: 1 })).map(safe);
}

export async function saveFeeStructure(schoolId, { classArm, amount, session, term }) {
  await ready();
  return safe(
    await FeeStructure.findOneAndUpdate(
      { schoolId, classArm, session, term },
      { schoolId, classArm, session, term, amount: Math.max(0, Number(amount) || 0) },
      { upsert: true, new: true }
    )
  );
}

export async function getFeeLedger(schoolId, { studentIds } = {}) {
  await ready();
  // Optional `{ studentIds }` scopes both queries to a subset (the parent
  // portal only needs its own children, not the whole school). Strings from
  // the API are normalized to ObjectIds so $in matches the ObjectId fields.
  const normalizeIds = (ids) =>
    (ids || []).map((id) =>
      mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : id
    );
  const studentQuery = { schoolId, role: "STUDENT" };
  const paymentQuery = { schoolId };
  if (studentIds) {
    studentQuery._id = { $in: normalizeIds(studentIds) };
    paymentQuery.studentId = { $in: normalizeIds(studentIds) };
  }
  const [students, school, structures] = await Promise.all([
    User.find(studentQuery).sort({ name: 1 }),
    School.findById(schoolId),
    FeeStructure.find({ schoolId }),
  ]);
  // Scope payments to the school's CURRENT session+term too, so an old term's
  // payments never satisfy the new term's balance after a rollover.
  const currentSession = school?.currentSession || "2025/2026";
  const currentTerm = school?.currentTerm || "First Term";
  paymentQuery.session = currentSession;
  paymentQuery.term = currentTerm;
  const scopedPayments = await FeePayment.find(paymentQuery);
  // Scope structures to the school's CURRENT session+term so a term rollover
  // never bills students with an old term's fee.
  const currentStructures = structures.filter(
    (f) => f.session === currentSession && f.term === currentTerm
  );
  // Unpaid balances carried from the previous term (created at rollover) ride
  // into this term's billing — the student owes new fee + carried debt.
  const carryovers = await FeeCarryover.find({ schoolId, session: currentSession, term: currentTerm });
  return students.map((student) => {
    const structure = currentStructures.find((f) => f.classArm === student.assignedClass);
    const carryover =
      carryovers.find((c) => c.studentId.toString() === student._id.toString())?.amount || 0;
    const amount = (structure?.amount || 0) + carryover;
    const studentPayments = scopedPayments
      .filter((p) => p.studentId.toString() === student._id.toString())
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(safe);
    // Only CONFIRMED payments reduce the balance; PENDING is reported separately.
    const confirmed = studentPayments.filter((p) => p.status !== "PENDING");
    const pending = studentPayments.filter((p) => p.status === "PENDING");
    const paid = confirmed.reduce((acc, p) => acc + p.amount, 0);
    const pendingAmount = pending.reduce((acc, p) => acc + p.amount, 0);
    const balance = Math.max(0, amount - paid);
    return {
      studentId: student._id.toString(),
      name: student.name,
      email: decryptField(student.email) || "",
      assignedClass: student.assignedClass || "",
      amount,
      // The portion of `amount` carried over from the previous term's unpaid
      // balance (0 when nothing was carried).
      carryover,
      paid,
      pending: pendingAmount,
      balance,
      feePaid: amount > 0 ? balance <= 0 : !!student.feePaid,
      payments: studentPayments,
    };
  });
}

export async function recordFeePayment({ schoolId, studentId, amount, method, note, status = "CONFIRMED" }) {
  await ready();
  const student = await User.findOne({
    _id: studentId,
    schoolId,
    role: "STUDENT",
  });
  if (!student) return null;
  const school = await School.findById(schoolId);
  const amt = Math.max(0, Number(amount) || 0);
  // Derive the next receipt from the highest existing number, NOT from a count
  // — counts drop on deletion and would collide with the unique index.
  const last = await FeePayment.findOne({ schoolId })
    .sort({ receiptNo: -1 })
    .select("receiptNo");
  const lastNum = last ? parseInt(String(last.receiptNo).replace(/\D/g, ""), 10) || 0 : 0;
  const payment = await FeePayment.create({
    schoolId,
    studentId,
    amount: amt,
    method: method || "CASH",
    receiptNo: `RCT-${Math.max(1001, lastNum + 1)}`,
    // Stamp the payment with the school's CURRENT term so a term rollover
    // archives the right rows and old-term payments never satisfy the new
    // term's ledger.
    session: school?.currentSession || "2025/2026",
    term: school?.currentTerm || "First Term",
    note: note || "",
    status,
  });
  // Sync the legacy feePaid boolean. The ledger only counts CONFIRMED, so a
  // PENDING payment leaves feePaid untouched until the admin confirms it.
  const ledger = await getFeeLedger(schoolId);
  const entry = ledger.find((l) => l.studentId === studentId);
  // By-_id: recordFeePayment is schoolId-scoped and the student came from the
  // school's ledger above.
  await bypassTenantScope(
    User.findByIdAndUpdate(studentId, { feePaid: entry ? entry.balance <= 0 : true })
  );
  return safe(payment);
}

/** Mark a PENDING payment as CONFIRMED and re-sync the student's fee status. */
export async function confirmFeePayment({ schoolId, paymentId }) {
  await ready();
  const payment = await FeePayment.findOneAndUpdate(
    { _id: paymentId, schoolId, status: "PENDING" },
    { status: "CONFIRMED" },
    { new: true }
  );
  if (!payment) return null;
  const ledger = await getFeeLedger(schoolId);
  const entry = ledger.find((l) => l.studentId === payment.studentId.toString());
  // By-_id: the payment was matched with schoolId in the filter above.
  await bypassTenantScope(
    User.findByIdAndUpdate(payment.studentId, {
      feePaid: entry ? entry.balance <= 0 : true,
    })
  );
  return safe(payment);
}

// ---- Attendance -------------------------------------------------------------

export async function getAttendance(schoolId, classArm, date) {
  await ready();
  return safe(
    await Attendance.findOne({ schoolId, classArm, date })
  );
}

export async function saveAttendance(schoolId, classArm, date, records) {
  await ready();
  const school = await School.findById(schoolId);
  return safe(
    await Attendance.findOneAndUpdate(
      { schoolId, classArm, date },
      {
        schoolId,
        classArm,
        date,
        // Stamp the register with the school's CURRENT term — the rollover
        // archives exactly the old term's registers and the new term starts
        // with a clean count.
        session: school?.currentSession || "2025/2026",
        term: school?.currentTerm || "First Term",
        records: records.map((r) => ({
          studentId: r.studentId,
          present: !!r.present,
        })),
      },
      { upsert: true, new: true }
    )
  );
}

export async function getStudentAttendanceSummary(schoolId, studentId) {
  await ready();
  const school = await School.findById(schoolId);
  // Term-scoped: "days present THIS term" must not leak the old term's
  // registers after a rollover (the old term lives in the archive).
  const docs = await Attendance.find({
    schoolId,
    session: school?.currentSession || "2025/2026",
    term: school?.currentTerm || "First Term",
    "records.studentId": studentId,
  });
  let present = 0;
  docs.forEach((a) => {
    const rec = a.records.find((r) => r.studentId.toString() === studentId);
    if (rec?.present) present += 1;
  });
  return { total: docs.length, present, absent: docs.length - present };
}

/**
 * Daily attendance records for a student this term — the parent portal's
 * detailed attendance view. Returns newest-first: [{ date, present }].
 */
export async function getStudentAttendanceRecords(schoolId, studentId) {
  await ready();
  const school = await School.findById(schoolId);
  const docs = await Attendance.find({
    schoolId,
    session: school?.currentSession || "2025/2026",
    term: school?.currentTerm || "First Term",
    "records.studentId": studentId,
  });
  return docs
    .map((a) => {
      const rec = a.records.find((r) => r.studentId.toString() === studentId);
      return { date: a.date, present: !!rec?.present };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}


// ---- Timetable ---------------------------------------------------------------

export async function getTimetable({ schoolId, classArm, day }) {
  await ready();
  const query = { schoolId };
  if (classArm) query.classArm = classArm;
  if (day) query.day = day;
  return (await TimetableEntry.find(query)).map(safe);
}

/**
 * Upsert one slot — one subject per period per class arm. teacherId is a
 * Mongo ObjectId here (unlike the demo store's string ids), and mongoose
 * casts the route-passed id automatically.
 */
export async function saveTimetableEntry({ schoolId, classArm, day, period, subject, teacherId }) {
  await ready();
  const school = await School.findById(schoolId);
  return safe(
    await TimetableEntry.findOneAndUpdate(
      { schoolId, classArm, day, period },
      {
        schoolId,
        classArm,
        day,
        period,
        subject,
        teacherId,
        // Stamp with the school's CURRENT term so the shared grid follows the
        // rollover (and the term field stays honest for the archive).
        session: school?.currentSession || "2025/2026",
        term: school?.currentTerm || "First Term",
      },
      { upsert: true, new: true }
    )
  );
}

export async function deleteTimetableEntry({ schoolId, classArm, day, period }) {
  await ready();
  const res = await TimetableEntry.deleteOne({ schoolId, classArm, day, period });
  return res.deletedCount > 0;
}

/** Double-booking guard — any other slot where the teacher already teaches. */
export async function getTimetableConflict({ schoolId, teacherId, day, period, excludeClassArm }) {
  await ready();
  const query = { schoolId, teacherId, day, period };
  if (excludeClassArm) query.classArm = { $ne: excludeClassArm };
  return safe(await TimetableEntry.findOne(query));
}

// ---- Class alert preferences (per teacher) -----------------------------------

/** One teacher's class-alert preferences (defaults when never set). */
export async function getClassAlertPref(schoolId, userId) {
  await ready();
  const pref = await ClassAlertPref.findOne({ schoolId, userId });
  if (pref) return safe(pref);
  return { schoolId, userId, enabled: false, leadMinutes: 5, soundOn: true };
}

export async function setClassAlertPref(schoolId, userId, patch = {}) {
  await ready();
  const update = {};
  if (patch.enabled !== undefined) update.enabled = patch.enabled === true;
  if (patch.soundOn !== undefined) update.soundOn = patch.soundOn === true;
  if (patch.leadMinutes !== undefined && [0, 5, 10, 15, 30].includes(Number(patch.leadMinutes))) {
    update.leadMinutes = Number(patch.leadMinutes);
  }
  return safe(
    await ClassAlertPref.findOneAndUpdate(
      { schoolId, userId },
      { $set: update },
      { upsert: true, new: true }
    )
  );
}

// ---- Timetable conflict scans (the Overview health metric) -------------------

/** The school's most recent timetable-conflict scan, or null when never run. */
export async function getConflictScan(schoolId) {
  await ready();
  return safe(await ConflictScan.findOne({ schoolId }));
}

export async function saveConflictScan(schoolId, record = {}) {
  await ready();
  return safe(
    await ConflictScan.findOneAndUpdate(
      { schoolId },
      {
        $set: {
          lastRunAt: new Date(record.lastRunAt || Date.now()),
          conflicts: record.conflicts || { teacher: [], arm: [] },
          conflictKeys: record.conflictKeys || [],
          newConflictKeys: record.newConflictKeys || [],
          flaggedSlots: record.flaggedSlots || [],
          history: record.history || [],
        },
      },
      { upsert: true, new: true }
    )
  );
}

// ---- Marketing leads ---------------------------------------------------------

/** Create a lead (demo request or newsletter subscription). Returns null when
 *  the email already exists for that kind (the unique index enforces it). */
export async function createLead({ kind, name = "", school = "", email, phone = "", size = "", interest = "", message = "", ip = "", userAgent = "" }) {
  await ready();
  try {
    const lead = await Lead.create({
      kind,
      name,
      school,
      email: encryptField(email),
      emailIdx: blindEmailIndex(email),
      phone: encryptField(phone),
      size,
      interest,
      message,
      ip,
      userAgent,
    });
    return safe(lead);
  } catch (err) {
    // E11000 duplicate key → already subscribed / already requested
    if (err?.code === 11000) return null;
    throw err;
  }
}

/** Most recent leads first, optionally filtered by kind. */
export async function listLeads(kind) {
  await ready();
  const query = kind ? { kind } : {};
  return (await Lead.find(query).sort({ createdAt: -1 })).map(safe);
}

// ---- Notifications (admin inbox) ----------------------------------------------

// ---- Reminder send batches (idempotency) -------------------------------------

/**
 * Look up a recorded reminder send by its idempotency key (school-scoped).
 * Null when this key has never been sent — the caller may proceed to send.
 */
export async function getReminderBatchByKey(schoolId, kind, key) {
  await ready();
  if (!key) return null;
  const found = await ReminderBatch.findOne({ schoolId, kind, key });
  return safe(found);
}

/**
 * Record a reminder send as a batch. Returns { batch, created }: the NEW
 * record on first save, or the EXISTING batch with created:false when this
 * key was already recorded. The unique (schoolId, kind, key) index makes the
 * insert atomic — a concurrent duplicate gets a duplicate-key error and is
 * served the existing record (never a second record, never a re-send).
 */
export async function saveReminderBatch({ schoolId, kind, key, context = "", studentIds = [], result }) {
  await ready();
  if (!key) return null;
  try {
    const batch = await ReminderBatch.create({
      schoolId,
      kind,
      key,
      context,
      studentIds,
      result,
    });
    return { batch: safe(batch), created: true };
  } catch (err) {
    if (err?.code !== 11000) throw err;
    const existing = await ReminderBatch.findOne({ schoolId, kind, key });
    return { batch: safe(existing), created: false };
  }
}

export async function createNotification({ schoolId, kind, to, subject, preview, body, amount }) {
  await ready();
  // `to` is an array of recipient EMAILS — PII, so encrypt each at rest.
  const encryptedTo = (Array.isArray(to) ? to : []).map((t) => encryptField(t));
  const notification = await Notification.create({
    schoolId,
    kind: kind || "info",
    to: encryptedTo,
    subject,
    preview,
    body: body || "",
    amount: Number.isFinite(Number(amount)) ? Number(amount) : undefined,
  });
  return safe(notification);
}

/**
 * Newest first. Each entry carries the caller's OWN `read` flag — two admins
 * see different read states; readBy (other admins' ids) is stripped.
 *
 * Admin-inbox soft delete + auto-archive: a notification the school admin
 * deleted (adminDeletedAt) or that is older than the school's configured
 * retention is hidden from STAFF views only. options.view === "archived"
 * flips to ONLY the auto-archived history; options.includeDeleted === true
 * keeps soft-deleted rows (the Reconcile & forward flow uses this when the
 * school wants deleted reminders to stay forwardable). A parent's or
 * student's reminder copy must survive — they read the same collection, so
 * the caller's role decides whether any filtering applies at all.
 */
export async function listNotifications(schoolId, userId, options = {}) {
  await ready();
  const viewer = userId ? await findUserById(userId) : null;
  const staffView = STAFF_ROLES.includes(viewer?.role);
  let filter = { schoolId };
  if (staffView) {
    // `adminDeletedAt: null` matches both missing and explicit-null, so the
    // staff filter never hides non-deleted rows (unless includeDeleted — the
    // reconcile flow's opt-in). createdAt is compared to the retention
    // cutoff: inbox = newer rows, archived view = older rows.
    const school = await School.findById(schoolId);
    const days = Math.max(1, Number(school?.notificationRetentionDays) || 90);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    filter = {
      schoolId,
      ...(options.includeDeleted ? {} : { adminDeletedAt: null }),
      ...(options.view === "archived"
        ? { createdAt: { $lt: cutoff } }
        : { createdAt: { $gte: cutoff } }),
    };
  }
  const docs = await Notification.find(filter).sort({ createdAt: -1 });
  return docs.map((d) => {
    const json = d.toJSON();
    delete json.readBy;
    json.read = isReadBy(d, userId);
    json.to = (json.to || []).map((t) => decryptField(t) || t);
    return json;
  });
}

/**
 * Mark a batch as read FOR THE CALLING ADMIN (their id joins readBy — other
 * admins keep their own unread state). Returns the caller's remaining unread
 * count. Legacy school-wide `read: true` documents count as read for everyone
 * (the "*" sentinel) until they're re-marked.
 */
export async function markNotificationsRead(schoolId, userId, ids) {
  await ready();
  const idList = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (idList.length && userId) {
    await Notification.updateMany(
      { schoolId, _id: { $in: idList } },
      { $addToSet: { readBy: userId } }
    );
  }
  // Soft-deleted AND auto-archived rows are gone from the admin's inbox, so
  // neither may count toward the caller's unread total.
  const school = await School.findById(schoolId);
  const days = Math.max(1, Number(school?.notificationRetentionDays) || 90);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const docs = await Notification.find({
    schoolId,
    adminDeletedAt: null,
    createdAt: { $gte: cutoff },
  });
  return docs.filter((d) => !isReadBy(d, userId)).length;
}

// A notification is read for a given admin if their id is in readBy, OR the
// "*" sentinel is (legacy school-wide "read by everyone" state), OR the doc
// still carries the pre-schema-change school-wide `read: true` (Mongo docs
// are not rewritten by a schema change — readBy only). Defined after the
// functions that use it — the const is only read at call time.
const isReadBy = (doc, userId) => {
  const readBy = Array.isArray(doc.readBy) ? doc.readBy : [];
  return (
    readBy.includes(userId) ||
    readBy.includes("*") ||
    doc.read === true
  );
};

/**
 * SOFT delete notifications by id (school-scoped) — the admin inbox cleanup.
 * Each one is stamped adminDeletedAt instead of removed, so the record (and
 * a parent's or student's own reminder copy) survives — only staff inbox
 * views hide it. The query's `adminDeletedAt: null` clause also keeps the
 * operation idempotent: re-deleting an already-hidden id returns zero.
 */
export async function deleteNotifications(schoolId, ids) {
  await ready();
  const idList = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!idList.length) return 0;
  const res = await Notification.updateMany(
    { schoolId, _id: { $in: idList }, adminDeletedAt: null },
    { $set: { adminDeletedAt: new Date() } }
  );
  return res.modifiedCount || 0;
}

/**
 * Mark a batch of notifications as "reconciled" — their fee reminder was
 * forwarded to the student's newly linked parent. Sets reconciledAt so a
 * reminder is never forwarded twice. Returns the count actually marked.
 */
export async function markNotificationsReconciled(schoolId, ids) {
  await ready();
  const idList = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!idList.length) return 0;
  const res = await Notification.updateMany(
    {
      schoolId,
      _id: { $in: idList },
      // Only un-reconciled rows — the $set below would otherwise bump the
      // timestamp on every repeat call.
      $or: [{ reconciledAt: { $exists: false } }, { reconciledAt: null }],
    },
    { $set: { reconciledAt: new Date() } }
  );
  return res.modifiedCount || 0;
}

// ---- Fee audit trail ------------------------------------------------------------

export async function logFeeAudit({
  schoolId,
  action,
  actorId = "",
  actorName,
  actorRole = "",
  studentId = "",
  studentName = "",
  classArm = "",
  receiptNo = "",
  amount = 0,
  method = "",
  note = "",
}) {
  await ready();
  return safe(
    await FeeAudit.create({
      schoolId,
      action,
      actorId,
      actorName: actorName || "Unknown",
      actorRole,
      studentId,
      studentName,
      classArm,
      receiptNo,
      amount: Number(amount) || 0,
      method,
      note: note || "",
    })
  );
}

/** Newest first. */
export async function listFeeAudit(schoolId, { limit = 100 } = {}) {
  await ready();
  return (await FeeAudit.find({ schoolId }).sort({ createdAt: -1 }).limit(limit)).map(safe);
}

// ---- Role audit trail ----------------------------------------------------------

/**
 * Append a role-change audit entry — an immutable "who re-rolled whom, when".
 * The actor is resolved by the caller (the API route) so the store stays a
 * dumb ledger, same as logFeeAudit.
 */
export async function logRoleAudit({
  schoolId,
  actorId = "",
  actorName,
  actorRole = "",
  targetId = "",
  targetName = "",
  fromRole = "",
  toRole,
}) {
  await ready();
  return safe(
    await RoleAudit.create({
      schoolId,
      actorId,
      actorName: actorName || "Unknown",
      actorRole,
      targetId,
      targetName: targetName || "Unknown",
      fromRole,
      toRole,
    })
  );
}

/** Newest first. */
export async function listRoleAudit(schoolId, { limit = 100 } = {}) {
  await ready();
  return (await RoleAudit.find({ schoolId }).sort({ createdAt: -1 }).limit(limit)).map(safe);
}

// ---- Admin digest preferences (per-admin schedule) -----------------------------

/** The digest schedule for ONE admin (default: off). Per-admin, not per-school. */
export async function getDigestPref(schoolId, userId) {
  await ready();
  const pref = await DigestPref.findOne({ schoolId, userId });
  return pref ? safe(pref) : { schoolId, userId, frequency: "off", lastSentAt: null };
}

/** Set one admin's digest frequency: "off" | "daily" | "weekly". */
export async function setDigestPref(schoolId, userId, frequency) {
  await ready();
  const freq = ["off", "daily", "weekly"].includes(frequency) ? frequency : "off";
  return safe(
    await DigestPref.findOneAndUpdate(
      { schoolId, userId },
      { schoolId, userId, frequency: freq },
      { upsert: true, new: true }
    )
  );
}

/** Record a sent digest email and bump the admin's lastSentAt. */
export async function sendDigest({ schoolId, userId, frequency, subject, preview, body, itemCount }) {
  await ready();
  const digest = await Digest.create({
    schoolId,
    userId,
    frequency: frequency === "weekly" ? "weekly" : "daily",
    subject,
    preview,
    body: body || "",
    itemCount: Number(itemCount) || 0,
  });
  await DigestPref.findOneAndUpdate(
    { schoolId, userId },
    { schoolId, userId, lastSentAt: digest.createdAt },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return safe(digest);
}

/** Digest history for one admin, newest first. */
export async function listDigests(schoolId, userId, { limit = 20 } = {}) {
  await ready();
  return (
    await Digest.find({ schoolId, userId }).sort({ createdAt: -1 }).limit(limit)
  ).map(safe);
}
