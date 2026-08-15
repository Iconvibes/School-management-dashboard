/**
 * Tenant-scope plugin — REAL Mongo integration test.
 *
 * Requires a live MongoDB: run with MONGODB_URI set, e.g.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27018/edutrack_tenant_scope npm test -- tests/tenant-scope.test.js
 *
 * (or `node --test --import ./tests/register-aliases.js tests/tenant-scope.test.js`).
 * Without MONGODB_URI the whole file skips — the regular suite runs in demo
 * mode, where the plugin (Mongo-only) doesn't apply.
 *
 * The file imports mongo-store FIRST on purpose: its module body applies the
 * plugin to every tenant model, so the direct model queries below exercise
 * the guards for real.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const hasMongo = !!process.env.MONGODB_URI;
const describeMongo = hasMongo ? describe : describe.skip;

// Import order matters: mongo-store applies the tenant-scope plugin.
// (Aliases in tests/register-aliases.js resolve "@/..." under plain node.)
if (hasMongo) {
  await import("../src/lib/mongo-store.js");
}

const { store } = hasMongo
  ? await import("../src/lib/store.js")
  : { store: null };
const { default: User } = hasMongo ? await import("../src/models/User.js") : { default: null };
const { default: Score } = hasMongo ? await import("../src/models/Score.js") : { default: null };
const { default: mongoose } = hasMongo ? await import("mongoose") : { default: null };
const { bypassTenantScope } = hasMongo ? await import("../src/lib/tenant-scope.js") : { bypassTenantScope: null };

describeMongo("tenant-scope plugin (real Mongo)", () => {
  let schoolId;
  let studentId;

  it("scoped queries pass end-to-end (createSchoolAndAdmin + scoped reads)", async () => {
    const { school, user } = await store.createSchoolAndAdmin({
      schoolName: "Tenant Scope School",
      adminName: "Scope Admin",
      email: "scope-admin@tenant.test",
      password: "secret123",
    });
    schoolId = school.id;
    assert.ok(schoolId);

    // Regression pin for the Mongoose 9 middleware bug: the User pre("save")
    // hook must actually hash the password (the old callback form crashed
    // every real Mongo save — demo-mode tests never exercised it).
    // (Querying by id, not email — emails are encrypted at rest.)
    const raw = await import("bcrypt");
    const doc = await bypassTenantScope(User.findById(user.id));
    assert.notEqual(doc.password, "secret123");
    assert.equal(await raw.compare("secret123", doc.password), true);

    const byEmail = await store.findUserByEmailInSchool(schoolId, "scope-admin@tenant.test");
    assert.equal(byEmail.id, user.id);

    const created = await store.createUser({
      schoolId,
      name: "Tessa Pupil",
      email: "tessa@tenant.test",
      password: "pupil123",
      role: "STUDENT",
      assignedClass: "JSS1",
    });
    studentId = created.id;
    assert.ok(studentId);

    const roster = await store.listUsers({ schoolId, role: "STUDENT" });
    assert.ok(roster.some((u) => u.id === studentId));
  });

  it("throws on an unscoped findOne", async () => {
    await assert.rejects(
      User.findOne({ email: "anyone@anywhere.test" }),
      /Tenant-scope violation: User\.findOne/
    );
  });

  it("throws on an unscoped aggregate", async () => {
    await assert.rejects(
      Score.aggregate([{ $group: { _id: "$classArm", n: { $sum: 1 } } }]),
      /Tenant-scope violation: Score\.aggregate/
    );
  });

  it("scoped aggregate passes", async () => {
    const rows = await Score.aggregate([
      { $match: { schoolId } },
      { $group: { _id: "$classArm", n: { $sum: 1 } } },
    ]);
    assert.ok(Array.isArray(rows));
  });

  it("bypassTenantScope() admits the by-id escape hatch", async () => {
    const found = await bypassTenantScope(User.findById(studentId));
    assert.ok(found);
    assert.equal(String(found._id), studentId);
  });

  it("rejects a tenant document saved without schoolId", async () => {
    await assert.rejects(
      new Score({ subject: "Maths", classArm: "JSS1" }).save(),
      /Tenant-scope violation: Score document created without schoolId/
    );
  });

  it("cleanup: drop the scratch database", async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
});
