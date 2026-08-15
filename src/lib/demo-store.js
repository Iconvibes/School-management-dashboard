import bcrypt from "bcrypt";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  blindEmailIndex,
  blindPhoneIndex,
  decryptField,
  encryptField,
} from "@/lib/field-crypto";
import { DAYS, DEFAULT_PERIOD_TIMES } from "@/lib/timetable";
import { armAlreadyExists } from "@/lib/arms";
import { nameSlug } from "@/lib/passwords";
import { STAFF_ROLES } from "@/lib/permissions";

/**
 * In-memory store used when MONGODB_URI is not set (demo mode).
 * Mirrors the shape returned by the Mongoose store so API routes are identical.
 */

let seq = 100;
const nid = (prefix) => `${prefix}_${++seq}`;

const schools = [];
const users = [];
const scores = [];
const feeStructures = [];
const feePayments = [];
const attendance = [];
const leads = [];
const notifications = [];
const feeAudit = [];
const roleAudit = [];
const digestPrefs = [];
const digests = [];
const timetable = [];
const classAlertPrefs = [];
const conflictScans = [];
// Archived per-term snapshots (scores + attendance) from term rollovers —
// the live tables start fresh each term; this is the durable record of what
// the old term held. Rows are keyed by (schoolId, session, term, kind).
const termArchives = [];
// Unpaid fee balances carried from a previous term into a new one (created at
// term rollover). The carried amount is ADDED to the student's new-term fee:
// ledger billed = structure amount + carryover. Keyed by (schoolId, studentId,
// session, term).
const feeCarryovers = [];
// Recorded fee-reminder sends — the idempotency record that makes a retry or
// a double rollover incapable of notifying the same parent twice. Keyed by
// (schoolId, kind, key): manual sends use a client batchId, rollover sends a
// deterministic "rollover:<session>:<term>" key.
const reminderBatches = [];
let receiptSeq = 1000;

// Cost 4 instead of production's 10: this is the in-memory DEMO store, and
// bcrypt.cost is only in the stored hash — login verification via bcrypt.compare
// works regardless. It keeps demo imports of ~1000 accounts snappy (the
// sync hash here is a few ms at cost 4; production uses async cost-10
// compares, which run on libuv threads off the main thread).
const hash = (pw) => bcrypt.hashSync(pw, 4);

const nowIso = () => new Date().toISOString();

// ---- Disk persistence (demo mode) -------------------------------------------
//
// The demo store is in-memory, so a dev-server restart used to wipe every
// imported or created account. When MONGODB_URI is unset we now snapshot the
// whole state to a JSON file (`.demo-data/store.json` by default) after every
// mutation, and restore it on boot — long-running demos keep their students
// (and the 900-student sample roster) across restarts.
//
// Design notes:
//  - Writes are debounced (one timer), so a 900-row bulk import coalesces
//    into a SINGLE disk write instead of 900.
//  - The snapshot is written to a temp file then renamed — atomic, so a crash
//    mid-write can never leave a torn file behind. A missing or corrupt file
//    simply falls back to a fresh seed.
//  - Passwords are stored as bcrypt hashes only — plaintext never touches
//    disk. The file is gitignored.
//  - PII (email, phone) is encrypted at rest: dump() writes enc:v1 envelopes
//    plus blind indexes and restore() decrypts them back to plaintext in
//    memory — the SNAPSHOT holds ciphertext, mirroring the Mongo store's
//    on-disk documents. Legacy plaintext snapshots load unchanged and
//    upgrade themselves on the next save.
//  - Under `node --test` (NODE_TEST_CONTEXT=child-v8) the file is redirected
//    to a per-process temp path, so the test suite never writes to (or wipes)
//    a real demo's state.

const STORE_VERSION = 1;
const DEFAULT_STORE_FILE = path.join(process.cwd(), ".demo-data", "store.json");

const isTestRun = () => !!process.env.NODE_TEST_CONTEXT;
let storeFile =
  process.env.DEMO_STORE_FILE ||
  (isTestRun()
    ? path.join(os.tmpdir(), `edutrack-demo-${process.pid}.json`)
    : DEFAULT_STORE_FILE);

let persistTimer = null;
let persistDirty = false;

/**
 * Snapshot the whole in-memory state — with PII ENCRYPTED at rest.
 *
 * Returns COPIES (never mutates the live arrays): users' and leads' email /
 * phone become enc:v1 envelopes plus their blind indexes, and notifications'
 * `to` arrays (recipient emails) are encrypted element-wise — exactly the
 * on-disk shape of the Mongo store's documents. Legacy plaintext values are
 * re-encrypted on every write, so an old snapshot upgrades itself.
 */
function dump() {
  const encryptUser = (u) => ({
    ...u,
    email: encryptField(u.email),
    emailIdx: u.emailIdx || blindEmailIndex(u.email),
    phone: encryptField(u.phone),
    phoneIdx: u.phoneIdx || blindPhoneIndex(u.phone),
  });
  const encryptLead = (l) => ({
    ...l,
    email: encryptField(l.email),
    emailIdx: l.emailIdx || blindEmailIndex(l.email),
    phone: encryptField(l.phone),
  });
  const encryptNotification = (n) => ({
    ...n,
    to: Array.isArray(n.to) ? n.to.map((t) => encryptField(t)) : n.to,
  });
  return {
    version: STORE_VERSION,
    seq,
    receiptSeq,
    schools,
    users: users.map(encryptUser),
    scores,
    feeStructures,
    feePayments,
    feeCarryovers,
    reminderBatches,
    attendance,
    leads: leads.map(encryptLead),
    notifications: notifications.map(encryptNotification),
    feeAudit,
    roleAudit,
    digestPrefs,
    digests,
    timetable,
    classAlertPrefs,
    conflictScans,
    termArchives,
  };
}

/** Replace in-memory state from a snapshot. Returns false if it's unusable. */
function restore(data) {
  if (!data || data.version !== STORE_VERSION) return false;
  const collections = [
    "schools",
    "users",
    "scores",
    "feeStructures",
    "feePayments",
    "feeCarryovers",
    "reminderBatches",
    "attendance",
    "leads",
    "notifications",
    "feeAudit",
    "roleAudit",
    "digestPrefs",
    "digests",
    "timetable",
    "classAlertPrefs",
    "conflictScans",
    "termArchives",
  ];
  for (const key of collections) {
    // Backward-compatible restore: snapshots written before a collection
    // existed (e.g. notifications) load as empty rather than failing the
    // whole file and silently re-seeding the demo.
    if (data[key] === undefined) data[key] = [];
    if (!Array.isArray(data[key])) return false;
  }
  seq = Number.isInteger(data.seq) ? data.seq : 100;
  receiptSeq = Number.isInteger(data.receiptSeq) ? data.receiptSeq : 1000;
  schools.length = 0;
  schools.push(...data.schools);
  // Legacy migration: snapshots written before the onboarding flag existed
  // carry no onboardingComplete. Pre-flag demo schools were the fully
  // configured seed (by far the common case), so default them to complete —
  // the wizard must not suddenly reappear for an already-set-up demo.
  schools.forEach((s) => {
    if (s.onboardingComplete === undefined) s.onboardingComplete = true;
  });
  users.length = 0;
  // Restore decrypts PII back to plaintext for memory (the snapshot holds
  // ciphertext). Legacy plaintext passes through untouched (decryptField's
  // passthrough), and missing blind indexes are recomputed — so a snapshot
  // written before encryption still loads and upgrades on the next save.
  users.push(
    ...data.users.map((u) => {
      const copy = { ...u };
      copy.email = decryptField(u.email) ?? u.email ?? "";
      copy.phone = decryptField(u.phone) ?? u.phone ?? "";
      copy.emailIdx = u.emailIdx || blindEmailIndex(copy.email);
      copy.phoneIdx = u.phoneIdx || blindPhoneIndex(copy.phone);
      // Legacy migration: snapshots written before subject-teaching model a
      // teacher with ONLY assignedClass. Derive assignedClasses from it so
      // the multi-arm scope works — same fallback as the Mongo store.
      if (
        copy.role === "TEACHER" &&
        (!Array.isArray(copy.assignedClasses) || copy.assignedClasses.length === 0) &&
        copy.assignedClass
      ) {
        copy.assignedClasses = [copy.assignedClass];
      }
      if (!Array.isArray(copy.subjects)) copy.subjects = [];
      if (!Array.isArray(copy.assignedClasses)) copy.assignedClasses = [];
      return copy;
    })
  );
  scores.length = 0;
  scores.push(...data.scores);
  feeStructures.length = 0;
  feeStructures.push(...data.feeStructures);
  feePayments.length = 0;
  feePayments.push(...data.feePayments);
  feeCarryovers.length = 0;
  // Backward-compatible: snapshots written before carryover existed load with
  // none (an old snapshot simply had no carried balances to restore).
  feeCarryovers.push(...(data.feeCarryovers || []));
  reminderBatches.length = 0;
  // Same backward-compat: old snapshots have no batch records — fine, sends
  // before this feature simply have no idempotency record to replay.
  reminderBatches.push(...(data.reminderBatches || []));
  attendance.length = 0;
  attendance.push(...data.attendance);
  leads.length = 0;
  leads.push(
    ...data.leads.map((l) => {
      const copy = { ...l };
      copy.email = decryptField(l.email) ?? l.email ?? "";
      copy.phone = decryptField(l.phone) ?? l.phone ?? "";
      copy.emailIdx = l.emailIdx || blindEmailIndex(copy.email);
      return copy;
    })
  );
  notifications.length = 0;
  notifications.push(
    ...(data.notifications || []).map((n) => {
      const copy = { ...n };
      // Decrypt recipient emails back to plaintext for the inbox.
      if (Array.isArray(copy.to)) copy.to = copy.to.map((t) => decryptField(t) ?? t);
      // Legacy migration: snapshots written before per-admin read-state stored
      // a school-wide `read` boolean. `read: true` meant every admin had seen
      // it — represent that as the "*" sentinel in readBy.
      if (copy.read === true && !Array.isArray(copy.readBy)) copy.readBy = ["*"];
      delete copy.read;
      return copy;
    })
  );
  feeAudit.length = 0;
  feeAudit.push(...data.feeAudit);
  roleAudit.length = 0;
  roleAudit.push(...(data.roleAudit || []));
  digestPrefs.length = 0;
  digestPrefs.push(...(data.digestPrefs || []));
  digests.length = 0;
  digests.push(...(data.digests || []));
  timetable.length = 0;
  timetable.push(...(data.timetable || []));
  classAlertPrefs.length = 0;
  classAlertPrefs.push(...(data.classAlertPrefs || []));
  conflictScans.length = 0;
  conflictScans.push(...(data.conflictScans || []));
  termArchives.length = 0;
  termArchives.push(...(data.termArchives || []));
  return true;
}

/** Atomic write: temp file + rename. Never throws — demo runs on read-only FS too. */
function writeSnapshot() {
  try {
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    const tmp = `${storeFile}.tmp`;
    // Compact JSON — this file is machine-read, never human-edited, and a
    // 900-student state (with attendance records) stays small and fast.
    fs.writeFileSync(tmp, JSON.stringify(dump()));
    fs.renameSync(tmp, storeFile);
  } catch {
    // Not writable (CI, read-only FS) — demo keeps working in memory.
  }
}

/** Debounced save-after-mutation. */
function persist() {
  persistDirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!persistDirty) return;
    persistDirty = false;
    writeSnapshot();
  }, 100);
}

function loadPersisted() {
  try {
    if (!fs.existsSync(storeFile)) return false;
    const data = JSON.parse(fs.readFileSync(storeFile, "utf8"));
    return restore(data);
  } catch {
    return false;
  }
}

// ---- Seed data -------------------------------------------------------------

