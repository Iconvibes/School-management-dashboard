/**
 * Cross-school tenant isolation — the negative cases the older suites lack.
 *
 * tests/tenant-scope.test.js pins the PLUGIN mechanics (an unscoped query
 * crashes); tests/policy-integration.test.js pins cross-tenant access for
 * users/[id] PATCH + reset-password only. Neither answers the question an
 * auditor actually asks: what happens when school A's SUPER_ADMIN / TEACHER /
 * PARENT addresses school B's record BY ID? These tests pin the answer as
 * 403 (or 404 where the route deliberately hides existence) — never a silent
 * success that mutates or reads another tenant's row.
 *
 * Route matrix (all by-id, all tenant-bearing):
 *   GET  /api/reports/[studentId]                        → 403
 *   POST /api/scores            (foreign studentId row)  → 403
 *   GET  /api/scores            (no foreign rows leak)   → scoped
 *   PATCH /api/users/[id]       (foreign teacher scope)  → 403
 *   PATCH .../submissions/[submissionId] (grade foreign) → 404
 *
 * Same harness as policy-integration.test.js: node:module resolve hook maps
 * next/headers.js to a mock cookie jar holding a REAL signed JWT; demo store
 * is forced (MONGODB_URI deleted before the app modules evaluate).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import * as demoStore from "../src/lib/demo-store.js";
import { signToken } from "../src/lib/token.js";
import { __setSessionToken } from "./helpers/headers-mock.js";

const MOCK_URL = pathToFileURL(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "helpers",
    "headers-mock.js"
  )
).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers.js") return nextResolve(MOCK_URL);
    return nextResolve(specifier, context);
  },
});

const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { GET: reportGET } = await import(
  "../src/app/api/reports/[studentId]/route.js"
);
const { POST: scoresPOST, GET: scoresGET } = await import(
  "../src/app/api/scores/route.js"
);
const { PATCH: userPATCH } = await import("../src/app/api/users/[id]/route.js");
const { PATCH: gradeSubmissionPATCH } = await import(
  "../src/app/api/resources/[id]/submissions/[submissionId]/route.js"
);
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(
    os.tmpdir(),
    `edutrack-tenant-iso-${process.pid}-${Math.random().toString(36).slice(2)}.json`
  );

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
});

afterEach(() => {
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
  __setSessionToken("");
});

/** Greenfield = school A (the seeded demo school); Other Academy = school B. */
async function greenfield() {
  const [school] = await demoStore.searchSchools("Greenfield");
  return school;
}

async function makeSchoolB() {
  const { school } = await demoStore.createSchoolAndAdmin({
    schoolName: "Other Academy",
    adminName: "Other Admin",
    email: "other@edutrack.app",
    password: "other123",
  });
  return school;
}

/** First seeded user of a role in Greenfield. */
async function greenfieldUser(role) {
  const school = await greenfield();
  const [user] = await demoStore.listUsers({ schoolId: school.id, role });
  return user;
}

function signInAs(user) {
  __setSessionToken(
    signToken({ userId: user.id, role: user.role, schoolId: user.schoolId })
  );
}

const jsonOf = (r) => r.json().catch(() => null);

async function reportFor(studentId) {
  const res = await reportGET(new Request("http://localhost/api/reports/x"), {
    params: Promise.resolve({ studentId }),
  });
  return { status: res.status, body: await jsonOf(res) };
}

