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
import { colorDay } from "@/lib/konig";

/**
 * In-memory store used when MONGODB_URI is not set (demo mode).
 * Mirrors the shape returned by the Mongoose store so API routes are identical.
 *
 * This file is now a thin facade:
 *  - Persistence (disk snapshot, seed, restore) lives here.
 *  - All store functions are re-exported from per-module service files
 *    (src/modules/[domain]/store.js), which share a single set of
 *  - in-memory arrays via src/modules/shared/store-state.js.
 */

// ── Shared state ──────────────────────────────────────────────────
// All in-memory arrays + helpers live in the shared module so every
// per-module store file operates on the SAME data.
import {
  schools,
  users,
  scores,
  feeStructures,
  feePayments,
  attendance,
  leads,
  notifications,
  feeAudit,
  roleAudit,
  digestPrefs,
  digests,
  timetable,
  classAlertPrefs,
  conflictScans,
  termArchives,
  feeCarryovers,
  reminderBatches,
  schemesOfWork,
  classResources,
  alumniRecords,
  pushSubscriptions,
  messages,
  notificationPreferences,
  erasureRequests,
  dataAccessLog,
  assignmentSubmissions,
  platformAlerts,
  auditLogs,
  healthMetrics,
  impersonationSessions,
  ALL_ARRAYS,
  nid,
  hash,
  nowIso,
  clone,
  publicUser,
  setPersistFn,
  seq,
  setSeq,
} from "@/modules/shared/store-state";


let receiptSeq = 1000;

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
    erasureRequests,
    dataAccessLog,
    assignmentSubmissions,
    platformAlerts,
    auditLogs,
    healthMetrics,
    ...getWebhookSnapshot(),
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
    "erasureRequests",
    "dataAccessLog",
    "assignmentSubmissions",
    "platformAlerts",
    "auditLogs",
    "healthMetrics",
    "webhookConfigs",
    "webhookDeliveries",
  ];
  for (const key of collections) {
    // Backward-compatible restore: snapshots written before a collection
    // existed (e.g. notifications) load as empty rather than failing the
    // whole file and silently re-seeding the demo.
    if (data[key] === undefined) data[key] = [];
    if (!Array.isArray(data[key])) return false;
  }
  setSeq(Number.isInteger(data.seq) ? data.seq : 100);
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
  erasureRequests.length = 0;
  erasureRequests.push(...(data.erasureRequests || []));
  dataAccessLog.length = 0;
  dataAccessLog.push(...(data.dataAccessLog || []));
  assignmentSubmissions.length = 0;
  assignmentSubmissions.push(...(data.assignmentSubmissions || []));
  platformAlerts.length = 0;
  platformAlerts.push(...(data.platformAlerts || []));
  auditLogs.length = 0;
  auditLogs.push(...(data.auditLogs || []));
  healthMetrics.length = 0;
  healthMetrics.push(...(data.healthMetrics || []));
  restoreWebhookState(data);
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