function seed() {
  const school = {
    id: nid("sch"),
    name: "Greenfield International School",
    logoUrl: "",
    sealUrl: "",
    brandColor: "#2563EB",
    notificationRetentionDays: 90,
    reconcileDeletedReminders: false,
    // "active" | "frozen" — a frozen school blocks every non-super-admin
    // login while keeping all data (see setSchoolStatus).
    status: "active",
    // The REAL Nigerian secondary structure: JSS1–JSS3 are plain classes
    // (no Science/Arts/Commercial streams — streaming starts at SSS), and
    // only SS1–SS3 split into the three streams — 12 class arms in total.
    activeArms: [
      "JSS1", "JSS2", "JSS3",
      "SS1 Science", "SS1 Arts", "SS1 Commercial",
      "SS2 Science", "SS2 Arts", "SS2 Commercial",
      "SS3 Science", "SS3 Arts", "SS3 Commercial",
    ],
    currentSession: "2025/2026",
    currentTerm: "First Term",
    // The demo school's bell schedule — drives the class-alert alarms. A
    // school without one falls back to the same defaults.
    periodTimes: DEFAULT_PERIOD_TIMES.map((p) => ({ ...p })),
    // The demo school is already fully set up — the onboarding wizard must
    // never appear for it.
    onboardingComplete: true,
    createdAt: nowIso(),
  };
  schools.push(school);

  const addUser = (
    name,
    email,
    password,
    role,
    assignedClass = "",
    extra = {}
  ) => {
    const u = {
      id: nid("usr"),
      name,
      email,
      // Blind indexes — in-memory lookups (login, dedupe) match on these,
      // exactly like the Mongo store. Stripped from every public shape.
      emailIdx: blindEmailIndex(email),
      password: hash(password),
      role,
      schoolId: school.id,
      assignedClass,
      payrollStatus: "PENDING",
      feePaid: false,
      parentId: null,
      phone: "",
      phoneIdx: "",
      address: "",
      createdAt: nowIso(),
      ...extra,
    };
    if (u.phone) u.phoneIdx = blindPhoneIndex(u.phone);
    users.push(u);
    return u;
  };

  const admin = addUser(
    "Super Admin",
    "admin@edutrack.app",
    "admin123",
    "SUPER_ADMIN",
    "",
    { payrollStatus: "PAID" }
  );

  // Staff roles below the Super Admin — Bursar (fees) and Registrar (roster).
  // The demo credentials live on the login page (DEMO_CREDENTIALS).
  addUser("Mrs. Chioma Eze", "bursar@edutrack.app", "bursar123", "BURSAR", "", {
    phone: "0802 555 0142",
  });
  addUser("Mr. Adewale Ojo", "registrar@edutrack.app", "registrar123", "REGISTRAR", "", {
    phone: "0802 555 0187",
  });

  // Subject-specialist teachers — the real Nigerian secondary-school model.
  // JSS1–JSS3 are PLAIN classes (no streams); streaming starts at SSS, so
  // only SS arms split into Science / Arts / Commercial. The headline case is
  // real: ONE English teacher (Mrs. Bakare) and ONE Mathematics teacher
  // (Mrs. Okafor) teach their subject to JSS1–JSS3 AND every SS stream.
  // JSS runs the junior curriculum (Basic Science, Basic Technology, Social
  // Studies, Business Studies, Computer Studies, Agricultural Science — some
  // taught by the same specialist who takes the related SSS subject, e.g.
  // Mr. Okonkwo teaches Basic Science in JSS and Biology in SS Science).
  // Stream specialists cover ONLY the SS arms of their stream. `assignedClass`
  // stays the display/default arm; `subjects` × `assignedClasses` is the
  // enforceable scope (requireClassScope).
  const JSS_ARMS = ["JSS1", "JSS2", "JSS3"];
  const STREAMS = ["Science", "Arts", "Commercial"];
  const SS_NAMES = ["SS1", "SS2", "SS3"];
  const SS_ARMS = SS_NAMES.flatMap((c) => STREAMS.map((s) => `${c} ${s}`));
  const ALL_ARMS = [...JSS_ARMS, ...SS_ARMS];
  const SS_SCIENCE_ARMS = SS_NAMES.map((c) => `${c} Science`);
  const SS_ARTS_ARMS = SS_NAMES.map((c) => `${c} Arts`);
  const SS_COMMERCIAL_ARMS = SS_NAMES.map((c) => `${c} Commercial`);
  const teachers = [
    addUser("Mrs. Adaeze Okafor", "a.okafor@edutrack.app", "teacher123", "TEACHER", "SS1 Science", {
      payrollStatus: "PAID",
      subjects: ["Mathematics"],
      assignedClasses: ALL_ARMS,
    }),
    addUser("Mr. Tunde Bakare", "t.bakare@edutrack.app", "teacher123", "TEACHER", "SS1 Arts", {
      payrollStatus: "PENDING",
      subjects: ["English Language"],
      assignedClasses: ALL_ARMS,
    }),
    addUser("Ms. Bisi Fagbemi", "b.fagbemi@edutrack.app", "teacher123", "TEACHER", "JSS1", {
      payrollStatus: "PENDING",
      subjects: ["Civic Education"],
      assignedClasses: ALL_ARMS,
    }),
    addUser("Dr. Ifeoma Nwosu", "i.nwosu@edutrack.app", "teacher123", "TEACHER", "SS2 Science", {
      payrollStatus: "PAID",
      subjects: ["Physics"],
      assignedClasses: SS_SCIENCE_ARMS,
    }),
    addUser("Mr. Emeka Obi", "e.obi@edutrack.app", "teacher123", "TEACHER", "SS2 Science", {
      payrollStatus: "PENDING",
      subjects: ["Chemistry"],
      assignedClasses: SS_SCIENCE_ARMS,
    }),
    // Basic Science (JSS) + Biology (SS Science) — one life-sciences teacher.
    addUser("Mr. Chidi Okonkwo", "c.okonkwo@edutrack.app", "teacher123", "TEACHER", "JSS1", {
      payrollStatus: "PENDING",
      subjects: ["Basic Science", "Biology"],
      assignedClasses: [...JSS_ARMS, ...SS_SCIENCE_ARMS],
    }),
    // Agricultural Science — taught in JSS and SS Science.
    addUser("Mr. Bello Yusuf", "b.yusuf@edutrack.app", "teacher123", "TEACHER", "JSS1", {
      payrollStatus: "PENDING",
      subjects: ["Agricultural Science"],
      assignedClasses: [...JSS_ARMS, ...SS_SCIENCE_ARMS],
    }),
    addUser("Ms. Sarah Adeyemi", "s.adeyemi@edutrack.app", "teacher123", "TEACHER", "SS3 Science", {
      payrollStatus: "PENDING",
      subjects: ["Literature in English"],
      assignedClasses: SS_ARTS_ARMS,
    }),
    // Social Studies (JSS) + Government (SS Arts) — one humanities teacher.
    addUser("Mrs. Amina Suleiman", "a.suleiman@edutrack.app", "teacher123", "TEACHER", "JSS1", {
      payrollStatus: "PENDING",
      subjects: ["Social Studies", "Government"],
      assignedClasses: [...JSS_ARMS, ...SS_ARTS_ARMS],
    }),
    addUser("Mr. Emeka Anya", "e.anya@edutrack.app", "teacher123", "TEACHER", "SS1 Arts", {
      payrollStatus: "PENDING",
      subjects: ["French"],
      assignedClasses: SS_ARTS_ARMS,
    }),
    addUser("Mrs. Ngozi Eze", "n.eze@edutrack.app", "teacher123", "TEACHER", "SS1 Commercial", {
      payrollStatus: "PENDING",
      subjects: ["Economics"],
      assignedClasses: [...SS_ARTS_ARMS, ...SS_COMMERCIAL_ARMS],
    }),
    addUser("Ms. Kemi Adeleke", "k.adeleke@edutrack.app", "teacher123", "TEACHER", "SS1 Commercial", {
      payrollStatus: "PENDING",
      subjects: ["Accounting"],
      assignedClasses: SS_COMMERCIAL_ARMS,
    }),
    addUser("Mr. Femi Balogun", "f.balogun@edutrack.app", "teacher123", "TEACHER", "SS2 Commercial", {
      payrollStatus: "PENDING",
      subjects: ["Commerce"],
      assignedClasses: SS_COMMERCIAL_ARMS,
    }),
    // Business Studies — a JSS junior subject AND an SS Commercial one.
    addUser("Mrs. Hauwa Danjuma", "h.danjuma@edutrack.app", "teacher123", "TEACHER", "JSS1", {
      payrollStatus: "PENDING",
      subjects: ["Business Studies"],
      assignedClasses: [...JSS_ARMS, ...SS_COMMERCIAL_ARMS],
    }),
    addUser("Mr. Segun Adewale", "s.adewale@edutrack.app", "teacher123", "TEACHER", "JSS1", {
      payrollStatus: "PENDING",
      subjects: ["Basic Technology"],
      assignedClasses: JSS_ARMS,
    }),
    addUser("Ms. Chiamaka Nnadi", "c.nnadi@edutrack.app", "teacher123", "TEACHER", "JSS1", {
      payrollStatus: "PENDING",
      subjects: ["Computer Studies"],
      assignedClasses: JSS_ARMS,
    }),
  ];

  const studentSeeds = [
    // SS1–SS3 students (first two stay index 0/1 — the parent demo links them).
    ["Kunle Adebayo", "k.adebayo@edutrack.app", "SS1 Science"],
    ["Chidinma Obi", "c.obi@edutrack.app", "SS1 Science"],
    ["Emeka Nwosu", "e.nwosu@edutrack.app", "SS1 Science"],
    ["Fatima Bello", "f.bello@edutrack.app", "SS1 Science"],
    ["Ibrahim Musa", "i.musa@edutrack.app", "SS1 Arts"],
    ["Sarah Johnson", "s.johnson@edutrack.app", "SS1 Arts"],
    ["Tobi Alade", "t.alade@edutrack.app", "SS1 Arts"],
    ["Grace Uche", "g.uche@edutrack.app", "SS2 Science"],
    ["David Osei", "d.osei@edutrack.app", "SS2 Science"],
    ["Hannah Kalu", "h.kalu@edutrack.app", "SS3 Arts"],
    // JSS1–JSS3 — plain classes, no streams.
    ["Adebisi Ajayi", "a.ajayi@edutrack.app", "JSS1"],
    ["Musa Sule", "m.sule@edutrack.app", "JSS1"],
    ["Ngozi Okafor", "n.okafor@edutrack.app", "JSS2"],
    ["Tunde Adebisi", "t.adebisi@edutrack.app", "JSS2"],
    ["Halima Yusuf", "h.yusuf@edutrack.app", "JSS3"],
    ["Chinedu Eze", "c.eze@edutrack.app", "JSS3"],
  ];

  const students = studentSeeds.map(([name, email, arm], i) =>
    addUser(name, email, "student123", "STUDENT", arm, {
      feePaid: i % 3 !== 0,
    })
  );

  // Seed one parent account linked to two children (demo)
  const parent = addUser(
    "Mrs. Folake Adebayo",
    "p.adebayo@edutrack.app",
    "parent123",
    "PARENT",
    "",
    { phone: "0803 123 4567", address: "12 Ikoyi Crescent, Lagos" }
  );
  students[0].parentId = parent.id; // Kunle Adebayo
  students[1].parentId = parent.id; // Chidinma Obi

  // ---- Seed fee structures + payments (demo) ----
  const feeByArm = {
    // JSS — plain classes, junior fees.
    "JSS1": 90000,
    "JSS2": 95000,
    "JSS3": 100000,
    // SSS — streamed, senior fees.
    "SS1 Science": 185000,
    "SS1 Arts": 170000,
    "SS1 Commercial": 165000,
    "SS2 Science": 185000,
    "SS2 Arts": 170000,
    "SS2 Commercial": 165000,
    "SS3 Science": 190000,
    "SS3 Arts": 175000,
    "SS3 Commercial": 170000,
  };
  Object.entries(feeByArm).forEach(([classArm, amount]) => {
    feeStructures.push({
      id: nid("fst"),
      schoolId: school.id,
      classArm,
      amount,
      session: "2025/2026",
      term: "First Term",
      createdAt: nowIso(),
    });
  });
  students.forEach((student, i) => {
    const amount = feeByArm[student.assignedClass] || 150000;
    const paidFull = i % 3 !== 0;
    const paid = paidFull ? amount : Math.round(amount * 0.4);
    if (paid > 0) {
      feePayments.push({
        id: nid("fpay"),
        schoolId: school.id,
        studentId: student.id,
        amount: paid,
        method: "TRANSFER",
        receiptNo: `RCT-${++receiptSeq}`,
        session: "2025/2026",
        term: "First Term",
        note: paidFull ? "Full term fee" : "Part payment",
        createdAt: nowIso(),
      });
      // sync the legacy boolean so the rest of the UI stays consistent
      student.feePaid = paidFull;
    }
  });

  // ---- Seed attendance (demo): last 20 school days, ~85% presence ----
  const SCHOOL_DAYS = 20;
  for (let d = SCHOOL_DAYS; d >= 1; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    ALL_ARMS.forEach((arm) => {
      const armStudents = students.filter((s) => s.assignedClass === arm);
      if (armStudents.length === 0) return;
      attendance.push({
        id: nid("att"),
        schoolId: school.id,
        classArm: arm,
        date,
        session: "2025/2026",
        term: "First Term",
        records: armStudents.map((s, i) => ({
          studentId: s.id,
          present: (i + d) % 9 !== 0, // ~11% absence
        })),
        createdAt: nowIso(),
      });
    });
  }

  // Deterministic-ish score seeds so every dashboard has content
  const subjectSets = {
    // JSS — the junior curriculum (plain classes).
    "JSS1": [
      ["Mathematics", 34, 52],
      ["English Language", 33, 50],
      ["Basic Science", 30, 44],
      ["Social Studies", 29, 42],
      ["Business Studies", 28, 40],
    ],
    "JSS2": [
      ["Mathematics", 30, 46],
      ["English Language", 31, 45],
      ["Basic Technology", 27, 39],
      ["Computer Studies", 26, 38],
      ["Civic Education", 29, 43],
    ],
    "JSS3": [
      ["Mathematics", 32, 48],
      ["English Language", 30, 44],
      ["Agricultural Science", 28, 41],
      ["Social Studies", 27, 40],
      ["Business Studies", 29, 42],
    ],
    "SS1 Science": [
      ["Mathematics", 34, 52],
      ["Physics", 30, 44],
      ["Chemistry", 28, 40],
      ["Biology", 36, 50],
      ["English Language", 32, 47],
    ],
    "SS1 Arts": [
      ["Literature in English", 33, 48],
      ["Government", 31, 45],
      ["Economics", 29, 42],
      ["English Language", 35, 51],
    ],
    "SS2 Science": [
      ["Mathematics", 26, 38],
      ["Physics", 24, 35],
      ["Chemistry", 27, 41],
      ["Further Mathematics", 22, 33],
    ],
    "SS3 Arts": [
      ["Literature in English", 30, 44],
      ["Government", 28, 39],
      ["Economics", 26, 37],
    ],
  };

  const offsets = [0, 3, -4, 2, -2, 5, -6, 1, -3, 4];

  students.forEach((student, i) => {
    const sets = subjectSets[student.assignedClass] || [];
    sets.forEach(([subject, ca, exam]) => {
      const off = offsets[i % offsets.length];
      const caScore = Math.min(40, Math.max(5, ca + off));
      const examScore = Math.min(60, Math.max(10, exam - off));
      const totalScore = caScore + examScore;
      const grade = totalScore >= 70 ? "A" : totalScore >= 60 ? "B" : totalScore >= 50 ? "C" : totalScore >= 40 ? "D" : "F";
      scores.push({
        id: nid("scr"),
        studentId: student.id,
        schoolId: school.id,
        subject,
        classArm: student.assignedClass,
        caScore,
        examScore,
        totalScore,
        grade,
        createdAt: nowIso(),
      });
    });
  });

  // ---- Seed weekly timetable (demo): the SUPER_ADMIN-set schedule. ----
  //
  // At full JSS1–JSS3 (plain classes) + SS1–SS3 × Science/Arts/Commercial
  // scale (12 arms) the schedule is GENERATED rather than hand-tuned, so the
  // one-English-teacher-across-every-class reality actually fits. Construction:
  //
  //   • Every arm gets a 20-slot week. The school-wide trio — Mathematics,
  //     English Language and Civic Education (2 slots each, taught by Okafor,
  //     Bakare and Fagbemi) — appears in EVERY arm, JSS or SS. On top of that:
  //       – JSS arms run the JUNIOR curriculum (Basic Science, Social Studies,
  //         Business Studies, Basic Technology, Computer Studies, Agricultural
  //         Science), taught by the JSS specialists.
  //       – SS arms run their stream's specialist subjects (Physics /
  //         Chemistry / Biology / Agricultural Science for science arms;
  //         Literature / Government / French for arts; Accounting / Commerce /
  //         Business Studies for commercial; Economics serves arts + commercial).
  //   • School-wide subjects stagger across arm groups via a five-pattern
  //     day rotation (armIdx % 5) so no teacher is ever booked more than 8
  //     times in a day (there are 8 periods). Economics uses its own three-
  //     pattern stagger; stream specialists teach fixed weekdays and top
  //     out at 6 arms a day.
  //   • Periods are assigned by KÖNIG'S EDGE-COLORING ALGORITHM — the
  //     provably-correct way to color a bipartite graph (teachers × arms)
  //     with Δ colors, here Δ = 8 = the number of periods. Every teacher has
  //     ≤ 8 slots a day and every arm ≤ 6, so a conflict-free assignment
  //     ALWAYS exists; the greedy lowest-free heuristic can wedge (a
  //     full-load teacher's last booking finding its only free period
  //     blocked), König's alternating-path recoloring cannot.
  //   • The whole grid is then VERIFIED: a single double-booked teacher or
  //     arm (or a per-teacher day load over 8) throws at seed time, so a
  //     future edit can never ship a broken schedule silently. The API's
  //     double-booking guard enforces the same rule on live edits.
  const DAY_LIST = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  // 2-day school-wide rotations (armIdx % 5) — each teacher peaks at 8/day.
  const CORE_DAY_PATTERNS = [
    ["Monday", "Tuesday"],
    ["Wednesday", "Thursday"],
    ["Friday", "Monday"],
    ["Tuesday", "Wednesday"],
    ["Thursday", "Friday"],
  ];
  // 3-day Economics rotations (econ-arm index % 3) — peaks at 8/day.
  const ECON_DAY_PATTERNS = [
    ["Monday", "Wednesday", "Friday"],
    ["Monday", "Tuesday", "Thursday"],
    ["Tuesday", "Wednesday", "Friday"],
  ];
  // Stream specialists: fixed weekdays for every arm in the stream.
  const STREAM_SUBJECT_DAYS = {
    Science: [
      ["Physics", ["Monday", "Tuesday", "Wednesday", "Friday"]],
      ["Chemistry", ["Monday", "Tuesday", "Wednesday", "Friday"]],
      ["Biology", ["Monday", "Wednesday", "Thursday", "Friday"]],
      ["Agricultural Science", ["Wednesday", "Friday"]],
    ],
    Arts: [
      ["Literature in English", ["Monday", "Tuesday", "Wednesday", "Friday"]],
      ["Government", ["Monday", "Tuesday", "Wednesday", "Friday"]],
      ["French", ["Monday", "Wednesday", "Thursday"]],
    ],
    Commercial: [
      ["Accounting", ["Monday", "Tuesday", "Wednesday", "Friday"]],
      ["Commerce", ["Monday", "Tuesday", "Wednesday", "Friday"]],
      ["Business Studies", ["Monday", "Wednesday", "Thursday"]],
    ],
  };

  const teacherFor = (arm, subject) =>
    teachers.find(
      (t) =>
        t.subjects?.includes(subject) && t.assignedClasses?.includes(arm)
    )?.id || "";

  // JSS junior curriculum — JSS1–JSS3 are PLAIN classes (no streams), so each
  // gets the junior subjects across the week: three 4-slot subjects + one
  // 2-slot extra = 14 slots, completing the 20-slot week on top of the 6 core
  // slots (Mathematics / English Language / Civic Education).
  const JSS_SUBJECTS = [
    // JSS1 — Basic Science, Social Studies, Business Studies + Agricultural Science.
    [
      ["Basic Science", ["Monday", "Tuesday", "Wednesday", "Thursday"]],
      ["Social Studies", ["Monday", "Tuesday", "Thursday", "Friday"]],
      ["Business Studies", ["Tuesday", "Wednesday", "Thursday", "Friday"]],
      ["Agricultural Science", ["Wednesday", "Friday"]],
    ],
    // JSS2 — Basic Technology, Computer Studies, Social Studies + Civic Education.
    // (Civic's extra days avoid the core Civic days [Mon, Tue] so the same
    // teacher never holds two slots in the same arm on the same day — the
    // bipartite edge-coloring assumes one slot per teacher-arm-day.)
    [
      ["Basic Technology", ["Monday", "Tuesday", "Wednesday", "Thursday"]],
      ["Computer Studies", ["Monday", "Wednesday", "Thursday", "Friday"]],
      ["Social Studies", ["Monday", "Tuesday", "Thursday", "Friday"]],
      ["Civic Education", ["Wednesday", "Friday"]],
    ],
    // JSS3 — Agricultural Science, Social Studies, Business Studies + Basic Science.
    [
      ["Agricultural Science", ["Monday", "Tuesday", "Wednesday", "Thursday"]],
      ["Social Studies", ["Monday", "Tuesday", "Thursday", "Friday"]],
      ["Business Studies", ["Tuesday", "Wednesday", "Thursday", "Friday"]],
      ["Basic Science", ["Wednesday", "Friday"]],
    ],
  ];

  // Per-arm weekly plan: day → subjects in a deterministic order. Core
  // subjects come FIRST so a full-load teacher always finds a free period.
  const weeklyPlans = ALL_ARMS.map((arm, armIdx) => {
    const plan = {};
    const add = (subject, days) => {
      days.forEach((d) => {
        if (!plan[d]) plan[d] = [];
        plan[d].push(subject);
      });
    };
    add("Mathematics", CORE_DAY_PATTERNS[armIdx % 5]);
    add("English Language", CORE_DAY_PATTERNS[(armIdx + 2) % 5]);
    add("Civic Education", CORE_DAY_PATTERNS[(armIdx + 4) % 5]);
    if (armIdx < JSS_ARMS.length) {
      // JSS1–JSS3 — plain classes running the junior curriculum.
      JSS_SUBJECTS[armIdx].forEach(([subject, days]) => add(subject, days));
    } else {
      // SS arms — streamed. Add the stream's specialists; Economics serves
      // the arts + commercial arms on its own stagger.
      const stream = arm.split(" ")[1];
      if (stream !== "Science") {
        add("Economics", ECON_DAY_PATTERNS[armIdx % 3]);
      }
      STREAM_SUBJECT_DAYS[stream].forEach(([subject, days]) => add(subject, days));
    }
    return plan;
  });

  // ---- Period assignment: König's bipartite edge-coloring --------------
  //
  // The schedule is a bipartite graph: teachers on one side, arms on the
  // other, one edge per slot (a teacher never has two slots in the same arm
  // on the same day). Edge-coloring = assigning each edge a period so no
  // two edges sharing a vertex share a period — exactly the no-double-
  // booking rule. With max degree Δ ≤ 8 (8 periods), a coloring always
  // exists. The greedy "lowest free period" can fail; König's algorithm
  // walks an alternating path and swaps colors, which is provably
  // successful. Deterministic: slots are processed in a fixed order.
  function colorDay(edges) {
    // edges: [{ teacher, arm }] — returns { "teacher|arm": period }
    //
    // `incident` is the SINGLE source of truth: "vertex|period" -> edge key.
    // mex() reads it directly (8 periods, so O(8) per lookup), which keeps
    // the ≤1-edge-per-color invariant trivially consistent — no parallel
    // color sets to drift. Two subtleties that naive implementations miss:
    //
    //  1. When an alternating path passes through a vertex TWICE (an
    //     alternating cycle), recoloring must not delete the other edge's
    //     entry: a path edge's OLD color equals its neighbour's NEW color at
    //     the shared vertex, so deletes are guarded with `=== key`.
    //  2. The path walk can enter an alternating cycle; a visited set clips
    //     it. The clipped path still recolors validly (the re-entered vertex
    //     has two path edges swapped in opposite directions, netting to zero).
    const colorOf = {}; // "teacher|arm" -> period
    const incident = {}; // "vertex|period" -> "teacher|arm"
    const vertexHas = (vertex, period) => !!incident[`${vertex}|${period}`];
    const mex = (vertex) => {
      let c = 1;
      while (vertexHas(vertex, c)) c++;
      return c;
    };
    const otherVertex = (key, vertex) => {
      const [a, b] = key.split("|");
      return a === vertex ? b : a;
    };
    const recolor = (key, from, to) => {
      const [b, a] = key.split("|"); // key is "teacher|arm"
      if (incident[`${b}|${from}`] === key) delete incident[`${b}|${from}`];
      if (incident[`${a}|${from}`] === key) delete incident[`${a}|${from}`];
      incident[`${b}|${to}`] = key;
      incident[`${a}|${to}`] = key;
      colorOf[key] = to;
    };
    const walk = (start, firstColor, c1, c2) => {
      // Maximal alternating path from `start` with colors firstColor, then
      // c1/c2 alternating; clipped at any vertex already on the path.
      const path = [];
      const visited = new Set([start]);
      let cur = start;
      let need = firstColor;
      while (vertexHas(cur, need)) {
        const pk = incident[`${cur}|${need}`];
        path.push(pk);
        cur = otherVertex(pk, cur);
        need = need === c1 ? c2 : c1;
        if (visited.has(cur)) break;
        visited.add(cur);
      }
      return path;
    };

    for (const e of edges) {
      const u = e.teacher;
      const v = e.arm;
      const alpha = mex(u);
      const beta = mex(v);
      const key = `${u}|${v}`;
      if (alpha === beta) {
        colorOf[key] = alpha;
      } else if (alpha < beta) {
        // Path from the ARM v starting with alpha (v holds an alpha edge:
        // alpha < beta = mex(v)). Recolor, then place (u,v) at alpha.
        const path = walk(v, alpha, alpha, beta);
        path.forEach((pk) => recolor(pk, colorOf[pk], colorOf[pk] === alpha ? beta : alpha));
        colorOf[key] = alpha;
      } else {
        // Symmetric: path from the TEACHER u starting with beta (u holds a
        // beta edge: beta < alpha = mex(u)). Place (u,v) at beta.
        const path = walk(u, beta, beta, alpha);
        path.forEach((pk) => recolor(pk, colorOf[pk], colorOf[pk] === beta ? alpha : beta));
        colorOf[key] = beta;
      }
      incident[`${u}|${colorOf[key]}`] = key;
      incident[`${v}|${colorOf[key]}`] = key;
    }
    return colorOf;
  }

  // Build the day's edge list (one edge per slot), color it, then push the
  // slots with their assigned periods.
  DAY_LIST.forEach((day) => {
    const edges = [];
    ALL_ARMS.forEach((arm, armIdx) => {
      (weeklyPlans[armIdx][day] || []).forEach((subject) => {
        edges.push({ teacher: teacherFor(arm, subject), arm, subject });
      });
    });
    const colorOf = colorDay(edges);
    edges.forEach(({ teacher, arm, subject }) => {
      timetable.push({
        id: nid("ttb"),
        schoolId: school.id,
        classArm: arm,
        day,
        period: colorOf[`${teacher}|${arm}`],
        subject,
        teacherId: teacher,
        session: "2025/2026",
        term: "First Term",
        createdAt: nowIso(),
      });
    });
  });

  // Hard verification — the seed never ships a broken schedule silently.
  const seenTeacher = new Set();
  const seenArm = new Set();
  const dayLoad = {};
  for (const e of timetable) {
    const tKey = `${e.teacherId}|${e.day}|${e.period}`;
    const aKey = `${e.classArm}|${e.day}|${e.period}`;
    if (seenTeacher.has(tKey)) {
      const dup = teachers.find((x) => x.id === e.teacherId);
      throw new Error(
        `timetable seed double-books a teacher: ${dup?.name || e.teacherId} (${e.subject} in ${e.classArm}) on ${e.day} period ${e.period}`
      );
    }
    if (seenArm.has(aKey)) throw new Error(`timetable seed double-books an arm: ${aKey}`);
    seenTeacher.add(tKey);
    seenArm.add(aKey);
    dayLoad[`${e.teacherId}|${e.day}`] = (dayLoad[`${e.teacherId}|${e.day}`] || 0) + 1;
    const t = teachers.find((x) => x.id === e.teacherId);
    if (!t || !t.subjects.includes(e.subject) || !t.assignedClasses.includes(e.classArm)) {
      throw new Error(`timetable seed mis-staffs ${e.subject} in ${e.classArm}`);
    }
  }
  Object.entries(dayLoad).forEach(([key, n]) => {
    if (n > 8) throw new Error(`timetable seed over-books a teacher (${n} periods): ${key}`);
  });

  return { admin, teachers, students };
}

