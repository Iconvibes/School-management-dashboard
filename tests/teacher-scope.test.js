/**
 * Subject-specialist teaching model — the Nigerian secondary-school reality
 * where one Mathematics teacher and one English teacher cover ALL twelve
 * class arms (JSS1–JSS3 plain + SS1–SS3 × Science/Arts/Commercial) and
 * English teachers span every class. This suite pins the scope matrix:
 *
 *   - a teacher's classroom scope is SUBJECTS × CLASS ARMS (not one arm)
 *   - requireClassScope enforces arms (validate/resolve/force) and subjects
 *   - legacy single-arm teachers (assignedClass only) keep working
 *   - teaching assignments are SUPER_ADMIN-only through PATCH
 *
 * The seeded demo school ships exactly this shape: Mrs. Okafor teaches
 * Mathematics in all 12 classes; Mrs. Bakare teaches English Language in all
 * 12; Ms. Adeyemi teaches Literature in the three Arts arms.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as demoStore from "../src/lib/demo-store.js";
import { signToken } from "../src/lib/token.js";
import { __setSessionToken } from "./helpers/headers-mock.js";

// Intercept next/headers for the route-level tests at the bottom (same
// harness as policy-integration.test.js).
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
const { requireClassScope, isDenied } = await import("../src/lib/policy.js");
const { PATCH: userPATCH } = await import("../src/app/api/users/[id]/route.js");
const { bounceTeacherSelection } = await import("../src/lib/teacher-scope.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-teacher-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function teacherByEmail(email) {
  const [school] = await demoStore.searchSchools("Greenfield");
  const user = await demoStore.findUserByEmailInSchool(school.id, email);
  return {
    user,
    session: { userId: user.id, role: "TEACHER", schoolId: user.schoolId },
  };
}

const ALL_ARMS = [
  "JSS1", "JSS2", "JSS3",
  "SS1 Science", "SS1 Arts", "SS1 Commercial",
  "SS2 Science", "SS2 Arts", "SS2 Commercial",
  "SS3 Science", "SS3 Arts", "SS3 Commercial",
];

describe("requireClassScope — subject × arms scope", () => {
  it("a Mathematics teacher can access EVERY one of their twelve classes (validate + resolve)", async () => {
    const { user, session } = await teacherByEmail("a.okafor@edutrack.app");
    assert.deepEqual(user.assignedClasses, ALL_ARMS);
    assert.deepEqual(user.subjects, ["Mathematics"]);
    for (const arm of ALL_ARMS) {
      const validate = await requireClassScope(session, { classArm: arm, mode: "validate" });
      assert.equal(isDenied(validate), false, `${arm} validate should pass`);
      const resolve = await requireClassScope(session, { classArm: arm, mode: "resolve" });
      assert.equal(isDenied(resolve), false, `${arm} resolve should pass`);
      assert.equal(resolve.classArm, arm);
    }
  });

  it("an arm OUTSIDE the teacher's set is denied", async () => {
    const { session } = await teacherByEmail("i.nwosu@edutrack.app"); // Physics, Science arms only
    const denied = await requireClassScope(session, { classArm: "SS1 Arts", mode: "validate" });
    assert.equal(isDenied(denied), true);
    assert.equal(denied.status, 403);
  });

  it("subject gate: a Mathematics teacher cannot grade Physics", async () => {
    const { session } = await teacherByEmail("a.okafor@edutrack.app");
    const ok = await requireClassScope(session, {
      classArm: "SS1 Science",
      subject: "Mathematics",
      mode: "resolve",
    });
    assert.equal(isDenied(ok), false, "their own subject passes");
    const denied = await requireClassScope(session, {
      classArm: "SS1 Science",
      subject: "Physics",
      mode: "resolve",
    });
    assert.equal(isDenied(denied), true);
    assert.equal(denied.status, 403);
    assert.equal(
      (await denied.json()).error,
      "You can only enter scores for the subjects you teach"
    );
  });

  it("a two-subject teacher may grade either subject", async () => {
    const { user, session } = await teacherByEmail("s.adeyemi@edutrack.app"); // Literature, Arts arms
    // Adeyemi ships with Literature only — a two-subject scope is a live
    // SUPER_ADMIN assignment, and requireClassScope follows it immediately.
    await demoStore.updateUser(user.id, { subjects: ["Literature in English", "Government"] });
    for (const subject of ["Literature in English", "Government"]) {
      const scope = await requireClassScope(session, {
        classArm: "SS3 Arts",
        subject,
        mode: "resolve",
      });
      assert.equal(isDenied(scope), false, `${subject} passes`);
    }
  });

  it("mode=force falls back to the first assigned arm for an untrusted request", async () => {
    const { user, session } = await teacherByEmail("t.bakare@edutrack.app"); // English, all arms
    const forced = await requireClassScope(session, {
      classArm: "SS3 Arts",
      mode: "force",
    });
    assert.equal(isDenied(forced), false);
    assert.equal(forced.classArm, "SS3 Arts", "a trusted request arm inside the set is kept");
    const fallback = await requireClassScope(session, { classArm: "JSS1 Blue", mode: "force" });
    assert.equal(fallback.classArm, user.assignedClasses[0], "untrusted arm falls back to first");
  });

  it("legacy single-arm teacher (assignedClass only) keeps working", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const legacy = await demoStore.createUser({
      schoolId: school.id,
      name: "Legacy Teacher",
      email: "legacy@edutrack.app",
      password: "legacy123",
      role: "TEACHER",
      assignedClass: "SS1 Science",
    });
    const session = { userId: legacy.id, role: "TEACHER", schoolId: school.id };
    // Snapshot derives the arms array from the legacy assignedClass.
    const snap = await demoStore.findAuthSnapshot(legacy.id);
    assert.deepEqual(snap.assignedClasses, ["SS1 Science"]);

    const ok = await requireClassScope(session, { classArm: "SS1 Science", mode: "validate" });
    assert.equal(isDenied(ok), false);
    const denied = await requireClassScope(session, { classArm: "SS1 Arts", mode: "validate" });
    assert.equal(isDenied(denied), true);
  });

  it("non-teachers (SUPER_ADMIN) pass through untouched with no teacher object", async () => {
    const scope = await requireClassScope(
      { role: "SUPER_ADMIN", schoolId: "sch_x", userId: "u" },
      { classArm: "SS1 Science", subject: "Physics", mode: "validate" }
    );
    assert.equal(isDenied(scope), false);
    assert.equal(scope.teacher, null);
  });
});

describe("users PATCH — teaching assignments are SUPER_ADMIN-only", () => {
  async function seededUser(role) {
    const [match] = await demoStore.searchSchools("Greenfield");
    const [user] = await demoStore.listUsers({ schoolId: match.id, role });
    return user;
  }

  async function patch(id, body, actor) {
    __setSessionToken(
      signToken({ userId: actor.id, role: actor.role, schoolId: actor.schoolId })
    );
    const res = await userPATCH(
      new Request("http://localhost/api/users/u", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  it("SUPER_ADMIN can assign subjects + multiple arms to a teacher", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const teacher = await seededUser("TEACHER");
    const { status, body } = await patch(
      teacher.id,
      { subjects: ["Mathematics", "Further Mathematics"], assignedClasses: ["SS1 Science", "SS2 Science"] },
      admin
    );
    assert.equal(status, 200);
    assert.deepEqual(body.user.subjects, ["Mathematics", "Further Mathematics"]);
    assert.deepEqual(body.user.assignedClasses, ["SS1 Science", "SS2 Science"]);
    // And the scope enforcement follows immediately.
    const snap = await demoStore.findAuthSnapshot(teacher.id);
    assert.deepEqual(snap.subjects, ["Mathematics", "Further Mathematics"]);
  });

  it("REGISTRAR gets 403 trying to set teaching assignments (even on a student)", async () => {
    const registrar = await seededUser("REGISTRAR");
    const student = await seededUser("STUDENT");
    const { status, body } = await patch(student.id, { subjects: ["Mathematics"] }, registrar);
    assert.equal(status, 403);
    assert.equal(body.error, "Forbidden");
  });

  it("REGISTRAR may still edit a student when the payload carries EMPTY arrays (the console's shared form shape)", async () => {
    const registrar = await seededUser("REGISTRAR");
    const student = await seededUser("STUDENT");
    const { status, body } = await patch(
      student.id,
      { name: "Renamed Kid", subjects: [], assignedClasses: [] },
      registrar
    );
    assert.equal(status, 200, "empty arrays must never trip the SUPER_ADMIN gate");
    assert.equal(body.user.name, "Renamed Kid");
  });

  it("malformed arrays are a 400", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const teacher = await seededUser("TEACHER");
    const { status, body } = await patch(teacher.id, { subjects: "Mathematics" }, admin);
    assert.equal(status, 400);
    assert.equal(body.error, "subjects must be an array of strings");
  });
});

describe("bounceTeacherSelection — live dashboard enforcement", () => {
  // The dashboard re-reads /api/auth/me on a cadence + on tab focus; when the
  // admin revoked the currently selected arm or subject, the selector must
  // bounce onto the first valid value instead of sitting on a stale (403-ing)
  // selection. These tests pin the pure bounce logic.
  const ALL = ["JSS1 Science", "SS1 Science", "SS1 Arts"];

  it("a revoked arm bounces to the first valid one", () => {
    const out = bounceTeacherSelection({
      currentArm: "SS2 Science", // revoked by the admin
      currentSubject: "Mathematics",
      assignedClasses: ALL,
      subjects: ["Mathematics"],
      schoolArms: ALL,
      allSubjects: ["Mathematics", "English Language"],
    });
    assert.equal(out.classArm, "JSS1 Science", "first assigned arm wins");
    assert.equal(out.subject, "Mathematics", "a still-valid subject is untouched");
  });

  it("a revoked subject bounces to the first valid one", () => {
    const out = bounceTeacherSelection({
      currentArm: "SS1 Science",
      currentSubject: "Physics", // revoked — she only teaches Mathematics now
      assignedClasses: ALL,
      subjects: ["Mathematics"],
      schoolArms: ALL,
      allSubjects: ["Mathematics", "Physics", "Chemistry"],
    });
    assert.equal(out.subject, "Mathematics");
    assert.equal(out.classArm, "SS1 Science", "a still-valid arm is untouched");
  });

  it("a valid selection passes through unchanged (no churn on every poll)", () => {
    const out = bounceTeacherSelection({
      currentArm: "SS1 Arts",
      currentSubject: "Mathematics",
      assignedClasses: ALL,
      subjects: ["Mathematics"],
      schoolArms: ALL,
      allSubjects: ["Mathematics"],
    });
    assert.deepEqual(out, { classArm: "SS1 Arts", subject: "Mathematics" });
  });

  it("an empty selection bounces to the first valid values on first load", () => {
    const out = bounceTeacherSelection({
      currentArm: "",
      currentSubject: "",
      assignedClasses: ALL,
      subjects: ["Mathematics", "Further Mathematics"],
      schoolArms: ALL,
      allSubjects: ["Mathematics"],
    });
    assert.deepEqual(out, { classArm: "JSS1 Science", subject: "Mathematics" });
  });

  it("legacy single-arm teacher (assignedClass only) bounces to that one arm", () => {
    const out = bounceTeacherSelection({
      currentArm: "SS2 Science", // stale — they were never assigned there
      currentSubject: "",
      assignedClass: "SS1 Arts",
      schoolArms: ALL,
      allSubjects: ["Mathematics"],
    });
    assert.equal(out.classArm, "SS1 Arts");
  });

  it("unassigned teacher falls back to the school's arms (legacy behavior)", () => {
    const out = bounceTeacherSelection({
      currentArm: "SS1 Science", // still valid — the school offers it
      currentSubject: "Mathematics",
      assignedClasses: [],
      assignedClass: "",
      subjects: [],
      schoolArms: ALL,
      allSubjects: ["Mathematics"],
    });
    assert.equal(out.classArm, "SS1 Science", "school arms are the valid set");
    assert.equal(out.subject, "Mathematics");
  });

  it("nothing valid anywhere → the selection passes through (no phantom bounce)", () => {
    const out = bounceTeacherSelection({
      currentArm: "SS1 Science",
      currentSubject: "Mathematics",
      assignedClasses: [],
      assignedClass: "",
      subjects: [],
      schoolArms: [],
      allSubjects: ["Mathematics"],
    });
    assert.deepEqual(out, { classArm: "SS1 Science", subject: "Mathematics" });
  });

  it("both arm AND subject revoked bounce together", () => {
    const out = bounceTeacherSelection({
      currentArm: "SS2 Science",
      currentSubject: "Physics",
      assignedClasses: ["JSS1 Arts"],
      subjects: ["English Language"],
      schoolArms: ALL,
      allSubjects: ["Mathematics", "English Language"],
    });
    assert.deepEqual(out, { classArm: "JSS1 Arts", subject: "English Language" });
  });
});

describe("demo seed — realistic subject-specialist teachers", () => {
  it("the sixteen seeded teachers span subjects × arms, not one arm each", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const teachers = await demoStore.listUsers({ schoolId: school.id, role: "TEACHER" });
    assert.equal(teachers.length, 16);
    const maths = teachers.find((t) => t.email === "a.okafor@edutrack.app");
    assert.deepEqual(maths.subjects, ["Mathematics"]);
    assert.deepEqual(maths.assignedClasses, ALL_ARMS);
    // The headline case: ONE English teacher for JSS1–SS3 × every stream.
    const english = teachers.find((t) => t.email === "t.bakare@edutrack.app");
    assert.deepEqual(english.subjects, ["English Language"]);
    assert.deepEqual(english.assignedClasses, ALL_ARMS);
    const civic = teachers.find((t) => t.email === "b.fagbemi@edutrack.app");
    assert.deepEqual(civic.assignedClasses, ALL_ARMS);
    // Physics teacher: science arms only (JSS classes are plain — no streams).
    const physics = teachers.find((t) => t.email === "i.nwosu@edutrack.app");
    assert.deepEqual(physics.assignedClasses, [
      "SS1 Science", "SS2 Science", "SS3 Science",
    ]);
    // Economics serves arts + commercial, never science.
    const econ = teachers.find((t) => t.email === "n.eze@edutrack.app");
    assert.ok(econ.assignedClasses.includes("SS1 Arts"));
    assert.ok(econ.assignedClasses.includes("SS3 Commercial"));
    assert.ok(!econ.assignedClasses.includes("SS1 Science"));
  });
});
