import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import School from "@/models/School";
import User from "@/models/User";
import Score from "@/models/Score";
import FeeStructure from "@/models/FeeStructure";
import FeePayment from "@/models/FeePayment";
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
import { computeGrade } from "@/lib/grading";
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
  let user = await User.findOne({ emailIdx: blindEmailIndex(email) });
  // Same lazy legacy migration as findUserByEmailInSchool (below).
  if (!user) {
    user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            email: encryptField(user.email),
            emailIdx: blindEmailIndex(user.email),
          },
        }
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
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            email: encryptField(user.email),
            emailIdx: blindEmailIndex(user.email),
          },
        }
      );
    }
  }
  return user ? userToLoginShape(user) : null;
}

function userToLoginShape(user) {
  // Plain object INCLUDING password hash + mfaSecret for the auth flows
  // (login verification, MFA challenge). Never serialized directly.
  return {
    id: user._id.toString(),
    name: user.name,
    // Login/MFA need the REAL email (e.g. the otpauth URI label) — decrypt.
    email: decryptField(user.email) || "",
    password: user.password,
    mfaSecret: user.mfaSecret || "",
    role: user.role,
    schoolId: user.schoolId.toString(),
    assignedClass: user.assignedClass,
    payrollStatus: user.payrollStatus,
    feePaid: user.feePaid,
  };
}

/** Auth-data lookup by id (MFA flows hold a userId, not an email). */
export async function findUserByIdWithSecret(id) {
  await ready();
  const user = await User.findById(id);
  return user ? userToLoginShape(user) : null;
}

/**
 * Save a TOTP secret — a dedicated store op so the generic updateUser path
 * can NEVER touch mfaSecret (enrollment is self-service by construction).
 * Returns the safe user shape (secret stripped).
 */
export async function setMfaSecret(id, mfaSecret) {
  await ready();
  return safe(await User.findByIdAndUpdate(id, { mfaSecret }, { new: true }));
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
  const user = await User.findById(id);
  return user ? user.toJSON() : null;
}

/**
 * Lean auth hot-path lookup — role/schoolId/assignedClass/subjects/arms via
 * .select() + .lean() so the per-request revalidation never loads (or
 * decrypts) the PII fields. Every authed request pays for a bare indexed
 * field read instead of an AES-GCM decrypt per request. The teaching arrays
 * ride along because requireClassScope needs them for the subject-specialist
 * scope (they are tiny).
 */
export async function findAuthSnapshot(id) {
  await ready();
  const user = await User.findById(id)
    .select("role schoolId assignedClass subjects assignedClasses")
    .lean();
  if (!user) return null;
  // Legacy migration: a doc written before the subject-teaching model has
  // only assignedClass. Derive the arms array from it (same fallback as the
  // demo store) so the multi-arm scope works without a scripted migration.
  const arms = Array.isArray(user.assignedClasses) && user.assignedClasses.length > 0
    ? user.assignedClasses
    : user.assignedClass
      ? [user.assignedClass]
      : [];
  return {
    id: String(user._id),
    role: user.role,
    schoolId: String(user.schoolId),
    assignedClass: user.assignedClass || "",
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
  const allowed = ["name", "logoUrl", "brandColor", "activeArms", "currentSession", "currentTerm", "onboardingComplete", "periodTimes", "breakTimes", "dailySchedules"];
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

  const counts = {
    scoresArchived: scoreRows,
    attendanceArchived: attendanceRows,
    feesCloned: oldStructures.length,
    timetableCloned: ttEntries,
    studentsReset: studentCount,
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

  return { school: safe(await School.findById(schoolId)), counts };
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
    // Roster snapshot rows are neither scores nor attendance registers —
    // they must not inflate the term/arm counts.
    { $match: { schoolId, kind: { $ne: "student" } } },
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
      groups[key] = { session, term, scoreCount: 0, attendanceCount: 0, arms: {} };
    }
    const g = groups[key];
    if (kind === "score") g.scoreCount += r.n;
    else if (kind === "attendance") g.attendanceCount += r.n;
    if (!g.arms[classArm]) {
      g.arms[classArm] = { classArm, scoreCount: 0, attendanceCount: 0 };
    }
    if (kind === "score") g.arms[classArm].scoreCount += r.n;
    else if (kind === "attendance") g.arms[classArm].attendanceCount += r.n;
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

export async function createUser({ schoolId, name, email, password, role, assignedClass = "", phone = "", subjects = [], assignedClasses = [] }) {
  await ready();
  const user = await User.create({
    name,
    email: encryptField(email),
    emailIdx: blindEmailIndex(email),
    password,
    role,
    schoolId,
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
  });
  return safe(user);
}

/**
 * Change a user's role — a dedicated store op so the generic updateUser path
 * can NEVER touch role (that route forbids it by construction).
 */
export async function updateRole(id, newRole) {
  await ready();
  return safe(await User.findByIdAndUpdate(id, { role: newRole }, { new: true }));
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
  return safe(await User.findByIdAndUpdate(id, update, { new: true }));
}

/** List a parent's linked children (tenant-scoped to the parent's school). */
export async function getChildren(parentId) {
  await ready();
  const parent = await User.findById(parentId);
  if (!parent) return [];
  return (await User.find({ schoolId: parent.schoolId, parentId })).map(safe);
}

export async function deleteUser(id) {
  await ready();
  const res = await User.findByIdAndDelete(id);
  return !!res;
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
      { studentId: row.studentId, subject, classArm },
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

  return {
    totalStudents: students,
    activeTeachers: teachers,
    payrollPaid: paidTeachers,
    payrollPending: teachers - paidTeachers,
    feeCollected: feePaid,
    feeRate: students ? Math.round((feePaid / students) * 100) : 0,
    feeCollectedAmount: totalCollected,
    feeOutstandingAmount: Math.max(0, totalBilled - totalCollected),
    pendingPayments: {
      count: pendingPayments.length,
      amount: pendingPayments.reduce((acc, p) => acc + p.amount, 0),
    },
    classDistribution,
    totalScoreRecords: scoreRecords,
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
  return students.map((student) => {
    const structure = currentStructures.find((f) => f.classArm === student.assignedClass);
    const amount = structure?.amount || 0;
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
  await User.findByIdAndUpdate(studentId, { feePaid: entry ? entry.balance <= 0 : true });
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
  await User.findByIdAndUpdate(payment.studentId, {
    feePaid: entry ? entry.balance <= 0 : true,
  });
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
 */
export async function listNotifications(schoolId, userId) {
  await ready();
  const docs = await Notification.find({ schoolId }).sort({ createdAt: -1 });
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
  const docs = await Notification.find({ schoolId });
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