function clearAll() {
  schools.length = 0;
  users.length = 0;
  scores.length = 0;
  feeStructures.length = 0;
  feePayments.length = 0;
  attendance.length = 0;
  leads.length = 0;
  notifications.length = 0;
  feeAudit.length = 0;
  roleAudit.length = 0;
  digestPrefs.length = 0;
  digests.length = 0;
  timetable.length = 0;
  classAlertPrefs.length = 0;
  conflictScans.length = 0;
  termArchives.length = 0;
  reminderBatches.length = 0;
}

/**
 * Whether the boot-time demo seed may run. Production ships a CLEAN SLATE:
 * an empty store, so the first registered user becomes the first school's
 * admin — no pre-existing "demo school" anywhere.
 *
 *   SEED_DEMO_SCHOOL=0|false  → never seed (default — clean slate, even in dev)
 *   SEED_DEMO_SCHOOL=1|true   → always seed (dev/demo convenience)
 *   unset                     → never seed (same as 0|false)
 */
export function demoSeedEnabled() {
  const v = process.env.SEED_DEMO_SCHOOL;
  if (v === "1" || v === "true" || v === "yes") return true;
  return false;
}

// Boot: restore a persisted store (real operator data from a previous run),
// otherwise seed the demo school ONLY when demo seeding is enabled.
if (!loadPersisted() && demoSeedEnabled()) {
  seed();
  writeSnapshot();
}

