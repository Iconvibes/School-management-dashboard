/**
 * Mongo store — schools domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  School,
  User,
  Score,
  FeeStructure,
  FeeCarryover,
  Attendance,
  TimetableEntry,
  TermArchive,
  bypassTenantScope,
  blindEmailIndex,
  decryptField,
  encryptField,
  ready,
  safe,
} from "./shared.js";
import { getFeeLedger } from "./fees.js";

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
 * Marker returned by findParentByNameInSchool when MORE THAN ONE parent
 * account in the school matches the typed name (TECH_DEBT L2). The name is a
 * login identifier within a school: findOne() would resolve one arbitrarily
 * and shadow the other — same credentials, wrong account, wrong children.
 * The login route fails closed on this marker and refuses the login.
 * Exported so route code can distinguish "no such parent" from "ambiguous".
 */
export { PARENT_NAME_AMBIGUOUS } from "@/modules/users/markers.js";
import { PARENT_NAME_AMBIGUOUS } from "@/modules/users/markers.js";

/**
 * Find a PARENT by their full name — the name the admin typed when creating
 * or linking them. Case-insensitive (names are plaintext in Mongo; only
 * email/phone are encrypted), tenant-scoped, role-filtered so a student
 * sharing a parent's name can never be found here. Returns the auth shape
 * (password hash included) exactly like findUserByEmailInSchool.
 * Mirrors the demo store's duplicate detection: >1 match returns
 * PARENT_NAME_AMBIGUOUS instead of guessing.
 */
export async function findParentByNameInSchool(schoolId, name) {
  await ready();
  const norm = String(name || "").trim();
  if (!norm) return null;
  const matches = await User.find({
    schoolId,
    role: "PARENT",
    name: { $regex: `^${norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
  })
    .limit(2)
    .toArray();
  if (matches.length > 1) return PARENT_NAME_AMBIGUOUS;
  return matches.length === 1 ? userToLoginShape(matches[0]) : null;
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
  // Mirror the demo store's filter (src/modules/school/store.js): the
  // "EduTrack Platform" pseudo-school is an internal identity/billing shell
  // and must never appear in the public school directory — otherwise the
  // login page offers it as a pickable tenant and platform rows leak into
  // tenant counts built on top of search results.
  const query = {
    isPlatformSchool: { $ne: true },
    // Deliberate (mirrors demo store): pending/frozen/deleted schools stay
    // searchable so their users can pick their school card and read the
    // login route's specific status message.
    ...(q
      ? { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }
      : {}),
  };
  const docs = await School.find(query).limit(limit);
  return docs.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    logoUrl: s.logoUrl || "",
    sealUrl: s.sealUrl || "",
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