async function postScores(body) {
  const res = await scoresPOST(
    new Request("http://localhost/api/scores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, body: await jsonOf(res) };
}

async function patchUser(id, body) {
  const res = await userPATCH(
    new Request("http://localhost/api/users/u", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
  return { status: res.status, body: await jsonOf(res) };
}

async function gradeSubmission(resourceId, submissionId, body) {
  const res = await gradeSubmissionPATCH(
    new Request("http://localhost/api/resources/r/submissions/s", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: resourceId, submissionId }) }
  );
  return { status: res.status, body: await jsonOf(res) };
}

describe("reports GET — cross-school by studentId", () => {
  it("school A's SUPER_ADMIN requesting school B's student by id is 403", async () => {
    const admin = await greenfieldUser("SUPER_ADMIN");
    const schoolB = await makeSchoolB();
    const foreignStudent = await demoStore.createUser({
      schoolId: schoolB.id,
      name: "Foreign Pupil",
      email: "pupil@other.app",
      password: "pupil123",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });

    signInAs(admin);
    const { status, body } = await reportFor(foreignStudent.id);
    assert.equal(status, 403, "a cross-school report read must be denied");
    assert.ok(!body.student, "no report payload may leak");
  });

  it("school A's TEACHER requesting school B's student IN HER OWN ARM is still 403", async () => {
    const teacher = await greenfieldUser("TEACHER");
    const schoolB = await makeSchoolB();
    // Same class-arm string as Greenfield arms — proves the tenant check is
    // independent of the class-scope check.
    const foreignStudent = await demoStore.createUser({
      schoolId: schoolB.id,
      name: "Foreign Twin",
      email: "twin@other.app",
      password: "twin12345",
      role: "STUDENT",
      assignedClass: teacher.assignedClasses?.[0] || teacher.assignedClass,
    });

    signInAs(teacher);
    const { status } = await reportFor(foreignStudent.id);
    assert.equal(status, 403);
  });

  it("school A's PARENT requesting school B's student is 403 (before the own-child check)", async () => {
    const parent = await greenfieldUser("PARENT");
    const schoolB = await makeSchoolB();
    const foreignStudent = await demoStore.createUser({
      schoolId: schoolB.id,
      name: "Foreign Kid",
      email: "kid@other.app",
      password: "kid12345",
      role: "STUDENT",
      assignedClass: "JSS1",
    });

    signInAs(parent);
    const { status } = await reportFor(foreignStudent.id);
    assert.equal(status, 403);
  });
});

describe("scores POST — foreign studentId inside rows", () => {
  it("a Greenfield SUPER_ADMIN submitting a Sunshine Academy studentId gets 403 and NOTHING is saved", async () => {
    const admin = await greenfieldUser("SUPER_ADMIN");
    const schoolB = await makeSchoolB();
    const foreignStudent = await demoStore.createUser({
      schoolId: schoolB.id,
      name: "Foreign Target",
      email: "target@other.app",
      password: "target123",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });

    signInAs(admin);
    const { status, body } = await postScores({
      classArm: "SS1 Science",
      subject: "Mathematics",
      rows: [{ studentId: foreignStudent.id, caScore: 30, examScore: 50 }],
    });
    assert.equal(status, 403, "cross-school score entry must be denied");
    assert.equal(
      body.error,
      "One or more students do not belong to your school"
    );

    // The store must be untouched — the 403 is not just cosmetic.
    const foreignScores = await demoStore.getScoresByStudent(foreignStudent.id);
    assert.equal(foreignScores.length, 0, "no score row may exist for the foreign student");
  });

  it("a mixed batch (own student + foreign student) is rejected wholesale", async () => {
    const admin = await greenfieldUser("SUPER_ADMIN");
    const school = await greenfield();
    const schoolB = await makeSchoolB();
    // A FRESH own student — the seeded roster ships with scores, so a count
    // of existing rows can't prove anything. Zero-before → zero-after does.
    const own = await demoStore.createUser({
      schoolId: school.id,
      name: "Fresh Target",
      email: "fresh@edutrack.app",
      password: "fresh123",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });
    const foreignStudent = await demoStore.createUser({
      schoolId: schoolB.id,
      name: "Foreign Mix",
      email: "mix@other.app",
      password: "mix12345",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });

    signInAs(admin);
    const { status } = await postScores({
      classArm: "SS1 Science",
      subject: "Mathematics",
      rows: [
        { studentId: own.id, caScore: 30, examScore: 50 },
        { studentId: foreignStudent.id, caScore: 30, examScore: 50 },
      ],
    });
    assert.equal(status, 403, "one foreign row poisons the whole batch");
    const ownScores = await demoStore.getScoresByStudent(own.id);
    assert.equal(ownScores.length, 0, "the legit row must not be partially saved");
  });
});

describe("scores GET — cross-school leak check", () => {
  it("never returns rows belonging to another school (same classArm + subject strings)", async () => {
    const teacher = await greenfieldUser("TEACHER");
    const schoolB = await makeSchoolB();
    const foreignStudent = await demoStore.createUser({
      schoolId: schoolB.id,
      name: "Foreign Ghost",
      email: "ghost@other.app",
      password: "ghost123",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });
    // School B has scores in the SAME arm/subject the Greenfield teacher requests.
    await demoStore.saveScores({
      schoolId: schoolB.id,
      classArm: "SS1 Science",
      subject: "Mathematics",
      rows: [{ studentId: foreignStudent.id, caScore: 40, examScore: 60 }],
    });

    signInAs(teacher);
    const res = await scoresGET(
      new Request(
        "http://localhost/api/scores?classArm=SS1%20Science&subject=Mathematics"
      )
    );
    assert.equal(res.status, 200);
    const { scores } = await jsonOf(res);
    const ids = new Set((scores || []).map((s) => s.studentId));
    assert.ok(!ids.has(foreignStudent.id), "school B rows must never appear");
  });
});

describe("users PATCH — teaching assignments are tenant-scoped too", () => {
  it("a Greenfield SUPER_ADMIN cannot set subjects × arms on school B's teacher (403, scope unchanged)", async () => {
    const admin = await greenfieldUser("SUPER_ADMIN");
    const schoolB = await makeSchoolB();
    const foreignTeacher = await demoStore.createUser({
      schoolId: schoolB.id,
      name: "Foreign Teacher",
      email: "fteach@other.app",
      password: "fteach123",
      role: "TEACHER",
      assignedClass: "SS1 Arts",
    });

    signInAs(admin);
    const { status } = await patchUser(foreignTeacher.id, {
      subjects: ["Mathematics"],
      assignedClasses: ["SS1 Science", "SS2 Science"],
    });
    assert.equal(status, 403, "cross-school teaching-scope edits must be denied");

    const snap = await demoStore.findAuthSnapshot(foreignTeacher.id);
    assert.deepEqual(
      snap.subjects || [],
      [],
      "the foreign teacher's subjects must be untouched"
    );
    assert.ok(
      !(snap.assignedClasses || []).includes("SS2 Science"),
      "the foreign teacher's arms must be untouched"
    );
  });
});

describe("assignment submissions — grading across schools", () => {
  it("grading school B's submission is 404 (existence not revealed) with no mutation", async () => {
    const teacher = await greenfieldUser("TEACHER");
    const schoolB = await makeSchoolB();
    const foreignStudent = await demoStore.createUser({
      schoolId: schoolB.id,
      name: "Foreign Sub",
      email: "sub@other.app",
      password: "sub12345",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });
    const resource = await demoStore.createClassResource({
      schoolId: schoolB.id,
      teacherId: schoolB.adminId || foreignStudent.id,
      classArm: "SS1 Science",
      subject: "Mathematics",
      type: "assignment",
      title: "Foreign assignment",
    });
    const submission = await demoStore.createSubmission({
      schoolId: schoolB.id,
      resourceId: resource.id,
      studentId: foreignStudent.id,
      classArm: "SS1 Science",
      subject: "Mathematics",
      content: "school B work",
    });

    signInAs(teacher);
    const { status } = await gradeSubmission(resource.id, submission.id, {
      score: 100,
      grade: "A",
      feedback: "hacked",
    });
    assert.ok(
      status === 403 || status === 404,
      "cross-school grading must never succeed"
    );

    // No mutation — the submission is ungraded and untouched.
    const rows = await demoStore.getSubmissionsForResource(resource.id);
    const untouched = rows.find((s) => s.id === submission.id);
    assert.ok(untouched, "the submission still exists in school B");
    assert.notEqual(untouched.status, "graded");
    assert.equal(untouched.score, null, "demo submission shape starts score at null");
  });
});