/**
 * Test hook: wipe the in-memory state and re-seed from scratch. Used by the
 * node:test suite so every test starts from the same deterministic dataset.
 * Sequence counters intentionally keep climbing — ids stay unique.
 *
 * Also deletes the persisted snapshot: a reset means "start from the fresh
 * seed", so the next boot must not resurrect the old state.
 */
export function __resetDemoStore() {
  clearAll();
  seed();
  try {
    fs.rmSync(storeFile, { force: true });
  } catch {}
  clearPersistPending();
}

/** Cancel any pending debounced write (used by the reset/reload hooks). */
function clearPersistPending() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  persistDirty = false;
}

/** Test hook: point persistence at a specific file (e.g. a temp path). */
export function __setDemoStoreFile(file) {
  storeFile = file;
  clearPersistPending();
}

/** Test hook: flush any pending debounced write immediately. */
export function __persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (persistDirty) {
    persistDirty = false;
    writeSnapshot();
  }
}

/** Test hook: simulate a process restart — reload state from disk, seeding
 * ONLY when demo seeding is enabled (a production boot starts empty). */
export function __reloadDemoStore() {
  clearPersistPending();
  clearAll();
  if (!loadPersisted() && demoSeedEnabled()) seed();
}

// ---- Helpers ---------------------------------------------------------------

const clone = (obj) => (obj ? { ...obj } : obj);

/**
 * The public user shape: password AND blind indexes stripped — parity with
 * the Mongo model's toJSON transform. Blind indexes must never leave the
 * server (they would enable offline dictionary attacks on emails).
 */
function publicUser(user) {
  // Strip the password hash, blind indexes, and the internal session/
  // bootstrap flags — parity with the Mongo store's User toJSON transform
  // (password, emailIdx, phoneIdx, tokenVersion, passwordSet are internal).
  const { password, emailIdx, phoneIdx, tokenVersion, passwordSet, ...safe } = user;
  safe.subjects = Array.isArray(user.subjects) ? user.subjects : [];
  safe.assignedClasses = Array.isArray(user.assignedClasses) ? user.assignedClasses : [];
  return safe;
}

// ---- Store API -------------------------------------------------------------

export async function createSchoolAndAdmin({ schoolName, adminName, email, password }) {
  const school = {
    id: nid("sch"),
    name: schoolName,
    logoUrl: "",
    sealUrl: "",
    brandColor: "#2563EB",
    notificationRetentionDays: 90,
    reconcileDeletedReminders: false,
    // New schools start active; the founding admin can freeze the account
    // later from the dashboard danger zone (soft deactivation).
    status: "active",
    activeArms: [],
    currentSession: "2025/2026",
    currentTerm: "First Term",
    // A fresh registration has NOT run the first-run wizard yet.
    onboardingComplete: false,
    // Per-school fee-reminder wording: { parent, student } templates with
    // {name}/{student}/{class}/{balance}/{school} placeholders. Blank = the
    // built-in copy (see src/lib/notifications.js).
    reminderTemplates: {},
    createdAt: nowIso(),
  };
  schools.push(school);
  const user = {
    id: nid("usr"),
    name: adminName,
    email: email.toLowerCase(),
    emailIdx: blindEmailIndex(email),
    password: hash(password),
    role: "SUPER_ADMIN",
    schoolId: school.id,
    assignedClass: "",
    payrollStatus: "PAID",
    feePaid: false,
    parentId: null,
    phone: "",
    phoneIdx: "",
    address: "",
    createdAt: nowIso(),
  };
  users.push(user);
  persist();
  return { school, user: publicUser(user) };
}

export async function findUserByEmail(email) {
  return clone(users.find((u) => u.emailIdx === blindEmailIndex(email)));
}

export async function findUserByEmailInSchool(schoolId, email) {
  return clone(
    users.find(
      (u) => u.schoolId === schoolId && u.emailIdx === blindEmailIndex(email)
    )
  );
}

/**
 * Find a PARENT by their full name — the name the admin typed when creating
 * or linking them. Case-insensitive, tenant-scoped, role-filtered (a
 * student sharing a parent's name can never be found here).
 */
export async function findParentByNameInSchool(schoolId, name) {
  const norm = String(name || "").trim().toLowerCase();
  if (!norm) return null;
  const found = users.find(
    (u) =>
      u.schoolId === schoolId &&
      u.role === "PARENT" &&
      String(u.name || "").trim().toLowerCase() === norm
  );
  // null on no-match — identical contract to the Mongo store (never
  // undefined), so the login route's `!user` check behaves the same in both.
  return found ? clone(found) : null;
}

/**
 * Find a TEACHER by their full name — the name the admin typed when creating
 * them. Case-insensitive, tenant-scoped, role-filtered (a student or parent
 * sharing a teacher's name can never be found here). Same contract as
 * findParentByNameInSchool (null on no-match).
 */
export async function findTeacherByNameInSchool(schoolId, name) {
  const norm = String(name || "").trim().toLowerCase();
  if (!norm) return null;
  const found = users.find(
    (u) =>
      u.schoolId === schoolId &&
      u.role === "TEACHER" &&
      String(u.name || "").trim().toLowerCase() === norm
  );
  return found ? clone(found) : null;
}

export async function searchSchools(search, limit = 8) {
  const q = (search || "").toLowerCase().trim();
  return schools
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
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
  return schools.map((s) => s.id);
}

export async function findUserById(id) {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  return publicUser(user);
}

/**
 * Auth-data lookup by id (password verification needs the hash, not the
 * public shape). Returns password like findUserByEmailInSchool — never
 * serialized.
 */
export async function findUserByIdWithAuth(id) {
  return clone(users.find((u) => u.id === id));
}

export async function getSchoolById(id) {
  return clone(schools.find((s) => s.id === id));
}

export async function updateSchool(id, patch) {
  const school = schools.find((s) => s.id === id);
  if (!school) return null;
  const allowed = ["name", "logoUrl", "sealUrl", "brandColor", "activeArms", "currentSession", "currentTerm", "onboardingComplete", "periodTimes", "breakTimes", "dailySchedules", "reminderTemplates", "notificationRetentionDays", "reconcileDeletedReminders"];
  allowed.forEach((k) => {
    if (patch[k] !== undefined) school[k] = patch[k];
  });
  persist();
  return clone(school);
}

/**
 * Rename a class arm across EVERY reference in one atomic pass — the school's
 * activeArms list, student/teacher assignedClass, teacher assignedClasses
 * arrays, fee structures, scores, attendance registers and timetable entries.
 * A rename is a migration, not an edit: leaving any of these pointing at the
 * old name would strand students in an arm that no longer exists (or orphan
 * timetable slots the conflict scan would then flag).
 *
 * Validation: `from` must be a current arm, `to` must be non-empty and must
 * not collide (case-insensitively) with any existing arm. Returns
 * { school, counts } on success or { error } for a rejected rename — null if
 * the school itself is missing.
 */
export async function renameArm(schoolId, from, to) {
  const school = schools.find((s) => s.id === schoolId);
  if (!school) return null;
  const source = String(from || "").trim();
  const target = String(to || "").trim();
  if (!source) return { error: "The arm to rename is required" };
  if (!target) return { error: "The new arm name is required" };
  if (!school.activeArms.includes(source)) {
    return { error: `"${source}" is not one of the school's class arms` };
  }
  if (armAlreadyExists(school.activeArms, target)) {
    return { error: `"${target}" is already a class arm` };
  }
  if (source.toLowerCase() === target.toLowerCase()) {
    return { error: "The new name must differ from the current one" };
  }

  const counts = {
    students: 0,
    teachers: 0,
    feeStructures: 0,
    scores: 0,
    attendance: 0,
    timetable: 0,
  };

  school.activeArms = school.activeArms.map((a) => (a === source ? target : a));

  users.forEach((u) => {
    if (u.schoolId !== schoolId) return;
    const inClasses = Array.isArray(u.assignedClasses) && u.assignedClasses.includes(source);
    if (u.assignedClass === source || inClasses) {
      if (u.role === "STUDENT") counts.students += 1;
      else if (u.role === "TEACHER") counts.teachers += 1;
    }
    if (u.assignedClass === source) u.assignedClass = target;
    if (inClasses) {
      u.assignedClasses = u.assignedClasses.map((a) => (a === source ? target : a));
    }
  });
  feeStructures.forEach((f) => {
    if (f.schoolId === schoolId && f.classArm === source) {
      f.classArm = target;
      counts.feeStructures += 1;
    }
  });
  scores.forEach((s) => {
    if (s.schoolId === schoolId && s.classArm === source) {
      s.classArm = target;
      counts.scores += 1;
    }
  });
  attendance.forEach((a) => {
    if (a.schoolId === schoolId && a.classArm === source) {
      a.classArm = target;
      counts.attendance += 1;
    }
  });
  timetable.forEach((t) => {
    if (t.schoolId === schoolId && t.classArm === source) {
      t.classArm = target;
      counts.timetable += 1;
    }
  });

  persist();
  return { school: clone(school), counts };
}