// Wire the shared module's persist() to our debounced writer so all
// module stores that call persist() trigger the same disk write.
setPersistFn(persist);

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
    // SaaS billing — Greenfield is on a Standard annual plan
    billingPlan: "standard",
    billingCycle: "annual",
    subscriptionStatus: "active",
    paystackCustomerCode: "",
    paystackSubscriptionCode: "",
    paystackPlanCode: "",
    currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
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

  // Platform admin — monitors all schools, impersonates for support
  const platformSchool = { id: nid("sch"), name: "EduTrack Platform", logoUrl: "", sealUrl: "", brandColor: "#0F172A", activeArms: [], currentSession: "2025/2026", currentTerm: "First Term", status: "active", onboardingComplete: true, billingPlan: "trial", subscriptionStatus: "trial", trialStart: nowIso(), trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), createdAt: nowIso(), isPlatformSchool: true };
  schools.push(platformSchool);

  addUser(
    "Platform Admin",
    "platform@edutrack.app",
    "platform123",
    "PLATFORM_ADMIN",
    "",
    { schoolId: platformSchool.id, payrollStatus: "PAID" }
  );

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

  // ── Seed 3 additional demo schools for a realistic multi-tenant view ──
  const extraSchoolData = [
    {
      name: "Sunshine Academy",
      brandColor: "#F59E0B",
      billingPlan: "starter",
      billingCycle: "monthly",
      subscriptionStatus: "active",
      status: "active",
      arms: ["JSS1", "JSS2", "SS1 Science", "SS1 Arts"],
      teacherData: [
        { name: "Mr. Olumide Adeyemi", email: "olumide@sunshine.app", subjects: ["Mathematics"], arms: ["JSS1", "JSS2", "SS1 Science"] },
        { name: "Mrs. Funke Balogun", email: "funke@sunshine.app", subjects: ["English Language"], arms: ["JSS1", "JSS2", "SS1 Arts"] },
        { name: "Mr. Yusuf Abubakar", email: "yusuf@sunshine.app", subjects: ["Physics"], arms: ["SS1 Science"] },
        { name: "Mrs. Adama Ibrahim", email: "adama@sunshine.app", subjects: ["Literature in English"], arms: ["SS1 Arts"] },
        { name: "Mr. Chukwuemeka Okeke", email: "chukwu@sunshine.app", subjects: ["Basic Science", "Biology"], arms: ["JSS1", "JSS2", "SS1 Science"] },
      ],
      studentData: [
        { name: "Tunde Abiodun", arm: "JSS1" },
        { name: "Nneka Okafor", arm: "JSS1" },
        { name: "Bashir Lawal", arm: "JSS2" },
        { name: "Amara Eze", arm: "JSS2" },
        { name: "Yemi Alabi", arm: "SS1 Science" },
        { name: "Chika Nwosu", arm: "SS1 Science" },
        { name: "Fatimah Garba", arm: "SS1 Arts" },
        { name: "Segun Afolabi", arm: "SS1 Arts" },
      ],
    },
    {
      name: "Lagos Heritage School",
      brandColor: "#8B5CF6",
      billingPlan: "standard",
      billingCycle: "annual",
      subscriptionStatus: "active",
      status: "active",
      arms: ["JSS1", "JSS2", "JSS3", "SS1 Science", "SS1 Arts", "SS1 Commercial", "SS2 Science", "SS2 Arts"],
      teacherData: [
        { name: "Dr. Emeka Okoro", email: "emeka@heritage.edu", subjects: ["Mathematics"], arms: ["JSS1", "JSS2", "JSS3", "SS1 Science", "SS2 Science"] },
        { name: "Mrs. Bimpe Coker", email: "bimpe@heritage.edu", subjects: ["English Language"], arms: ["JSS1", "JSS2", "JSS3", "SS1 Arts", "SS2 Arts"] },
        { name: "Mr. Aliyu Bello", email: "aliyu@heritage.edu", subjects: ["Chemistry"], arms: ["SS1 Science", "SS2 Science"] },
        { name: "Ms. Zainab Abdullahi", email: "zainab@heritage.edu", subjects: ["Government"], arms: ["SS1 Arts", "SS2 Arts"] },
        { name: "Mr. Oluwaseun Bankole", email: "seun@heritage.edu", subjects: ["Accounting"], arms: ["SS1 Commercial"] },
        { name: "Mrs. Ngozi Anyanwu", email: "ngozi@heritage.edu", subjects: ["Civic Education"], arms: ["JSS1", "JSS2", "JSS3"] },
        { name: "Mr. Dauda Sani", email: "dauda@heritage.edu", subjects: ["Physics"], arms: ["SS1 Science", "SS2 Science"] },
        { name: "Mrs. Aisha Mohammed", email: "aisha@heritage.edu", subjects: ["Literature in English"], arms: ["SS1 Arts", "SS2 Arts"] },
      ],
      studentData: [
        { name: "Adebola Johnson", arm: "JSS1" },
        { name: "Chioma Nnamdi", arm: "JSS1" },
        { name: "Ibrahim Tanko", arm: "JSS2" },
        { name: "Folashade Lawal", arm: "JSS2" },
        { name: "Obinna Uche", arm: "JSS3" },
        { name: "Hauwa Danjuma", arm: "JSS3" },
        { name: "Tobiloba Adeleke", arm: "SS1 Science" },
        { name: "Ngozika Eze", arm: "SS1 Science" },
        { name: "Amina Yusuf", arm: "SS1 Arts" },
        { name: "Babatunde Ogundipe", arm: "SS1 Arts" },
        { name: "Chidinma Igwe", arm: "SS1 Commercial" },
        { name: "Femi Adesina", arm: "SS2 Science" },
        { name: "Adaeze Okolo", arm: "SS2 Science" },
        { name: "Kemi Fashola", arm: "SS2 Arts" },
        { name: "Musa Haruna", arm: "SS2 Arts" },
        { name: "Titi Ogundimu", arm: "JSS1" },
      ],
    },
    {
      name: "Prestige College Abuja",
      brandColor: "#EF4444",
      billingPlan: "enterprise",
      billingCycle: "annual",
      subscriptionStatus: "active",
      status: "frozen",
      arms: ["JSS1", "JSS2", "SS1 Science", "SS1 Arts"],
      teacherData: [
        { name: "Prof. Akinwale Ogundimu", email: "akinwale@prestige.edu", subjects: ["Mathematics"], arms: ["JSS1", "JSS2", "SS1 Science"] },
        { name: "Mrs. Bola Akande", email: "bola@prestige.edu", subjects: ["English Language"], arms: ["JSS1", "JSS2", "SS1 Arts"] },
        { name: "Mr. Chinedu Agu", email: "chinedu@prestige.edu", subjects: ["Computer Studies"], arms: ["JSS1", "JSS2"] },
        { name: "Mrs. Halima Bello", email: "halima@prestige.edu", subjects: ["Economics"], arms: ["SS1 Arts"] },
      ],
      studentData: [
        { name: "Oluwadamilola Ojo", arm: "JSS1" },
        { name: "Ifeanyi Okwu", arm: "JSS1" },
        { name: "Sade Oyewale", arm: "JSS2" },
        { name: "Emeka Okadigbo", arm: "JSS2" },
        { name: "Bukola Alabi", arm: "SS1 Science" },
        { name: "Aminu Bello", arm: "SS1 Arts" },
        { name: "Chidera Okolo", arm: "SS1 Arts" },
      ],
    },
  ];

  for (const sd of extraSchoolData) {
    const sId = nid("sch");
    const daysLeft = sd.subscriptionStatus === "active" ? 365 : 0;
    schools.push({
      id: sId,
      name: sd.name,
      logoUrl: "",
      sealUrl: "",
      brandColor: sd.brandColor,
      notificationRetentionDays: 90,
      reconcileDeletedReminders: false,
      status: sd.status,
      activeArms: sd.arms,
      currentSession: "2025/2026",
      currentTerm: "First Term",
      periodTimes: DEFAULT_PERIOD_TIMES.map((p) => ({ ...p })),
      onboardingComplete: true,
      billingPlan: sd.billingPlan,
      billingCycle: sd.billingCycle,
      subscriptionStatus: sd.subscriptionStatus,
      paystackCustomerCode: "",
      paystackSubscriptionCode: "",
      paystackPlanCode: "",
      currentPeriodEnd: daysLeft > 0 ? new Date(Date.now() + daysLeft * 86400000).toISOString() : nowIso(),
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    });

    // Add super admin for this school
    const sAdmin = {
      id: nid("usr"),
      name: `Admin - ${sd.name}`,
      email: sd.teacherData[0]?.email?.replace(/@.*/, "@admin.edutrack.app") || `admin@${sd.name.toLowerCase().replace(/\s+/g, "")}.app`,
      emailIdx: blindEmailIndex(sd.teacherData[0]?.email?.replace(/@.*/, "@admin.edutrack.app") || `admin@${sd.name.toLowerCase().replace(/\s+/g, "")}.app`),
      password: hash("admin123"),
      role: "SUPER_ADMIN",
      schoolId: sId,
      assignedClass: "",
      payrollStatus: "PAID",
      feePaid: false,
      parentId: null,
      phone: "",
      phoneIdx: "",
      address: "",
      createdAt: nowIso(),
    };
    users.push(sAdmin);

    // Add teachers
    for (const td of sd.teacherData) {
      users.push({
        id: nid("usr"),
        name: td.name,
        email: td.email,
        emailIdx: blindEmailIndex(td.email),
        password: hash("teacher123"),
        role: "TEACHER",
        schoolId: sId,
        assignedClass: td.arms[0],
        payrollStatus: "PENDING",
        subjects: td.subjects,
        assignedClasses: td.arms,
        feePaid: false,
        parentId: null,
        phone: "",
        phoneIdx: "",
        address: "",
        createdAt: nowIso(),
      });
    }

    // Add students
    const sStudents = [];
    for (const std of sd.studentData) {
      const st = {
        id: nid("usr"),
        name: std.name,
        email: `${std.name.toLowerCase().replace(/\s+/g, ".")}@student.edu`,
        emailIdx: blindEmailIndex(`${std.name.toLowerCase().replace(/\s+/g, ".")}@student.edu`),
        password: hash("student123"),
        role: "STUDENT",
        schoolId: sId,
        assignedClass: std.arm,
        payrollStatus: "PENDING",
        feePaid: Math.random() > 0.3,
        parentId: null,
        phone: "",
        phoneIdx: "",
        address: "",
        createdAt: nowIso(),
      };
      users.push(st);
      sStudents.push(st);
    }

  }

  // ── Seed platform alerts (synchronous — must happen before writeSnapshot) ──
  const now = new Date();
  const demoAlerts = [
    {
      type: "school_signup",
      severity: "success",
      title: "New school registered",
      message: "Greenfield International School joined EduTrack.",
      schoolId: school.id,
      schoolName: school.name,
      meta: { plan: "standard", students: 16 },
    },
    {
      type: "subscription_activated",
      severity: "success",
      title: "Subscription activated",
      message: "Greenfield International School is on the Standard plan.",
      schoolId: school.id,
      schoolName: school.name,
      meta: { plan: "standard", cycle: "annual" },
    },
    {
      type: "system",
      severity: "info",
      title: "Platform deployed",
      message: "EduTrack v1.0 platform infrastructure is live and operational.",
      meta: {},
    },
  ];
  for (const alert of demoAlerts) {
    platformAlerts.push({
      id: nid("alert"),
      schoolId: alert.schoolId || null,
      schoolName: alert.schoolName || "",
      type: alert.type,
      severity: alert.severity || "info",
      title: alert.title,
      message: alert.message || "",
      read: false,
      meta: alert.meta || {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  // ── Seed demo audit log entries (spread across 90 days for heatmap) ──
  const now2 = new Date();
  const actionTypes = [
    { action: "impersonate", weight: 3 },
    { action: "plan_change", weight: 2 },
    { action: "subscription_activate", weight: 2 },
    { action: "school_created", weight: 1 },
    { action: "subscription_cancel", weight: 1 },
    { action: "status_change", weight: 1 },
  ];
  const actors = ["Platform Admin", "Platform Admin", "System", "Platform Admin"];

  // Deterministic pseudo-random for consistent seeding
  let seed = 42;
  function pseudoRandom() { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; }

  // Generate ~80 audit entries across 90 days with realistic clustering
  for (let day = 0; day < 90; day++) {
    // More activity in recent days, less in older days
    const recencyBias = day < 7 ? 4 : day < 14 ? 3 : day < 30 ? 2 : 1;
    const entriesThisDay = Math.max(1, Math.floor(pseudoRandom() * recencyBias + 0.5));
    for (let e = 0; e < entriesThisDay; e++) {
      // Pick weighted random action type
      const totalWeight = actionTypes.reduce((s, a) => s + a.weight, 0);
      let roll = pseudoRandom() * totalWeight;
      let picked = actionTypes[0];
      for (const at of actionTypes) {
        roll -= at.weight;
        if (roll <= 0) { picked = at; break; }
      }
      const actor = actors[Math.floor(pseudoRandom() * actors.length)];
      const hoursOffset = Math.floor(pseudoRandom() * 24);
      const minutesOffset = Math.floor(pseudoRandom() * 60);
      const entryDate = new Date(now2 - day * 86400000 - hoursOffset * 3600000 - minutesOffset * 60000);

      let description = `${actor} performed ${picked.action}`;
      if (picked.action === "impersonate") description = `${actor} impersonated ${admin.name} (SUPER_ADMIN) at ${school.name}`;
      else if (picked.action === "plan_change") description = `${actor} changed ${school.name} plan to standard`;
      else if (picked.action === "subscription_activate") description = `${actor} activated subscription for ${school.name}`;
      else if (picked.action === "school_created") description = `${school.name} was registered on the platform`;
      else if (picked.action === "subscription_cancel") description = `${actor} cancelled subscription for ${school.name}`;
      else if (picked.action === "status_change") description = `${actor} changed ${school.name} status to frozen`;

      auditLogs.push({
        id: nid("audit"),
        action: picked.action,
        actor,
        schoolId: school.id,
        schoolName: school.name,
        description,
        meta: { seeded: true },
        ip: "192.168.1." + (10 + Math.floor(pseudoRandom() * 200)),
        createdAt: entryDate.toISOString(),
      });
    }
  }

  // ── Seed demo health metrics ──
  const now3 = new Date();
  const endpoints = [
    { method: "GET", endpoint: "/api/school", avgMs: 45, p95Ms: 120 },
    { method: "GET", endpoint: "/api/users", avgMs: 85, p95Ms: 210 },
    { method: "POST", endpoint: "/api/scores", avgMs: 150, p95Ms: 380 },
    { method: "GET", endpoint: "/api/reports", avgMs: 320, p95Ms: 800 },
    { method: "POST", endpoint: "/api/fees/payments", avgMs: 180, p95Ms: 420 },
    { method: "GET", endpoint: "/api/attendance", avgMs: 60, p95Ms: 140 },
    { method: "POST", endpoint: "/api/auth/login", avgMs: 200, p95Ms: 450 },
    { method: "GET", endpoint: "/api/timetable", avgMs: 90, p95Ms: 200 },
    { method: "GET", endpoint: "/api/resources", avgMs: 110, p95Ms: 280 },
    { method: "POST", endpoint: "/api/attendance", avgMs: 75, p95Ms: 170 },
  ];

  // Generate 24h of API response metrics
  for (let h = 23; h >= 0; h--) {
    const hourTime = new Date(now3 - h * 3600000);
    const requestsInHour = 15 + Math.floor(Math.random() * 25);
    for (let r = 0; r < requestsInHour; r++) {
      const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
      const jitter = 0.7 + Math.random() * 0.6;
      const responseTime = Math.round(ep.avgMs * jitter);
      const isError = Math.random() < 0.04;
      const minuteOffset = Math.floor(Math.random() * 60) * 60000;
      const ts = new Date(hourTime.getTime() + minuteOffset);

      healthMetrics.push({
        id: nid("health"),
        type: "api_response",
        endpoint: ep.endpoint,
        method: ep.method,
        value: responseTime,
        statusCode: isError ? (Math.random() < 0.5 ? 500 : 503) : 200,
        errorMessage: isError ? "Internal server error" : null,
        meta: {},
        createdAt: ts.toISOString(),
      });

      if (isError) {
        healthMetrics.push({
          id: nid("health"),
          type: "error",
          endpoint: ep.endpoint,
          method: ep.method,
          value: responseTime,
          statusCode: Math.random() < 0.5 ? 500 : 503,
          errorMessage: Math.random() < 0.5 ? "Database connection timeout" : "Rate limit exceeded",
          meta: {},
          createdAt: ts.toISOString(),
        });
      }
    }
  }

  // DB size trend (24 data points)
  for (let h = 23; h >= 0; h--) {
    const ts = new Date(now3 - h * 3600000);
    const baseSize = 42 * 1024 * 1024;
    const growth = h * 100 * 1024;
    healthMetrics.push({
      id: nid("health"),
      type: "db_size",
      value: baseSize - growth + Math.floor(Math.random() * 500000),
      meta: { collections: 28 },
      createdAt: ts.toISOString(),
    });
  }

  // Memory usage trend (24 data points)
  for (let h = 23; h >= 0; h--) {
    const ts = new Date(now3 - h * 3600000);
    const baseMem = 512;
    const usage = baseMem + Math.floor(Math.random() * 128) + (h < 8 ? 64 : 0);
    healthMetrics.push({
      id: nid("health"),
      type: "memory",
      value: usage,
      meta: { totalMb: 2048 },
      createdAt: ts.toISOString(),
    });
  }

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
  erasureRequests.length = 0;
  dataAccessLog.length = 0;
  assignmentSubmissions.length = 0;
  platformAlerts.length = 0;
  auditLogs.length = 0;
  healthMetrics.length = 0;
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


// ── Re-export all module store functions ──────────────────────────
// Every API route imports from @/lib/store → demo-store.  These
// re-exports make the module store functions available under the
// same names they always had.

// School module
export {
  createSchoolAndAdmin,
  searchSchools,
  listSchoolIds,
  getSchoolById,
  updateSchool,
  renameArm,
  rolloverTerm,
  listTermArchives,
  getTermArchiveTerms,
  getTermArchiveDetail,
  deleteSchool,
  purgeSchool,
  purgeExpiredDeletedSchools,
  setSchoolStatus,
  getDashboardStats,
  createLead,
  listLeads,
  updateSchoolSubscription,
  listSchoolSubscriptions,
  startSchoolTrial,
  checkSubscriptionStatus,
} from "@/modules/school/store";

// Users module
export {
  getSchoolUserIds,
  listUsers,
  countUsers,
  findAuthSnapshot,
  findUserById,
  findUserByIdWithAuth,
  findUserByEmail,
  findUserByEmailInSchool,
  findParentByNameInSchool,
  findTeacherByNameInSchool,
  createUser,
  updateRole,
  updateUser,
  getChildren,
  deleteUser,
  logRoleAudit,
  listRoleAudit,
} from "@/modules/users/store";

// Communications module
export {
  createNotification,
  listNotifications,
  markNotificationsRead,
  deleteNotifications,
  markNotificationsReconciled,
  getReminderBatchByKey,
  saveReminderBatch,
  sendMessage,
  getConversation,
  listConversations,
  markMessageRead,
  markConversationRead,
  getUnreadMessageCount,
  getNotificationPreferences,
  getEnabledChannels,
  savePushSubscription,
  listPushSubscriptions,
  removePushSubscriptions,
  deletePushSubscription,
  getDigestPref,
  setDigestPref,
  sendDigest,
  listDigests,
  updateNotificationPreferences,
} from "@/modules/communications/store";

// Fees module
export {
  getFeeStructures,
  saveFeeStructure,
  getFeeLedger,
  recordFeePayment,
  confirmFeePayment,
  logFeeAudit,
  listFeeAudit,
} from "@/modules/fees/store";

// Grading module
export {
  saveScores,
  getScoresByClassSubject,
  getScoresByStudent,
  getScoresBySchool,
  getScoresByClassArm,
  detectAcademicRisks,
  getTeacherPerformance,
} from "@/modules/grading/store";

// Timetable module
export {
  getTimetable,
  saveTimetableEntry,
  deleteTimetableEntry,
  getTimetableConflict,
  getClassAlertPref,
  setClassAlertPref,
  getConflictScan,
  saveConflictScan,
} from "@/modules/timetable/store";

// Attendance module
export {
  getAttendance,
  saveAttendance,
  getStudentAttendanceSummary,
  getStudentAttendanceRecords,
} from "@/modules/attendance/store";

// Resources module
export {
  createSchemeOfWork,
  getSchemesOfWork,
  getSchemeOfWork,
  updateSchemeOfWork,
  deleteSchemeOfWork,
  createClassResource,
  listClassResources,
  getClassResource,
  updateClassResource,
  deleteClassResource,
  createSubmission,
  getSubmissionsForResource,
  getSubmissionForResourceAndStudent,
  getSubmissionsByStudent,
  gradeSubmission,
} from "@/modules/resources/store";

// Alumni module
export {
  createAlumni,
  listAlumni,
  getAlumniRecord,
  updateAlumni,
  deleteAlumni,
  getAlumniStats,
} from "@/modules/alumni/store";

// School module — getAlumni (used by school archives)
export { getAlumni } from "@/modules/school/store";

// Compliance module (GDPR)
export {
  createErasureRequest,
  getErasureRequest,
  listErasureRequests,
  reviewErasureRequest,
  executeErasureRequest,
  logDataAccess,
  listDataAccessLog,
  recordConsent,
  withdrawConsent,
} from "@/modules/compliance/store";

import { seedPlatformAlerts } from "@/modules/platform/store";

// School deletion grace period constant (used by API routes)
export const SCHOOL_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

// Platform alerts + audit log + health module
export {
  createPlatformAlert,
  listPlatformAlerts,
  markAlertsRead,
  markAllAlertsRead,
  getUnreadAlertCount,
  seedPlatformAlerts,
  createAuditLog,
  listAuditLogs,
  getAuditLogStats,
  getAuditHeatmap,
  createImpersonationSession,
  endImpersonationSession,
  getImpersonationSessions,
  getImpersonationSessionDetail,
  recordImpersonationAction,
  recordHealthMetric,
  getHealthDashboard,
  getApiHealthSeries,
} from "@/modules/platform/store";
export {
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  dispatchWebhook,
  listDeliveries,
} from "@/modules/platform/webhooks";
import {
  restoreWebhookState,
  getWebhookSnapshot,
} from "@/modules/platform/webhooks";
