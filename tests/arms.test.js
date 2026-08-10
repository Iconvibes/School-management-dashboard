/**
 * Custom class-arm modeling tests.
 *
 * Arms are free-form strings end to end — a school can model its own JSS
 * structure ("JSS1 A", "JSS1 B", "JSS1 Blue"…) and every feature (timetable,
 * teacher scopes, fees, attendance, report cards) keys off those names. This
 * suite pins the pure helpers that power the splitter UI, plus an API
 * round-trip: the real school PATCH accepts and persists custom arm names for
 * the SUPER_ADMIN, and rejects staff without school.edit.
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
import { ARM_SUFFIX_SETS, armAlreadyExists, buildArmVariants } from "../src/lib/arms.js";

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
const { PATCH } = await import("../src/app/api/school/route.js");
const { POST: renameArmPost } = await import("../src/app/api/school/rename-arm/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-arms-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
});

afterEach(() => {
  __setSessionToken("");
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

describe("buildArmVariants — streamed JSS arms", () => {
  it("generates full names from a base + suffixes", () => {
    assert.deepEqual(buildArmVariants("JSS1", ["A", "B"]), ["JSS1 A", "JSS1 B"]);
    assert.deepEqual(
      buildArmVariants("JSS1", ARM_SUFFIX_SETS.colours.slice(0, 2)),
      ["JSS1 Blue", "JSS1 Gold"]
    );
  });

  it("returns [] for an empty base or empty suffixes", () => {
    assert.deepEqual(buildArmVariants("", ["A"]), []);
    assert.deepEqual(buildArmVariants("   ", ["A"]), []);
    assert.deepEqual(buildArmVariants("JSS1", []), []);
    assert.deepEqual(buildArmVariants("JSS1", ["  "]), []);
  });

  it("keeps custom suffixes intact (Pre-Nursery style)", () => {
    assert.deepEqual(buildArmVariants("Nursery", ["Red", "Green"]), ["Nursery Red", "Nursery Green"]);
  });
});

describe("armAlreadyExists — case-insensitive dedupe", () => {
  it("treats jss1 a and JSS1 A as the same arm", () => {
    assert.equal(armAlreadyExists(["JSS1 A", "SS1 Science"], "jss1 a"), true);
    assert.equal(armAlreadyExists(["JSS1 A"], "JSS1 A"), true);
  });

  it("does not false-positive on partial matches", () => {
    assert.equal(armAlreadyExists(["JSS1"], "JSS1 Blue"), false);
    assert.equal(armAlreadyExists(["JSS1 A"], "JSS1"), false);
    assert.equal(armAlreadyExists(["SS1 Science"], "JSS1 Science"), false);
  });

  it("ignores empty names and missing lists", () => {
    assert.equal(armAlreadyExists(["JSS1"], ""), false);
    assert.equal(armAlreadyExists(undefined, "JSS1"), false);
  });
});

describe("school PATCH — custom arm names through the real API", () => {
  async function patchArms(actor, arms) {
    const res = await PATCH(
      new Request("http://localhost/api/school", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activeArms: arms }),
      })
    );
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  it("SUPER_ADMIN saves streamed JSS arms and they persist", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const custom = ["JSS1", "JSS1 A", "JSS1 B", "JSS1 Blue", "SS1 Science"];
    const res = await patchArms(admin, custom);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.school.activeArms, custom);

    // Persisted — a fresh read returns the same arms.
    const stored = await demoStore.getSchoolById(school.id);
    assert.deepEqual(stored.activeArms, custom);
  });

  it("a BURSAR without school.edit gets 403", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const bursar = await demoStore.findUserByEmailInSchool(school.id, "bursar@edutrack.app");
    __setSessionToken(signToken({ userId: bursar.id, role: bursar.role, schoolId: school.id }));

    const res = await patchArms(bursar, ["JSS1 A"]);
    assert.equal(res.status, 403);
  });
});

describe("renameArm — atomic arm rename across every reference", () => {
  it("migrates activeArms, users, fees, scores, attendance and timetable", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");

    const before = {
      students: (await demoStore.listUsers({ schoolId: school.id, role: "STUDENT", classArm: "JSS2" })).length,
      teachers: (await demoStore.listUsers({ schoolId: school.id, role: "TEACHER" })).filter((t) =>
        t.assignedClasses?.includes("JSS2") || t.assignedClass === "JSS2"
      ).length,
      fees: (await demoStore.getFeeStructures(school.id)).filter((f) => f.classArm === "JSS2").length,
      scores: (await demoStore.getScoresByClassArm(school.id, "JSS2")).length,
      timetable: (await demoStore.getTimetable({ schoolId: school.id, classArm: "JSS2" })).length,
    };
    assert.ok(before.students > 0, "seed should have JSS2 students");
    assert.ok(before.timetable > 0, "seed should have JSS2 timetable slots");

    const result = await demoStore.renameArm(school.id, "JSS2", "JSS2 Blue");
    assert.ok(!result.error, `rename should succeed: ${result.error || ""}`);
    assert.ok(result.school.activeArms.includes("JSS2 Blue"));
    assert.ok(!result.school.activeArms.includes("JSS2"));
    assert.equal(result.counts.students, before.students);
    assert.equal(result.counts.teachers, before.teachers);
    assert.equal(result.counts.feeStructures, before.fees);
    assert.equal(result.counts.scores, before.scores);
    assert.ok(result.counts.attendance > 0, "attendance registers should have migrated");
    assert.equal(result.counts.timetable, before.timetable);

    // Every reference moved.
    assert.equal((await demoStore.listUsers({ schoolId: school.id, role: "STUDENT", classArm: "JSS2" })).length, 0);
    assert.equal(
      (await demoStore.listUsers({ schoolId: school.id, role: "STUDENT", classArm: "JSS2 Blue" })).length,
      before.students
    );
    assert.equal(
      (await demoStore.getFeeStructures(school.id)).filter((f) => f.classArm === "JSS2").length,
      0
    );
    assert.equal(
      (await demoStore.getFeeStructures(school.id)).filter((f) => f.classArm === "JSS2 Blue").length,
      before.fees
    );
    assert.equal((await demoStore.getScoresByClassArm(school.id, "JSS2")).length, 0);
    assert.equal((await demoStore.getScoresByClassArm(school.id, "JSS2 Blue")).length, before.scores);
    assert.equal((await demoStore.getTimetable({ schoolId: school.id, classArm: "JSS2" })).length, 0);
    assert.equal(
      (await demoStore.getTimetable({ schoolId: school.id, classArm: "JSS2 Blue" })).length,
      before.timetable
    );
    // Teachers carrying JSS2 in their multi-arm scope now carry JSS2 Blue.
    const teachers = await demoStore.listUsers({ schoolId: school.id, role: "TEACHER" });
    assert.ok(
      teachers.some((t) => t.assignedClasses?.includes("JSS2 Blue")),
      "a teacher scope should now reference JSS2 Blue"
    );
    assert.ok(
      teachers.every((t) => !t.assignedClasses?.includes("JSS2") && t.assignedClass !== "JSS2"),
      "no teacher should reference the old name"
    );
  });

  it("rejects an unknown source arm", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const result = await demoStore.renameArm(school.id, "JSS9", "JSS9 Blue");
    assert.ok(result.error);
    assert.match(result.error, /not one of the school's class arms/);
  });

  it("rejects a case-insensitive collision with an existing arm", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const result = await demoStore.renameArm(school.id, "JSS1", "jss2");
    assert.ok(result.error);
    assert.match(result.error, /already a class arm/);
  });

  it("rejects an empty or unchanged target", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    assert.ok((await demoStore.renameArm(school.id, "JSS1", "")).error);
    assert.ok((await demoStore.renameArm(school.id, "JSS1", "JSS1")).error);
  });
});

describe("POST /api/school/rename-arm — through the real API", () => {
  async function postRename(actor, from, to) {
    const res = await renameArmPost(
      new Request("http://localhost/api/school/rename-arm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from, to }),
      })
    );
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  it("SUPER_ADMIN renames and the new name persists", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const res = await postRename(admin, "SS1 Science", "SS1 Physics");
    assert.equal(res.status, 200);
    assert.ok(res.body.school.activeArms.includes("SS1 Physics"));
    assert.ok(!res.body.school.activeArms.includes("SS1 Science"));
    assert.ok(res.body.counts.timetable > 0, "timetable slots should have migrated");
    // Persisted — a fresh read returns the renamed arm.
    const stored = await demoStore.getSchoolById(school.id);
    assert.ok(stored.activeArms.includes("SS1 Physics"));
  });

  it("rejects a collision with 400", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const res = await postRename(admin, "JSS1", "JSS2");
    assert.equal(res.status, 400);
    assert.match(res.body.error, /already a class arm/);
  });

  it("a BURSAR without school.edit gets 403", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const bursar = await demoStore.findUserByEmailInSchool(school.id, "bursar@edutrack.app");
    __setSessionToken(signToken({ userId: bursar.id, role: bursar.role, schoolId: school.id }));

    const res = await postRename(bursar, "JSS1", "JSS1 Blue");
    assert.equal(res.status, 403);
  });
});