/**
 * Move the school to a new term (term rollover) — one atomic operation that:
 *
 *   1. ARCHIVES the old term: every score row and every attendance register
 *      for the school's CURRENT session+term is snapshotted into the
 *      termArchives collection (keyed by schoolId/session/term/kind) and then
 *      cleared from the live tables — the new term starts with an empty
 *      scorebook and a clean register, exactly like a real school.
 *   2. CLONES forward the structure: each class arm's fee structure is
 *      re-created under the new session+term (same amount, idempotent via the
 *      unique key), and the weekly timetable grid is re-stamped with the new
 *      session+term (the grid is shared across terms by design — the school
 *      edits it if the new term's week differs).
 *   3. RESETS the termly state: every student's feePaid flips back to false
 *      (nothing has been paid for the new term yet) and the school's
 *      currentSession/currentTerm move to the new values, so every term-scoped
 *      read (fee ledger, attendance summary) now looks at the new term.
 *   4. CARRIES unpaid balances forward: every student whose old-term balance
 *      was still > 0 gets a carryover row for the new term, so the new term's
 *      billed amount = new fee + carried debt. The route sends automatic
 *      reminders to those students/parents.
 *
 * `dryRun` returns the exact counts WITHOUT mutating anything — the UI shows
 * the preview before the SUPER_ADMIN confirms. Returns { school, counts,
 * carryovers } on success (carryovers only for a real roll: [{ studentId,
 * amount }]), { error } for a rejected rollover, null if the school is
 * missing. counts = { scoresArchived, attendanceArchived, feesCloned,
 *            timetableCloned, studentsReset, carryovers }.
 */
export async function rolloverTerm(schoolId, { newTerm, newSession, dryRun = false }) {
  const school = schools.find((s) => s.id === schoolId);
  if (!school) return null;
  const term = String(newTerm || "").trim();
  const session = String(newSession || "").trim() || school.currentSession || "2025/2026";
  if (!term) return { error: "The new term is required" };
  if (term === school.currentTerm && session === school.currentSession) {
    return { error: `The school is already on ${session} · ${term}` };
  }

  const oldSession = school.currentSession || "2025/2026";
  const oldTerm = school.currentTerm || "First Term";
  const oldStructures = feeStructures.filter(
    (f) => f.schoolId === schoolId && f.session === oldSession && f.term === oldTerm
  );
  const scoreRows = scores.filter((s) => s.schoolId === schoolId);
  const attendanceRows = attendance.filter(
    (a) => a.schoolId === schoolId && a.session === oldSession && a.term === oldTerm
  );
  const ttEntries = timetable.filter((t) => t.schoolId === schoolId);
  const students = users.filter((u) => u.schoolId === schoolId && u.role === "STUDENT");

  // Old-term balances are captured BEFORE the term moves — every student with
  // a balance > 0 carries that unpaid amount into the new term, where it is
  // ADDED to the new term's fee (the ledger computes amount = structure +
  // carryover). Read-only, so the dry-run reports the same count.
  const oldLedger = await getFeeLedger(schoolId);
  const carriedBalances = new Map(
    oldLedger.filter((l) => l.balance > 0).map((l) => [l.studentId, l.balance])
  );

  const counts = {
    scoresArchived: scoreRows.length,
    attendanceArchived: attendanceRows.length,
    feesCloned: oldStructures.length,
    timetableCloned: ttEntries.length,
    studentsReset: students.length,
    // Students whose unpaid balance rolls into the new term (each also gets
    // an automatic reminder at the start of the new term).
    carryovers: carriedBalances.size,
  };
  if (dryRun) return { school: clone(school), counts };

  // 1. Archive the old term's scores + attendance, then clear them from live.
  //    Also snapshot the COHORT ROSTER: each enrolled student's name (and
  //    arm) rides into the archive so archived report cards keep the real
  //    name even if the student later graduates or is deleted. Roster rows
  //    are excluded from the summary counts (they are neither scores nor
  //    attendance registers).
  students.forEach((u) => {
    termArchives.push({
      id: nid("tar"),
      schoolId,
      session: oldSession,
      term: oldTerm,
      kind: "student",
      classArm: u.assignedClass || "",
      studentId: u.id,
      studentName: u.name,
    });
  });
  scoreRows.forEach((s) => {
    termArchives.push({
      id: nid("tar"),
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
    });
  });
  attendanceRows.forEach((a) => {
    termArchives.push({
      id: nid("tar"),
      schoolId,
      session: oldSession,
      term: oldTerm,
      kind: "attendance",
      classArm: a.classArm,
      date: a.date,
      records: a.records.map((r) => ({ ...r })),
    });
  });
  const keptScores = scores.filter((s) => s.schoolId !== schoolId);
  scores.length = 0;
  scores.push(...keptScores);
  const keptAttendance = attendance.filter(
    (a) => !(a.schoolId === schoolId && a.session === oldSession && a.term === oldTerm)
  );
  attendance.length = 0;
  attendance.push(...keptAttendance);

  // 2. Clone each arm's fee structure forward (idempotent upsert).
  oldStructures.forEach((f) => {
    let structure = feeStructures.find(
      (x) =>
        x.schoolId === schoolId &&
        x.classArm === f.classArm &&
        x.session === session &&
        x.term === term
    );
    if (!structure) {
      structure = {
        id: nid("fst"),
        schoolId,
        classArm: f.classArm,
        session,
        term,
        createdAt: nowIso(),
      };
      feeStructures.push(structure);
    }
    structure.amount = f.amount;
  });

  // 3. Re-stamp the shared weekly grid onto the new term.
  ttEntries.forEach((t) => {
    t.session = session;
    t.term = term;
  });

  // 4. Move the school forward and reset termly billing state.
  school.currentSession = session;
  school.currentTerm = term;
  students.forEach((u) => {
    u.feePaid = false;
  });

  // 5. Carry each student's unpaid balance into the new term (idempotent per
  //    student per new term — a re-roll only adds rows for students who owe
  //    AT THIS POINT). The route sends the automatic reminders afterwards.
  const carried = [];
  for (const [studentId, amount] of carriedBalances) {
    feeCarryovers.push({
      id: nid("fco"),
      schoolId,
      studentId,
      session,
      term,
      amount,
      fromSession: oldSession,
      fromTerm: oldTerm,
      createdAt: nowIso(),
    });
    carried.push({ studentId, amount });
  }

  persist();
  return { school: clone(school), counts, carryovers: carried };
}

/**
 * Read archived term snapshots — the durable record of a rolled-over term's
 * scores + attendance. Optional `{ session, term, kind }` narrows the query
 * (kind: "score" | "attendance"). Used by tests now, and by a future
 * "previous terms" viewer.
 */
export async function listTermArchives(schoolId, { session, term, kind } = {}) {
  return termArchives
    .filter((a) => a.schoolId === schoolId)
    .filter((a) => (session ? a.session === session : true))
    .filter((a) => (term ? a.term === term : true))
    .filter((a) => (kind ? a.kind === kind : true))
    .map(clone);
}

// Display order for archived terms: First → Second → Third, then by session.
const TERM_DISPLAY_ORDER = ["First Term", "Second Term", "Third Term"];

/**
 * Grouped summary of every archived term for a school — the "Previous Terms"
 * viewer's term list. Each entry carries the term's total score/attendance
 * counts plus a per-arm breakdown, so the admin sees exactly what each
 * archived term holds before drilling into a class arm.
 */
export async function getTermArchiveTerms(schoolId) {
  const groups = {};
  termArchives
    .filter((a) => a.schoolId === schoolId)
    .forEach((a) => {
      const key = `${a.session}||${a.term}`;
      if (!groups[key]) {
        groups[key] = { session: a.session, term: a.term, scoreCount: 0, attendanceCount: 0, students: 0, arms: {} };
      }
      const g = groups[key];
      if (a.kind === "score") g.scoreCount += 1;
      else if (a.kind === "attendance") g.attendanceCount += 1;
      else if (a.kind === "student") {
        // Roster snapshot: a student enrolled that term. Never counts as a
        // score/attendance register, but it DOES prove the term existed — so
        // a rolled-over term with zero scores/attendance (e.g. a fresh school
        // that never keyed marks) still appears in the viewer with its cohort.
        g.students += 1;
      }
      if (!g.arms[a.classArm]) {
        g.arms[a.classArm] = { classArm: a.classArm, scoreCount: 0, attendanceCount: 0, students: 0 };
      }
      if (a.kind === "score") g.arms[a.classArm].scoreCount += 1;
      else if (a.kind === "attendance") g.arms[a.classArm].attendanceCount += 1;
      else if (a.kind === "student") g.arms[a.classArm].students += 1;
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
  return termArchives
    .filter((a) => a.schoolId === schoolId)
    .filter((a) => (session ? a.session === session : true))
    .filter((a) => (term ? a.term === term : true))
    .filter((a) => (classArm ? a.classArm === classArm : true))
    .map(clone);
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
  const liveIds = new Set(
    users
      .filter((u) => u.schoolId === schoolId && u.role === "STUDENT")
      .map((u) => u.id)
  );
  const lastByStudent = {};
  termArchives
    .filter((a) => a.schoolId === schoolId && a.kind === "student")
    .forEach((a) => {
      const prev = lastByStudent[a.studentId];
      if (!prev || termRankKey(a.session, a.term) > termRankKey(prev.lastSession, prev.lastTerm)) {
        lastByStudent[a.studentId] = {
          studentName: a.studentName,
          classArm: a.classArm,
          lastSession: a.session,
          lastTerm: a.term,
        };
      }
    });
  return Object.entries(lastByStudent)
    .filter(([studentId]) => !liveIds.has(studentId))
    .map(([studentId, last]) => ({
      studentId,
      studentName: last.studentName,
      classArm: last.classArm,
      lastSession: last.lastSession,
      lastTerm: last.lastTerm,
    }))
    .sort((x, y) => x.studentName.localeCompare(y.studentName));
}

/** Raw user ids for a school — the lean counterpart to Mongo's
 * getSchoolUserIds, used by the auth-snapshot cache invalidation when the
 * school freezes/restores/deletes. Ids only: no full docs, no PII decrypt. */
export async function getSchoolUserIds(schoolId) {
  return users.filter((u) => u.schoolId === schoolId).map((u) => u.id);
}

export async function listUsers({ schoolId, role, classArm, limit, offset = 0 }) {
  const filtered = users
    .filter((u) => u.schoolId === schoolId)
    .filter((u) => (role ? u.role === role : true))
    .filter((u) => (classArm ? u.assignedClass === classArm : true));
  // Optional pagination — callers that pass `limit` get a slice instead of the
  // whole school roster (the 10k-user ceiling for the admin roster tab).
  // Clamp offset (a negative would slice from the END here while Mongo's
  // skip(-n) throws) and floor the limit (slice truncates, Mongo driver
  // rejects non-integers) — parity with the Mongo store's guards.
  const from = Math.max(0, Number(offset) || 0);
  const to = limit === undefined ? undefined : from + Math.floor(Math.max(0, Number(limit) || 0));
  const page = limit === undefined ? filtered : filtered.slice(from, to);
  // Strip blind indexes (and the password hash) — the public roster shape.
  return page.map(publicUser);
}

/** Total rows listUsers would return for the same query (pagination parity). */
export async function countUsers({ schoolId, role, classArm }) {
  return users
    .filter((u) => u.schoolId === schoolId)
    .filter((u) => (role ? u.role === role : true))
    .filter((u) => (classArm ? u.assignedClass === classArm : true))
    .length;
}

/**
 * Lean auth hot-path lookup — role/schoolId/assignedClass/subjects/arms/
 * tokenVersion ONLY. Every authed request revalidates the session through
 * requireAuth; this deliberately skips the publicUser transform so a request
 * storm never pays for building (or decrypting) the full user shape per
 * request. The teaching arrays ride along because requireClassScope needs
 * them for the subject-specialist scope (they are tiny); tokenVersion rides
 * along so the auth guard can revoke stale sessions after a password change.
 */
export async function findAuthSnapshot(id) {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  // Legacy fallback at read time (parity with the Mongo store): a teacher
  // carrying only assignedClass is treated as teaching that one arm.
  const ownArms = Array.isArray(user.assignedClasses) ? user.assignedClasses : [];
  const arms = ownArms.length ? ownArms : user.assignedClass ? [user.assignedClass] : [];
  return {
    id: user.id,
    role: user.role,
    schoolId: user.schoolId,
    // The school's freeze status — the auth guard uses it to reject every
    // non-super-admin request the moment a school is deactivated, without a
    // second lookup.
    schoolStatus: schools.find((s) => s.id === user.schoolId)?.status || "active",
    // Normalize like the Mongo store so both shapes are identical.
    assignedClass: user.assignedClass || "",
    subjects: Array.isArray(user.subjects) ? user.subjects : [],
    assignedClasses: arms,
    // Session-revocation counter — legacy rows without it read as 0.
    tokenVersion: user.tokenVersion || 0,
  };
}

export async function createUser({ schoolId, name, email, password, role, assignedClass = "", phone = "", subjects = [], assignedClasses = [], generatedPassword }) {
  const id = nid("usr");
  const user = {
    id,
    name,
    email: String(email || "").toLowerCase(),
    // Name-only parents have NO email. The blind index of "" is "", which
    // would collide on the per-school unique emailIdx index — derive a
    // per-user sentinel instead so any number of no-email parents can
    // coexist. Empty-email lookups never match (correct: nothing should).
    emailIdx: email ? blindEmailIndex(email) : `empty-${id}`,
    password: hash(password),
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
    generatedPassword: generatedPassword || "",
    payrollStatus: role === "TEACHER" ? "PENDING" : "PAID",
    feePaid: false,
    parentId: null,
    phone,
    phoneIdx: blindPhoneIndex(phone),
    address: "",
    createdAt: nowIso(),
  };
  users.push(user);
  persist();
  // Public shape (password + indexes stripped) — parity with the Mongo
  // store's toJSON transform, which strips all of them.
  return publicUser(user);
}

/**
 * Change a user's role — a dedicated store op so the generic updateUser path
 * can NEVER touch role (that route forbids it by construction). Persists.
 * Returns the user with the password hash stripped, like findUserById.
 */
export async function updateRole(id, newRole) {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  user.role = newRole;
  persist();
  return publicUser(user);
}

export async function updateUser(id, patch) {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  // password is handled separately below — it must never touch the stored
  // object as plaintext (even transiently), only as a hash.
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
    "generatedPassword",
    // Session revocation: bumped by the change-password route so every token
    // signed before the change dies on its next use.
    "tokenVersion",
    // Teacher bootstrap flag: true once the teacher sets their own password
    // (school-name login turns off); reset to false by an admin reset.
    "passwordSet",
  ];
  allowed.forEach((k) => {
    if (patch[k] !== undefined) user[k] = patch[k];
  });
  // Phone is PII — keep the blind index in sync (email is immutable via PATCH
  // by design, so only phone needs recomputation here).
  if (patch.phone !== undefined) user.phoneIdx = blindPhoneIndex(patch.phone);
  // Passwords are stored hashed (hashSync at demo cost) — hash on reset too.
  if (patch.password !== undefined) user.password = hash(patch.password);
  // Parent-link sync: when a student is linked to a parent, that parent's
  // login password becomes the child's full name (slugged — lowercase,
  // unspaced), recorded in generatedPassword so the admin can look it up.
  // Linking several children updates it to the most recent one; the login
  // route also accepts ANY linked child's name, so the parent can sign in
  // with whichever child they remember. Unlinking (parentId: null) changes
  // nothing.
  if (patch.parentId !== undefined && user.role === "STUDENT") {
    const parent = user.parentId ? users.find((u) => u.id === user.parentId) : null;
    if (parent && parent.role === "PARENT" && parent.schoolId === user.schoolId) {
      const slug = nameSlug(user.name);
      parent.password = hash(slug);
      parent.generatedPassword = slug;
    }
  }
  persist();
  // Strip the hash — no caller needs it back (parity with findUserById; the
  // mongo store's schema transform does the same).
  return publicUser(user);
}

/** List a parent's linked children (tenant-scoped to the parent's school). */
export async function getChildren(parentId) {
  const parent = users.find((u) => u.id === parentId);
  if (!parent) return [];
  return users
    .filter((u) => u.schoolId === parent.schoolId && u.parentId === parentId)
    .map(publicUser);
}

export async function deleteUser(id) {
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  const user = users[idx];
  users.splice(idx, 1);
  // Cascade: a removed student takes their scores, attendance and fee
  // payments with them; a removed teacher frees their timetable slots.
  const drop = (arr, key) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i][key] === id) arr.splice(i, 1);
    }
  };
  if (user.role === "STUDENT") {
    drop(scores, "studentId");
    drop(attendance, "studentId");
    drop(feePayments, "studentId");
    drop(feeCarryovers, "studentId");
  } else if (user.role === "TEACHER") {
    drop(timetable, "teacherId");
  }
  persist();
  return true;
}

