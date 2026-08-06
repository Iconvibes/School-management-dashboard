/**
 * Quick-batch add engine tests (Phase 2).
 *
 * Covers:
 *   1. parseNames  — free-form text -> clean name list (markers, commas,
 *                    whitespace, case-insensitive dedupe)
 *   2. planQuickAdd — the name+arm duplicate guard on top of the shared planner
 *   3. End-to-end — applyImport against the seeded demo store, exactly what
 *                    POST /api/users/quick-add does
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseNames, planQuickAdd, applyImport, buildCredentials } from "../src/lib/quick-add.js";
import { schoolDomain } from "../src/lib/importer.js";
import * as demoStore from "../src/lib/demo-store.js";

const DOMAIN = schoolDomain("Greenfield International School");

let school;
let existingUsers;

beforeEach(async () => {
  demoStore.__resetDemoStore();
  const schools = await demoStore.searchSchools("Greenfield");
  school = await demoStore.getSchoolById(schools[0].id);
  existingUsers = await demoStore.listUsers({ schoolId: school.id });
});

// ---- parseNames --------------------------------------------------------------

describe("parseNames", () => {
  it("parses one name per line", () => {
    assert.deepEqual(parseNames("Kunle Adebayo\nChidinma Obi\n"), [
      "Kunle Adebayo",
      "Chidinma Obi",
    ]);
  });

  it("strips list markers and numbers", () => {
    assert.deepEqual(parseNames("1. Kunle Adebayo\n2) Chidinma Obi\n- Amina Suleiman\n• Tunde Bakare\n"), [
      "Kunle Adebayo",
      "Chidinma Obi",
      "Amina Suleiman",
      "Tunde Bakare",
    ]);
  });

  it("splits comma-separated names on the same line", () => {
    assert.deepEqual(parseNames("Kunle Adebayo, Chidinma Obi, Amina Suleiman"), [
      "Kunle Adebayo",
      "Chidinma Obi",
      "Amina Suleiman",
    ]);
  });

  it("keeps the Last, First convention as one name", () => {
    // "Adebayo, Kunle" is the Excel "Last, First" order — it must not split
    // into two single-word students.
    assert.deepEqual(parseNames("Adebayo, Kunle"), ["Adebayo Kunle"]);
    assert.deepEqual(parseNames("Adebayo, Kunle, Chidinma Obi"), [
      "Adebayo Kunle",
      "Chidinma Obi",
    ]);
  });

  it("collapses inner whitespace and drops empties", () => {
    assert.deepEqual(parseNames("  Kunle   Adebayo  \n\n   \nChidinma Obi\n"), [
      "Kunle Adebayo",
      "Chidinma Obi",
    ]);
  });

  it("de-duplicates case-insensitively", () => {
    assert.deepEqual(parseNames("Kunle Adebayo\nkunle adebayo\nKUNLE ADEBAYO"), [
      "Kunle Adebayo",
    ]);
  });

  it("returns [] for empty or whitespace-only input", () => {
    assert.deepEqual(parseNames(""), []);
    assert.deepEqual(parseNames("   \n  \n"), []);
    assert.deepEqual(parseNames(undefined), []);
  });
});

// ---- planQuickAdd ------------------------------------------------------------

describe("planQuickAdd", () => {
  const base = (names, overrides = {}) =>
    planQuickAdd({
      names,
      classArm: "SS1 Science",
      schoolName: school.name,
      activeArms: school.activeArms,
      existingUsers,
      defaultPassword: "edutrack123",
      ...overrides,
    });

  it("plans valid names with auto-generated logins", () => {
    const p = base(["Amina Suleiman", "Oluwaseun Adeyemi"]);
    assert.equal(p.summary.total, 2);
    assert.equal(p.summary.ok, 2);
    assert.equal(p.summary.duplicates, 0);
    assert.equal(p.summary.errors, 0);
    assert.deepEqual(
      p.plans.map((r) => r.email),
      [`amina.suleiman@${DOMAIN}`, `oluwaseun.adeyemi@${DOMAIN}`]
    );
    assert.ok(p.plans.every((r) => r.password === "edutrack123"));
    assert.ok(p.plans.every((r) => r.assignedClass === "SS1 Science"));
  });

  it("flags existing students with the same name in the same arm", () => {
    // The seed school has a "Kunle Adebayo" student in SS1 Science.
    const p = base(["Kunle Adebayo", "Brand New Student"]);
    assert.equal(p.summary.ok, 1);
    assert.equal(p.summary.duplicates, 1);
    const dup = p.plans.find((r) => r.status === "duplicate");
    assert.equal(dup.name, "Kunle Adebayo");
    assert.ok(dup.error.includes("already in this class"));
  });

  it("does not flag the same name in a different arm", () => {
    const p = base(["Kunle Adebayo"], { classArm: "SS2 Arts" });
    assert.equal(p.summary.ok, 1);
    assert.equal(p.summary.duplicates, 0);
  });

  it("gives repeated names within the batch suffixed emails", () => {
    const p = base(["Amina Suleiman", "Amina Suleiman"]);
    assert.equal(p.summary.total, 2);
    assert.equal(p.summary.ok, 2); // distinct emails: amina.suleiman, amina.suleiman2
    assert.equal(new Set(p.plans.map((r) => r.email)).size, 2);
  });
});

// ---- end-to-end through the demo store ---------------------------------------

describe("quick-add end-to-end (demo store)", () => {
  it("creates the planned students with logins and credentials", async () => {
    const names = ["Amina Suleiman", "Halima Suleiman", "Tunde Bakare"];
    const p = planQuickAdd({
      names,
      classArm: "SS2 Science",
      schoolName: school.name,
      activeArms: school.activeArms,
      existingUsers,
      defaultPassword: "edutrack123",
    });
    assert.equal(p.summary.ok, 3);

    const applied = await applyImport({
      store: demoStore,
      schoolId: school.id,
      role: "STUDENT",
      plans: p.plans,
      parentRefs: p.parentRefs,
      newArms: p.newArms,
    });
    assert.equal(applied.created.students, 3);
    assert.deepEqual(applied.failed, []);

    const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    for (const name of names) {
      const s = students.find((x) => x.name === name);
      assert.ok(s, `${name} was created`);
      assert.equal(s.assignedClass, "SS2 Science");
      assert.ok(s.email.endsWith(`@${DOMAIN}`));
    }

    // Credentials sheet covers exactly the created students.
    const creds = buildCredentials("STUDENT", p.plans, p.parentRefs);
    assert.equal(creds.length, 3);
    assert.ok(creds.every((c) => c.password === "edutrack123"));
  });

  it("re-running the same list creates nothing new", async () => {
    const names = ["Amina Suleiman"];
    const run = async () => {
      const p = planQuickAdd({
        names,
        classArm: "SS1 Science",
        schoolName: school.name,
        activeArms: school.activeArms,
        existingUsers: await demoStore.listUsers({ schoolId: school.id }),
        defaultPassword: "edutrack123",
      });
      const applied = await applyImport({
        store: demoStore,
        schoolId: school.id,
        role: "STUDENT",
        plans: p.plans,
        parentRefs: p.parentRefs,
        newArms: p.newArms,
      });
      return { p, applied };
    };

    const first = await run();
    assert.equal(first.p.summary.ok, 1);
    assert.equal(first.applied.created.students, 1);

    const second = await run();
    assert.equal(second.p.summary.duplicates, 1);
    assert.equal(second.p.summary.ok, 0);
    assert.equal(second.applied.created.students, 0);
  });
});
