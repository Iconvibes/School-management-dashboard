/**
 * 10k-user readiness tests — the concurrency hot-path optimizations, pinned.
 *
 * Covers the store-level primitives behind the scaling work:
 *   - findAuthSnapshot: the lean per-request auth lookup (requireAuth /
 *     requireClassScope now use it instead of the full user row, so a request
 *     storm never pays for building or decrypting the whole user shape).
 *   - getScoresByClassArm: arm-scoped score loads (ranking routes used to
 *     pull the WHOLE school's score table per request).
 *   - getFeeLedger({ studentIds }): the parent portal no longer builds the
 *     full school ledger for a parent with two children.
 *   - listUsers({ limit, offset }) + countUsers: opt-in roster pagination.
 *
 * Plus one route-level test driving the REAL /api/users GET handler through
 * the headers-mock harness (same pattern as policy-integration.test.js) to
 * prove pagination + total work end to end through the actual guards.
 *
 * The Mongo store mirrors these shapes (see mongo-store.js); without a
 * MONGODB_URI the suite drives the demo store, exactly like every other file.
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

// Same next/headers interception as policy-integration.test.js — needed only
// for the route-level test at the bottom of this file.
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
const { GET: usersGET } = await import("../src/app/api/users/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-scaling-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function seedSchoolId() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return match.id;
}

describe("findAuthSnapshot — the lean per-request auth lookup", () => {
  it("returns ONLY the scope fields — no PII, no password, no decrypt work", async () => {
    const schoolId = await seedSchoolId();
    const [admin] = await demoStore.listUsers({ schoolId, role: "SUPER_ADMIN" });
    const snap = await demoStore.findAuthSnapshot(admin.id);
    assert.deepEqual(Object.keys(snap).sort(), [
      "assignedClass",
      "assignedClasses",
      "id",
      "role",
      "schoolId",
      "subjects",
    ]);
    assert.equal(snap.id, admin.id);
    assert.equal(snap.role, "SUPER_ADMIN");
    assert.equal(snap.schoolId, schoolId);
    assert.deepEqual(snap.subjects, []);
    assert.deepEqual(snap.assignedClasses, []);
  });

  it("reflects a role change immediately (the requireAuth re-validation source)", async () => {
    const schoolId = await seedSchoolId();
    const [teacher] = await demoStore.listUsers({ schoolId, role: "TEACHER" });
    assert.equal((await demoStore.findAuthSnapshot(teacher.id)).role, "TEACHER");
    await demoStore.updateRole(teacher.id, "BURSAR");
    assert.equal((await demoStore.findAuthSnapshot(teacher.id)).role, "BURSAR");
  });

  it("returns null for a deleted account — the 401 boundary", async () => {
    const schoolId = await seedSchoolId();
    const doomed = await demoStore.createUser({
      schoolId,
      name: "Doomed",
      email: "doomed-scaling@edutrack.app",
      password: "doom123",
      role: "SUPER_ADMIN",
    });
    await demoStore.deleteUser(doomed.id);
    assert.equal(await demoStore.findAuthSnapshot(doomed.id), null);
  });
});

describe("getScoresByClassArm — arm-scoped score loads", () => {
  it("returns only the requested arm's scores, scoped to the school", async () => {
    const schoolId = await seedSchoolId();
    const armScores = await demoStore.getScoresByClassArm(schoolId, "SS1 Science");
    assert.ok(armScores.length > 0, "the seeded arm has scores");
    for (const s of armScores) {
      assert.equal(s.classArm, "SS1 Science");
      assert.equal(s.schoolId, schoolId);
    }
    // Parity: the arm slice is exactly the whole-school set, filtered.
    const whole = await demoStore.getScoresBySchool(schoolId);
    assert.equal(
      armScores.length,
      whole.filter((s) => s.classArm === "SS1 Science").length
    );
  });
});

describe("getFeeLedger({ studentIds }) — the parent-scoped ledger", () => {
  it("builds ONLY the requested students' rows, matching the full-ledger values", async () => {
    const schoolId = await seedSchoolId();
    const students = await demoStore.listUsers({ schoolId, role: "STUDENT" });
    const [a, b] = students;
    const scoped = await demoStore.getFeeLedger(schoolId, {
      studentIds: [a.id, b.id],
    });
    assert.deepEqual(
      scoped.map((l) => l.studentId).sort(),
      [a.id, b.id].sort()
    );

    // Per-row parity with the unscoped ledger for the same students.
    const full = await demoStore.getFeeLedger(schoolId);
    for (const row of scoped) {
      const match = full.find((l) => l.studentId === row.studentId);
      assert.ok(match, "row exists in the full ledger");
      assert.equal(row.amount, match.amount);
      assert.equal(row.paid, match.paid);
      assert.equal(row.balance, match.balance);
    }
  });
});

describe("listUsers pagination + countUsers", () => {
  it("limit+offset slices the roster, and countUsers reports the true total", async () => {
    const schoolId = await seedSchoolId();
    const total = await demoStore.countUsers({ schoolId, role: "STUDENT" });
    const page = await demoStore.listUsers({
      schoolId,
      role: "STUDENT",
      limit: 4,
      offset: 2,
    });
    assert.equal(page.length, 4);
    assert.equal(total, 16, "the seeded school has 16 students");
    // No overlap between page 0 and page 1 at the same size.
    const page0 = await demoStore.listUsers({ schoolId, role: "STUDENT", limit: 4 });
    const page1 = await demoStore.listUsers({ schoolId, role: "STUDENT", limit: 4, offset: 4 });
    const ids0 = new Set(page0.map((u) => u.id));
    assert.ok(page1.every((u) => !ids0.has(u.id)), "pages do not overlap");
  });

  it("omitting limit keeps the legacy whole-roster behavior", async () => {
    const schoolId = await seedSchoolId();
    const all = await demoStore.listUsers({ schoolId, role: "STUDENT" });
    assert.equal(all.length, 16);
  });

  it("countUsers respects the same filters as listUsers", async () => {
    const schoolId = await seedSchoolId();
    const byArm = await demoStore.countUsers({ schoolId, role: "STUDENT", classArm: "SS1 Science" });
    assert.equal(byArm, 4, "seed has 4 SS1 Science students");
  });
});

describe("/api/users GET — pagination through the real route handler", () => {
  async function getRoster(query) {
    const url = `http://localhost/api/users${query ? `?${query}` : ""}`;
    const res = await usersGET(new Request(url));
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  it("returns users + total when ?limit is given, capped at 500", async () => {
    const schoolId = await seedSchoolId();
    const [admin] = await demoStore.listUsers({ schoolId, role: "SUPER_ADMIN" });
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId }));

    const paged = await getRoster("role=STUDENT&limit=3&offset=6");
    assert.equal(paged.status, 200);
    assert.equal(paged.body.users.length, 3);
    assert.equal(paged.body.total, 16);

    const capped = await getRoster("limit=9999");
    assert.equal(capped.status, 200);
    assert.equal(capped.body.users.length, 36, "whole seeded roster (cap 500 never binds here, but bounds a real 10k school)");
    assert.ok(capped.body.users.length <= 500, "the route's hard cap holds");
  });

  it("without ?limit the legacy payload shape is unchanged (no total key)", async () => {
    const schoolId = await seedSchoolId();
    const [admin] = await demoStore.listUsers({ schoolId, role: "SUPER_ADMIN" });
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId }));

    const full = await getRoster("role=STUDENT");
    assert.equal(full.status, 200);
    assert.equal(full.body.users.length, 16);
    assert.equal("total" in full.body, false, "legacy clients see no total");
  });

  it("paginated listing is still tenant-scoped and permission-gated", async () => {
    const schoolId = await seedSchoolId();
    const [teacher] = await demoStore.listUsers({ schoolId, role: "TEACHER" });
    __setSessionToken(signToken({ userId: teacher.id, role: teacher.role, schoolId }));

    // A teacher may page the student roster but never staff roles.
    const students = await getRoster("role=STUDENT&limit=5");
    assert.equal(students.status, 200);
    const staff = await getRoster("role=TEACHER&limit=5");
    assert.equal(staff.status, 403, "teachers may only list students");
  });
});