/**
 * Permanently delete a school and every byte of its data (tenant wipe).
 * Used by the SUPER_ADMIN exit flow — after an exit survey is recorded.
 * Platform-level leads are NOT tenant-scoped and survive.
 */
/** How long a deleted school's data stays recoverable before the permanent wipe. */
export const SCHOOL_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Delete a school (grace period): marks it "deleted" with a deletedAt stamp
 * instead of wiping it. Every byte of data stays intact and the SUPER_ADMIN
 * can restore the account (setSchoolStatus → "active") until the grace
 * period expires — purgeExpiredDeletedSchools then wipes it for real.
 */
export async function deleteSchool(schoolId) {
  const school = schools.find((s) => s.id === schoolId);
  if (!school) return false;
  school.status = "deleted";
  school.deletedAt = nowIso();
  persist();
  return true;
}

/**
 * Permanent wipe — removes the school and every tenant record for real. This
 * is what purgeExpiredDeletedSchools runs once the grace period is over (and
 * what an expired school's login triggers lazily). Platform-level leads are
 * intentionally NOT tenant-scoped, so they survive.
 */
export async function purgeSchool(schoolId) {
  const idx = schools.findIndex((s) => s.id === schoolId);
  if (idx === -1) return false;
  schools.splice(idx, 1);
  const drop = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].schoolId === schoolId) arr.splice(i, 1);
    }
  };
  [users, scores, feeStructures, feePayments, feeCarryovers, reminderBatches, attendance, notifications, feeAudit, roleAudit, digestPrefs, digests, timetable, classAlertPrefs, conflictScans, termArchives].forEach(drop);
  persist();
  return true;
}

/**
 * Sweep deleted schools whose grace period has lapsed — the daily background
 * job (see src/instrumentation.js) and the login route's lazy check both call
 * this. Idempotent: a school already purged is simply skipped. Returns the
 * number of tenants permanently removed.
 */
export async function purgeExpiredDeletedSchools({ now = Date.now(), graceMs = SCHOOL_DELETION_GRACE_MS } = {}) {
  const expired = schools.filter(
    (s) => s.status === "deleted" && s.deletedAt && Date.parse(s.deletedAt) + graceMs <= now
  );
  for (const s of expired) {
    await purgeSchool(s.id);
  }
  return expired.length;
}

/**
 * Soft deactivation: flip a school between "active" and "frozen" without
 * touching any of its data. A frozen school blocks every non-super-admin
 * login (requireAuth + the login route both gate on it) so the super admin
 * can always get back in to reactivate. Returns the updated school, or null
 * when the school doesn't exist.
 */
export async function setSchoolStatus(schoolId, status) {
  const school = schools.find((s) => s.id === schoolId);
  if (!school) return null;
  school.status = status === "frozen" ? "frozen" : "active";
  // Back to active — whether a reactivation or a grace-period restore, the
  // deletedAt stamp is no longer meaningful.
  if (school.status === "active") school.deletedAt = null;
  persist();
  return clone(school);
}

export async function saveScores({ schoolId, classArm, subject, rows }) {
  const saved = [];
  for (const row of rows) {
    const caScore = Math.min(40, Math.max(0, Number(row.caScore) || 0));
    const examScore = Math.min(60, Math.max(0, Number(row.examScore) || 0));
    const totalScore = caScore + examScore;
    const grade = totalScore >= 70 ? "A" : totalScore >= 60 ? "B" : totalScore >= 50 ? "C" : totalScore >= 40 ? "D" : "F";
    let score = scores.find(
      (s) => s.studentId === row.studentId && s.subject === subject && s.classArm === classArm
    );
    if (!score) {
      score = {
        id: nid("scr"),
        studentId: row.studentId,
        schoolId,
        subject,
        classArm,
        createdAt: nowIso(),
      };
      scores.push(score);
    }
    score.caScore = caScore;
    score.examScore = examScore;
    score.totalScore = totalScore;
    score.grade = grade;
    saved.push(clone(score));
  }
  if (saved.length) persist();
  return saved;
}

export async function getScoresByClassSubject({ schoolId, classArm, subject }) {
  return scores
    .filter((s) => s.schoolId === schoolId && s.classArm === classArm && s.subject === subject)
    .map(clone);
}

export async function getScoresByStudent(studentId) {
  return scores.filter((s) => s.studentId === studentId).map(clone);
}

export async function getScoresBySchool(schoolId) {
  return scores.filter((s) => s.schoolId === schoolId).map(clone);
}

/**
 * Arm-scoped scores — ranking/report-card comparisons that only need one
 * class arm load a bounded slice instead of the whole school's score table
 * (the 10k-user ceiling: 10k students × 5 subjects ≈ 50k docs per request).
 */
export async function getScoresByClassArm(schoolId, classArm) {
  return scores
    .filter((s) => s.schoolId === schoolId && s.classArm === classArm)
    .map(clone);
}

export async function getDashboardStats(schoolId) {
  const schoolUsers = users.filter((u) => u.schoolId === schoolId);
  const students = schoolUsers.filter((u) => u.role === "STUDENT");
  const teachers = schoolUsers.filter((u) => u.role === "TEACHER");
  const paidTeachers = teachers.filter((t) => t.payrollStatus === "PAID");
  const feePaid = students.filter((s) => s.feePaid);
  const schoolScores = scores.filter((s) => s.schoolId === schoolId);

  const byArm = {};
  students.forEach((s) => {
    byArm[s.assignedClass] = (byArm[s.assignedClass] || 0) + 1;
  });

  // Fee amounts — scoped to the school's CURRENT session+term so the
  // overview reflects "this term" (after a rollover, the old term's payments
  // and structures are out of scope). Only CONFIRMED payments count.
  const school = schools.find((s) => s.id === schoolId);
  const schoolPayments = feePayments.filter(
    (p) =>
      p.schoolId === schoolId &&
      p.session === (school?.currentSession || "2025/2026") &&
      p.term === (school?.currentTerm || "First Term")
  );
  const totalBilled = feeStructures
    .filter(
      (f) =>
        f.schoolId === schoolId &&
        f.session === (school?.currentSession || "2025/2026") &&
        f.term === (school?.currentTerm || "First Term")
    )
    .reduce((acc, f) => acc + f.amount * (byArm[f.classArm] || 0), 0);
  const totalCollected = schoolPayments
    .filter((p) => p.status !== "PENDING")
    .reduce((acc, p) => acc + p.amount, 0);
  const pendingPayments = schoolPayments.filter((p) => p.status === "PENDING");

  // Fee collection timeline — confirmed collections per calendar day for the
  // CURRENT term, ascending, capped to the last 30 days (the Overview's area
  // chart). Bounded on purpose: the full term history isn't needed on a card.
  const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const byDay = {};
  schoolPayments
    .filter((p) => p.status !== "PENDING" && Date.parse(p.createdAt) >= cutoff30)
    .forEach((p) => {
      const day = String(p.createdAt).slice(0, 10);
      byDay[day] = (byDay[day] || 0) + p.amount;
    });
  const collectionTimeline = Object.keys(byDay)
    .sort()
    .map((date) => ({ date, amount: byDay[date] }));

  // Attendance trend — present/absent counts per SCHOOL DAY for the current
  // term, ascending, last 7 days. Multiple arms marked on the same day are
  // COLLAPSED into one point (the chart must never show duplicate dates).
  const attByDay = {};
  attendance
    .filter(
      (a) =>
        a.schoolId === schoolId &&
        a.session === (school?.currentSession || "2025/2026") &&
        a.term === (school?.currentTerm || "First Term")
    )
    .forEach((a) => {
      const d = a.date;
      if (!attByDay[d]) attByDay[d] = { present: 0, absent: 0 };
      a.records.forEach((r) => {
        if (r.present) attByDay[d].present += 1;
        else attByDay[d].absent += 1;
      });
    });
  const attendanceTrend = Object.keys(attByDay)
    .sort()
    .slice(-7)
    .map((date) => ({ date, ...attByDay[date] }));

  return {
    totalStudents: students.length,
    activeTeachers: teachers.length,
    payrollPaid: paidTeachers.length,
    payrollPending: teachers.length - paidTeachers.length,
    feeCollected: feePaid.length,
    feeRate: students.length ? Math.round((feePaid.length / students.length) * 100) : 0,
    feeCollectedAmount: totalCollected,
    feeOutstandingAmount: Math.max(0, totalBilled - totalCollected),
    feeBilledAmount: totalBilled,
    pendingPayments: {
      count: pendingPayments.length,
      amount: pendingPayments.reduce((acc, p) => acc + p.amount, 0),
    },
    classDistribution: byArm,
    totalScoreRecords: schoolScores.length,
    collectionTimeline,
    attendanceTrend,
  };
}

// ---- Fees -------------------------------------------------------------------

export async function getFeeStructures(schoolId) {
  return feeStructures
    .filter((f) => f.schoolId === schoolId)
    .sort((a, b) => a.classArm.localeCompare(b.classArm))
    .map(clone);
}

export async function saveFeeStructure(schoolId, { classArm, amount, session, term }) {
  let structure = feeStructures.find(
    (f) =>
      f.schoolId === schoolId &&
      f.classArm === classArm &&
      f.session === session &&
      f.term === term
  );
  if (!structure) {
    structure = {
      id: nid("fst"),
      schoolId,
      classArm,
      session,
      term,
      createdAt: nowIso(),
    };
    feeStructures.push(structure);
  }
  structure.amount = Math.max(0, Number(amount) || 0);
  persist();
  return clone(structure);
}

/** Full fee ledger for a school: per-student billed / paid / balance.
 *  Only CONFIRMED payments count toward paid/balance; PENDING payments are
 *  reported separately so a parent's unconfirmed payment never clears a
 *  student's balance.
 *  Optional `{ studentIds }` scopes the ledger to a subset (the parent portal
 *  only needs its own children — not the whole school's — per request). */
export async function getFeeLedger(schoolId, { studentIds } = {}) {
  const students = users.filter(
    (u) =>
      u.schoolId === schoolId &&
      u.role === "STUDENT" &&
      (!studentIds || studentIds.includes(u.id))
  );
  const school = schools.find((s) => s.id === schoolId);
  const currentSession = school?.currentSession || "2025/2026";
  const currentTerm = school?.currentTerm || "First Term";
  // Scope structures to the school's CURRENT session+term so a term rollover
  // never bills students with an old term's fee.
  const structures = feeStructures.filter(
    (f) => f.schoolId === schoolId && f.session === currentSession && f.term === currentTerm
  );
  // Unpaid balances carried from the previous term (created at rollover) ride
  // into this term's billing — the student owes new fee + carried debt.
  const carryovers = feeCarryovers.filter(
    (c) =>
      c.schoolId === schoolId &&
      c.session === currentSession &&
      c.term === currentTerm &&
      (!studentIds || studentIds.includes(c.studentId))
  );
  // Pre-scope payments too, so the per-student scan below only walks the
  // requested subset (not the whole school's payment history).
  // Scope payments to the school's CURRENT session+term too, so an old term's
  // payments never satisfy the new term's balance after a rollover.
  const scopedPayments = feePayments.filter(
    (p) =>
      p.schoolId === schoolId &&
      p.session === currentSession &&
      p.term === currentTerm &&
      (!studentIds || studentIds.includes(p.studentId))
  );
  return students.map((student) => {
    const structure = structures.find(
      (f) => f.classArm === student.assignedClass
    );
    const carryover =
      carryovers.find((c) => c.studentId === student.id)?.amount || 0;
    const amount = (structure?.amount || 0) + carryover;
    const payments = scopedPayments
      .filter((p) => p.studentId === student.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const confirmed = payments.filter((p) => p.status !== "PENDING");
    const pending = payments.filter((p) => p.status === "PENDING");
    const paid = confirmed.reduce((acc, p) => acc + p.amount, 0);
    const pendingAmount = pending.reduce((acc, p) => acc + p.amount, 0);
    const balance = Math.max(0, amount - paid);
    return {
      studentId: student.id,
      name: student.name,
      email: student.email,
      assignedClass: student.assignedClass || "",
      amount,
      // The portion of `amount` carried over from the previous term's unpaid
      // balance (0 when nothing was carried) — surfaced so the UI can show
      // exactly what rolled forward.
      carryover,
      paid,
      pending: pendingAmount,
      balance,
      feePaid: amount > 0 ? balance <= 0 : !!student.feePaid,
      payments,
    };
  });
}

export async function recordFeePayment({ schoolId, studentId, amount, method, note, status = "CONFIRMED" }) {
  const student = users.find(
    (u) => u.id === studentId && u.schoolId === schoolId && u.role === "STUDENT"
  );
  if (!student) return null;
  const school = schools.find((s) => s.id === schoolId);
  const amt = Math.max(0, Number(amount) || 0);
  // Normalize for parity with the Mongo schema's enum validation.
  const paymentStatus = status === "PENDING" ? "PENDING" : "CONFIRMED";
  const payment = {
    id: nid("fpay"),
    schoolId,
    studentId,
    amount: amt,
    method: method || "CASH",
    receiptNo: `RCT-${++receiptSeq}`,
    // Stamp the payment with the school's CURRENT term so a term rollover
    // archives the right rows and old-term payments never satisfy the new
    // term's ledger.
    session: school?.currentSession || "2025/2026",
    term: school?.currentTerm || "First Term",
    note: note || "",
    status: paymentStatus,
    createdAt: nowIso(),
  };
  feePayments.push(payment);
  // Sync the legacy feePaid boolean (ledger only counts CONFIRMED, so a
  // PENDING payment leaves feePaid untouched until the admin confirms it).
  const ledger = await getFeeLedger(schoolId);
  const entry = ledger.find((l) => l.studentId === studentId);
  student.feePaid = entry ? entry.balance <= 0 : true;
  persist();
  return clone(payment);
}

/** Mark a PENDING payment as CONFIRMED and re-sync the student's fee status.
 *  Returns null if the payment is missing or already confirmed (parity with
 *  the Mongo store's findOneAndUpdate({ status: "PENDING" }) filter). */
export async function confirmFeePayment({ schoolId, paymentId }) {
  const payment = feePayments.find(
    (p) => p.id === paymentId && p.schoolId === schoolId
  );
  if (!payment || payment.status !== "PENDING") return null;
  payment.status = "CONFIRMED";
  const student = users.find((u) => u.id === payment.studentId);
  if (student) {
    const ledger = await getFeeLedger(schoolId);
    const entry = ledger.find((l) => l.studentId === student.id);
    student.feePaid = entry ? entry.balance <= 0 : true;
  }
  persist();
  return clone(payment);
}

// ---- Attendance -------------------------------------------------------------

export async function getAttendance(schoolId, classArm, date) {
  const rec = attendance.find(
    (a) => a.schoolId === schoolId && a.classArm === classArm && a.date === date
  );
  return rec ? clone(rec) : null;
}

export async function saveAttendance(schoolId, classArm, date, records) {
  const school = schools.find((s) => s.id === schoolId);
  let rec = attendance.find(
    (a) => a.schoolId === schoolId && a.classArm === classArm && a.date === date
  );
  if (!rec) {
    rec = {
      id: nid("att"),
      schoolId,
      classArm,
      date,
      // Stamp the register with the school's CURRENT term — the rollover
      // archives exactly the old term's registers and the new term starts
      // with a clean count.
      session: school?.currentSession || "2025/2026",
      term: school?.currentTerm || "First Term",
      records: [],
      createdAt: nowIso(),
    };
    attendance.push(rec);
  }
  rec.records = records.map((r) => ({
    studentId: r.studentId,
    present: !!r.present,
  }));
  persist();
  return clone(rec);
}

/** Attendance summary for one student: total days, present, absent. */
export async function getStudentAttendanceSummary(schoolId, studentId) {
  const school = schools.find((s) => s.id === schoolId);
  // Term-scoped: "days present THIS term" must not leak the old term's
  // registers after a rollover (the old term lives in the archive).
  const records = attendance.filter(
    (a) =>
      a.schoolId === schoolId &&
      a.session === (school?.currentSession || "2025/2026") &&
      a.term === (school?.currentTerm || "First Term") &&
      a.records.some((r) => r.studentId === studentId)
  );
  let present = 0;
  records.forEach((a) => {
    const rec = a.records.find((r) => r.studentId === studentId);
    if (rec?.present) present += 1;
  });
  return { total: records.length, present, absent: records.length - present };
}

// ---- Timetable ---------------------------------------------------------------

/**
 * Weekly timetable slots for a school, optionally narrowed to one class arm
 * and/or one school day. The route enforces role scoping on top (a teacher
 * only ever asks about their assigned arms).
 */
export async function getTimetable({ schoolId, classArm, day }) {
  return timetable
    .filter((t) => t.schoolId === schoolId)
    .filter((t) => (classArm ? t.classArm === classArm : true))
    .filter((t) => (day ? t.day === day : true))
    .map(clone);
}

/**
 * Upsert one slot — a class arm can only hold one subject per period, so
 * assigning a period replaces what was there. Parity with the Mongo
 * findOneAndUpdate({ ... }, { upsert: true }).
 */
export async function saveTimetableEntry({ schoolId, classArm, day, period, subject, teacherId }) {
  const school = schools.find((s) => s.id === schoolId);
  let entry = timetable.find(
    (t) =>
      t.schoolId === schoolId &&
      t.classArm === classArm &&
      t.day === day &&
      t.period === period
  );
  if (!entry) {
    entry = {
      id: nid("ttb"),
      schoolId,
      classArm,
      day,
      period,
      // Stamp with the school's CURRENT term so the shared grid follows the
      // rollover (and the term field stays honest for the archive).
      session: school?.currentSession || "2025/2026",
      term: school?.currentTerm || "First Term",
      createdAt: nowIso(),
    };
    timetable.push(entry);
  }
  entry.subject = subject;
  entry.teacherId = teacherId;
  persist();
  return clone(entry);
}

/** Remove one slot. Returns false when it didn't exist (parity with Mongo). */
export async function deleteTimetableEntry({ schoolId, classArm, day, period }) {
  const idx = timetable.findIndex(
    (t) =>
      t.schoolId === schoolId &&
      t.classArm === classArm &&
      t.day === day &&
      t.period === period
  );
  if (idx === -1) return false;
  timetable.splice(idx, 1);
  persist();
  return true;
}

/**
 * Double-booking guard: any OTHER slot where the same teacher is already
 * teaching at that day + period (in any arm). `excludeClassArm` lets the
 * caller ignore the slot being edited (upserting your own slot is fine).
 */
export async function getTimetableConflict({ schoolId, teacherId, day, period, excludeClassArm }) {
  const entry = timetable.find(
    (t) =>
      t.schoolId === schoolId &&
      t.teacherId === teacherId &&
      t.day === day &&
      t.period === period &&
      (!excludeClassArm || t.classArm !== excludeClassArm)
  );
  return entry ? clone(entry) : null;
}

// ---- Class alert preferences (per teacher) -----------------------------------

const DEFAULT_ALERT_PREF = Object.freeze({
  enabled: false,
  leadMinutes: 5,
  soundOn: true,
});

/** One teacher's class-alert preferences (defaults when never set). */
export async function getClassAlertPref(schoolId, userId) {
  const pref = classAlertPrefs.find((p) => p.schoolId === schoolId && p.userId === userId);
  if (pref) return clone(pref);
  return { schoolId, userId, ...DEFAULT_ALERT_PREF };
}

/** Upsert one teacher's preferences. Values are clamped like the API route. */
export async function setClassAlertPref(schoolId, userId, patch = {}) {
  let pref = classAlertPrefs.find((p) => p.schoolId === schoolId && p.userId === userId);
  if (!pref) {
    pref = {
      id: nid("cap"),
      schoolId,
      userId,
      ...DEFAULT_ALERT_PREF,
      createdAt: nowIso(),
    };
    classAlertPrefs.push(pref);
  }
  if (patch.enabled !== undefined) pref.enabled = patch.enabled === true;
  if (patch.soundOn !== undefined) pref.soundOn = patch.soundOn === true;
  if (patch.leadMinutes !== undefined && [0, 5, 10, 15, 30].includes(Number(patch.leadMinutes))) {
    pref.leadMinutes = Number(patch.leadMinutes);
  }
  persist();
  return clone(pref);
}

// ---- Timetable conflict scans (the Overview health metric) -------------------

/** The school's most recent timetable-conflict scan, or null when never run. */
export async function getConflictScan(schoolId) {
  return clone(conflictScans.find((c) => c.schoolId === schoolId) || null);
}

/**
 * Record a conflict scan (upsert, one row per school). `conflicts` holds the
 * resolved conflict objects, `conflictKeys` their stable identities for the
 * next diff, and `newConflictKeys` the ones that were new at scan time.
 */
export async function saveConflictScan(schoolId, record) {
  let scan = conflictScans.find((c) => c.schoolId === schoolId);
  if (!scan) {
    scan = { id: nid("csc"), schoolId, createdAt: nowIso() };
    conflictScans.push(scan);
  }
  scan.lastRunAt = record.lastRunAt || nowIso();
  scan.conflicts = record.conflicts || { teacher: [], arm: [] };
  scan.conflictKeys = Array.isArray(record.conflictKeys) ? record.conflictKeys : [];
  scan.newConflictKeys = Array.isArray(record.newConflictKeys) ? record.newConflictKeys : [];
  scan.flaggedSlots = Array.isArray(record.flaggedSlots) ? record.flaggedSlots : [];
  // Per-day history: keep the existing series when a caller doesn't supply
  // one (legacy records read back as [] until the next scan writes it).
  scan.history = Array.isArray(record.history) ? record.history : scan.history || [];
  persist();
  return clone(scan);
}

// ---- Marketing leads ---------------------------------------------------------

/** Create a lead (demo request or newsletter subscription). Returns null if the
 *  email already exists for that kind (parity with the Mongo unique index). */
export async function createLead({ kind, name = "", school = "", email, phone = "", size = "", interest = "", message = "", ip = "", userAgent = "" }) {
  const existing = leads.find(
    (l) => l.kind === kind && l.emailIdx === blindEmailIndex(email)
  );
  if (existing) return null;
  const lead = {
    id: nid("lea"),
    kind,
    name,
    school,
    email: email.toLowerCase(),
    emailIdx: blindEmailIndex(email),
    phone,
    size,
    interest,
    message,
    ip,
    userAgent,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  leads.push(lead);
  persist();
  return clone(lead);
}

/** Most recent leads first (parity with Mongo listLeads) — indexes stripped. */
export async function listLeads(kind) {
  return leads
    .filter((l) => (kind ? l.kind === kind : true))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((l) => {
      const { emailIdx, ...safe } = l;
      return safe;
    });
}

// ---- Notifications (admin inbox) ----------------------------------------------

/** Create an email-style notification for a school (e.g. a parent payment). */
// ---- Reminder send batches (idempotency) -------------------------------------

/**
 * Look up a recorded reminder send by its idempotency key (school-scoped).
 * Null when this key has never been sent — the caller may proceed to send.
 */
export async function getReminderBatchByKey(schoolId, kind, key) {
  if (!key) return null;
  const found = reminderBatches.find(
    (b) => b.schoolId === schoolId && b.kind === kind && b.key === key
  );
  return found ? clone(found) : null;
}

/**
 * Record a reminder send as a batch. Returns { batch, created }: the NEW
 * record on first save, or the EXISTING batch with created:false when this
 * key was already recorded (a concurrent duplicate — the caller must treat
 * the send as already done and replay the existing result, never re-send).
 */
export async function saveReminderBatch({ schoolId, kind, key, context = "", studentIds = [], result }) {
  if (!key) return null;
  const existing = reminderBatches.find(
    (b) => b.schoolId === schoolId && b.kind === kind && b.key === key
  );
  if (existing) return { batch: clone(existing), created: false };
  const batch = {
    id: nid("rbt"),
    schoolId,
    kind,
    key,
    context,
    studentIds,
    result,
    createdAt: nowIso(),
  };
  reminderBatches.push(batch);
  persist();
  return { batch: clone(batch), created: true };
}

export async function createNotification({ schoolId, kind, to, subject, preview, body, amount }) {
  const notification = {
    id: nid("not"),
    schoolId,
    kind: kind || "info",
    to: Array.isArray(to) ? to : [],
    subject,
    preview,
    body: body || "",
    // Optional money fact (e.g. a fee reminder's outstanding balance) so the
    // reconcile flow can forward the LATEST amount without re-parsing text.
    amount: Number.isFinite(Number(amount)) ? Number(amount) : undefined,
    readBy: [],
    createdAt: nowIso(),
  };
  notifications.push(notification);
  persist();
  return clone(notification);
}

// A notification is read for a given admin if their id is in readBy, OR the
// "*" sentinel is (the legacy school-wide "read by everyone" state), OR it
// still carries the old school-wide `read: true` (defense-in-depth for any
// legacy object that reaches this helper outside the restore migration).
const isReadBy = (n, userId) => {
  const readBy = Array.isArray(n.readBy) ? n.readBy : [];
  return readBy.includes(userId) || readBy.includes("*") || n.read === true;
};

/**
 * Newest first (parity with Mongo's createdAt desc sort). Each entry carries
 * the caller's OWN `read` flag — two admins see different read states, and
 * readBy (other admins' ids) is stripped from the payload.
 */
// The staff inbox auto-archives notifications older than the school's
// configured retention (notificationRetentionDays). Returns a ms timestamp
// the age comparison is measured against (absent school = the 90-day
// default, matching the School model).
function notificationCutoff(schoolId) {
  const school = schools.find((s) => s.id === schoolId);
  const days = Math.max(1, Number(school?.notificationRetentionDays) || 90);
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export async function listNotifications(schoolId, userId, options = {}) {
  // Admin-inbox soft delete + auto-archive: a notification the school admin
  // deleted (adminDeletedAt) or that is older than the school's retention is
  // hidden from STAFF views only. options.view === "archived" flips to ONLY
  // the auto-archived history; options.includeDeleted === true keeps
  // soft-deleted rows (the Reconcile & forward flow uses this when the
  // school wants deleted reminders to stay forwardable). A parent's or
  // student's reminder copy must survive — the portals read the same store,
  // so the caller's role decides whether any filtering applies at all.
  const viewer = userId ? await findUserById(userId) : null;
  const staffView = STAFF_ROLES.includes(viewer?.role);
  const cutoff = staffView ? notificationCutoff(schoolId) : null;
  const wantArchived = staffView && options.view === "archived";
  const includeDeleted = options.includeDeleted === true;
  return notifications
    .filter((n) => n.schoolId === schoolId)
    .filter((n) => {
      if (!staffView) return true;
      if (n.adminDeletedAt && !includeDeleted) return false;
      const isArchived = new Date(n.createdAt).getTime() < cutoff;
      return wantArchived ? isArchived : !isArchived;
    })
    // Tie-break on the (monotonic) id suffix so same-millisecond creates still
    // order deterministically — newest created sorts first.
    .sort(
      (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt) ||
        Number(b.id.replace(/\D/g, "")) - Number(a.id.replace(/\D/g, ""))
    )
    .map((n) => {
      const copy = { ...n };
      delete copy.readBy;
      copy.read = isReadBy(n, userId);
      return copy;
    });
}

/**
 * Mark a batch as read FOR THE CALLING ADMIN (their id joins readBy — other
 * admins keep their own unread state). Returns the caller's remaining unread
 * count. A legacy school-wide `read: true` becomes "*" so it stays read.
 */
export async function markNotificationsRead(schoolId, userId, ids) {
  const set = new Set(ids || []);
  let changed = false;
  notifications.forEach((n) => {
    if (n.schoolId !== schoolId || !set.has(n.id)) return;
    if (n.read === true) {
      // Legacy school-wide read → sentinel, then record this admin too.
      n.readBy = Array.isArray(n.readBy) ? n.readBy : [];
      if (!n.readBy.includes("*")) n.readBy.push("*");
      delete n.read;
      changed = true;
    }
    if (n.readBy === undefined) n.readBy = [];
    if (!n.readBy.includes(userId)) {
      n.readBy.push(userId);
      changed = true;
    }
  });
  if (changed) persist();
  // Soft-deleted AND auto-archived rows are gone from the admin's inbox, so
  // neither may count toward the caller's unread total.
  const cutoff = notificationCutoff(schoolId);
  return notifications.filter(
    (n) =>
      n.schoolId === schoolId &&
      !isReadBy(n, userId) &&
      !n.adminDeletedAt &&
      new Date(n.createdAt).getTime() >= cutoff
  ).length;
}

/**
 * SOFT delete notifications by id (school-scoped) — the admin inbox cleanup.
 * Each one is stamped adminDeletedAt instead of removed, so the record (and
 * a parent's or student's own reminder copy) survives — only staff inbox
 * views hide it. Returns the number newly hidden (already-hidden ids count
 * zero, keeping the operation idempotent).
 */
export async function deleteNotifications(schoolId, ids) {
  const set = new Set(ids || []);
  const stamp = nowIso();
  let marked = 0;
  notifications.forEach((n) => {
    if (n.schoolId !== schoolId || !set.has(n.id) || n.adminDeletedAt) return;
    n.adminDeletedAt = stamp;
    marked += 1;
  });
  if (marked) persist();
  return marked;
}

/**
 * Mark a batch of notifications as "reconciled" — i.e. their fee reminder
 * was forwarded to the student's newly linked parent. Sets reconciledAt (the
 * moment the copy was sent) so a reminder is never forwarded twice. Returns
 * the number actually marked (already-reconciled ones don't count).
 */
export async function markNotificationsReconciled(schoolId, ids) {
  const set = new Set(ids || []);
  const stamp = nowIso();
  let changed = 0;
  notifications.forEach((n) => {
    if (n.schoolId !== schoolId || !set.has(n.id)) return;
    if (n.reconciledAt) return; // already forwarded
    n.reconciledAt = stamp;
    changed += 1;
  });
  if (changed) persist();
  return changed;
}

// ---- Fee audit trail ----------------------------------------------------------

/**
 * Append a fee audit entry — an immutable "who did what, and when" record
 * for reconciliation. The actor is resolved by the caller (the API route)
 * so the store stays a dumb ledger, same as the Mongo parity function.
 */
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
  const entry = {
    id: nid("aud"),
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
    createdAt: nowIso(),
  };
  feeAudit.push(entry);
  persist();
  return clone(entry);
}

/** Newest first (parity with Mongo's createdAt desc sort). */
export async function listFeeAudit(schoolId, { limit = 100 } = {}) {
  return feeAudit
    .filter((e) => e.schoolId === schoolId)
    .sort(
      (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt) ||
        Number(b.id.replace(/\D/g, "")) - Number(a.id.replace(/\D/g, ""))
    )
    .slice(0, limit)
    .map(clone);
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
  const entry = {
    id: nid("rla"),
    schoolId,
    actorId,
    actorName: actorName || "Unknown",
    actorRole,
    targetId,
    targetName: targetName || "Unknown",
    fromRole,
    toRole,
    createdAt: nowIso(),
  };
  roleAudit.push(entry);
  persist();
  return clone(entry);
}

/** Newest first (parity with Mongo's createdAt desc sort). */
export async function listRoleAudit(schoolId, { limit = 100 } = {}) {
  return roleAudit
    .filter((e) => e.schoolId === schoolId)
    .sort(
      (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt) ||
        Number(b.id.replace(/\D/g, "")) - Number(a.id.replace(/\D/g, ""))
    )
    .slice(0, limit)
    .map(clone);
}

// ---- Admin digest preferences (per-admin schedule) ---------------------------

/**
 * The digest schedule for ONE admin (default: off). Digest frequency is a
 * per-admin setting — two admins in the same school can pick different
 * schedules, and each digest only carries the admin's OWN unread items.
 */
export async function getDigestPref(schoolId, userId) {
  const pref = digestPrefs.find((p) => p.schoolId === schoolId && p.userId === userId);
  if (pref) return clone(pref);
  return { schoolId, userId, frequency: "off", lastSentAt: null };
}

/** Set one admin's digest frequency: "off" | "daily" | "weekly". */
export async function setDigestPref(schoolId, userId, frequency) {
  const freq = ["off", "daily", "weekly"].includes(frequency) ? frequency : "off";
  let pref = digestPrefs.find((p) => p.schoolId === schoolId && p.userId === userId);
  if (!pref) {
    pref = {
      id: nid("dgp"),
      schoolId,
      userId,
      frequency: "off",
      lastSentAt: null,
      createdAt: nowIso(),
    };
    digestPrefs.push(pref);
  }
  pref.frequency = freq;
  persist();
  return clone(pref);
}

/**
 * Record a sent digest email (the admin's unread items at send time) and bump
 * their lastSentAt. Returns the stored digest record.
 */
export async function sendDigest({ schoolId, userId, frequency, subject, preview, body, itemCount }) {
  const digest = {
    id: nid("dgs"),
    schoolId,
    userId,
    frequency: frequency === "weekly" ? "weekly" : "daily",
    subject,
    preview,
    body: body || "",
    itemCount: Number(itemCount) || 0,
    createdAt: nowIso(),
  };
  digests.push(digest);

  let pref = digestPrefs.find((p) => p.schoolId === schoolId && p.userId === userId);
  if (!pref) {
    pref = {
      id: nid("dgp"),
      schoolId,
      userId,
      frequency: "off",
      lastSentAt: null,
      createdAt: nowIso(),
    };
    digestPrefs.push(pref);
  }
  pref.lastSentAt = digest.createdAt;
  persist();
  return clone(digest);
}

/** Digest history for one admin, newest first. */
export async function listDigests(schoolId, userId, { limit = 20 } = {}) {
  return digests
    .filter((d) => d.schoolId === schoolId && d.userId === userId)
    .sort(
      (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt) ||
        Number(b.id.replace(/\D/g, "")) - Number(a.id.replace(/\D/g, ""))
    )
    .slice(0, limit)
    .map(clone);
}
