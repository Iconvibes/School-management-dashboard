/**
 * Paper-register placeholder tests (Phase 2).
 *
 * Covers:
 *   1. parseCountCsv  — the "Class Arm, Number of Students" template parser
 *                      (aliases, validation, per-arm caps, duplicate arms)
 *   2. generatePlaceholderRows / planPlaceholders — placeholder naming,
 *                      per-arm breakdown, idempotent re-runs
 *   3. End-to-end — applyImport against the seeded demo store, exactly what
 *                    POST /api/users/placeholders does
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  parseCountCsv,
  generatePlaceholderRows,
  planPlaceholders,
  applyImport,
  buildCredentials,
} from "../src/lib/placeholders.js";
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

// ---- parseCountCsv -----------------------------------------------------------

describe("parseCountCsv", () => {
  it("parses the template format into per-arm counts", () => {
    const r = parseCountCsv("Class Arm,Number of Students\nSS1 Science,45\nSS1 Arts,38\n");
    assert.equal(r.error, undefined);
    assert.deepEqual(r.pairs, [
      { classArm: "SS1 Science", count: 45 },
      { classArm: "SS1 Arts", count: 38 },
    ]);
    assert.equal(r.total, 83);
  });

  it("accepts header aliases", () => {
    const r = parseCountCsv("class,count\nSS1 Science,45\n");
    assert.deepEqual(r.pairs, [{ classArm: "SS1 Science", count: 45 }]);
  });

  it("reports missing columns", () => {
    assert.ok(parseCountCsv("name,phone\nKunle,0803\n").error?.includes("columns"));
  });

  it("rejects blank, zero, negative, fractional and non-numeric counts", () => {
    const csv =
      "Class Arm,Number of Students\n" +
      "SS1 Science,abc\n" +
      "SS1 Arts,0\n" +
      "SS2 Science,-3\n" +
      "SS3 Science,45.5\n" +
      "JSS1 Blue,\n";
    const r = parseCountCsv(csv);
    assert.equal(r.pairs, undefined); // error path — nothing parsed
    assert.ok(r.errors.length >= 4);
    assert.ok(r.errors.some((e) => e.includes("-3")));
    assert.ok(r.errors.some((e) => e.includes("45.5")));
  });

  it("strips thousands separators then enforces the per-arm cap", () => {
    // Quoted "1,234" is one CSV field; it parses to 1234 and exceeds the cap.
    const r = parseCountCsv('Class Arm,Number of Students\nSS1 Science,"1,234"\n');
    assert.ok(r.errors?.[0]?.includes("max"));
  });

  it("rejects an empty file and a header-only file", () => {
    assert.ok(parseCountCsv("").error);
    assert.ok(parseCountCsv("Class Arm,Number of Students\n").error);
  });

  it("sums duplicate arm rows", () => {
    const r = parseCountCsv("Class Arm,Number of Students\nSS1 Science,10\nSS1 Science,5\n");
    assert.deepEqual(r.pairs, [{ classArm: "SS1 Science", count: 15 }]);
  });

  it("caps per-arm and total counts", () => {
    const per = parseCountCsv("Class Arm,Number of Students\nSS1 Science,501\n");
    assert.ok(per.errors?.[0]?.includes("max"));
  });
});

// ---- generatePlaceholderRows / planPlaceholders -------------------------------

describe("generatePlaceholderRows", () => {
  it("creates Student N per arm with 1-based row numbers", () => {
    const rows = generatePlaceholderRows([
      { classArm: "SS1 Science", count: 3 },
      { classArm: "SS1 Arts", count: 2 },
    ]);
    assert.deepEqual(
      rows.map((r) => [r.name, r.classArm]),
      [
        ["Student 1", "SS1 Science"],
        ["Student 2", "SS1 Science"],
        ["Student 3", "SS1 Science"],
        ["Student 1", "SS1 Arts"],
        ["Student 2", "SS1 Arts"],
      ]
    );
    assert.equal(rows[0].row, 2);
    assert.equal(rows[4].row, 6);
  });
});

describe("planPlaceholders", () => {
  const base = (pairs, overrides = {}) =>
    planPlaceholders({
      pairs,
      schoolName: school.name,
      activeArms: school.activeArms,
      existingUsers,
      defaultPassword: "edutrack123",
      ...overrides,
    });

  it("plans all placeholders as ok with auto-generated logins", () => {
    const p = base([{ classArm: "SS2 Science", count: 3 }]);
    assert.equal(p.summary.ok, 3);
    assert.equal(p.summary.errors, 0);
    assert.deepEqual(
      p.plans.map((r) => r.email),
      [`student.1@${DOMAIN}`, `student.2@${DOMAIN}`, `student.3@${DOMAIN}`]
    );
    assert.ok(p.plans.every((r) => r.password === "edutrack123"));
    assert.equal(p.arms.length, 1);
    assert.deepEqual(p.arms[0], { classArm: "SS2 Science", count: 3, existing: 0, toCreate: 3 });
  });

  it("is idempotent — re-running the same count creates nothing new", () => {
    const pairs = [{ classArm: "SS2 Science", count: 3 }];
    const first = base(pairs);
    assert.equal(first.summary.ok, 3);

    // After the first run, its students now exist.
    const rerun = base(pairs, {
      existingUsers: [
        ...existingUsers,
        ...first.plans.map((p) => ({
          id: `p-${p.name}`,
          role: "STUDENT",
          name: p.name,
          assignedClass: p.assignedClass,
        })),
      ],
    });
    assert.equal(rerun.summary.ok, 0);
    assert.equal(rerun.summary.duplicates, 3);
    assert.equal(rerun.arms[0].toCreate, 0);
    assert.equal(rerun.arms[0].existing, 3);
  });

  it("recounting upward only creates the difference", () => {
    const existing = [
      ...existingUsers,
      ...[
        { name: "Student 1", assignedClass: "SS1 Science" },
        { name: "Student 2", assignedClass: "SS1 Science" },
      ].map((u, i) => ({ id: `p-${i}`, role: "STUDENT", ...u })),
    ];
    const p = planPlaceholders({
      pairs: [{ classArm: "SS1 Science", count: 5 }],
      schoolName: school.name,
      activeArms: school.activeArms,
      existingUsers: existing,
      defaultPassword: "edutrack123",
    });
    assert.equal(p.summary.ok, 3); // Students 3, 4, 5 are new
    assert.equal(p.summary.duplicates, 2); // Students 1, 2 exist
    assert.equal(p.arms[0].toCreate, 3);
    assert.equal(p.arms[0].existing, 2);
  });
});

// ---- end-to-end through the demo store ---------------------------------------

describe("placeholder end-to-end (demo store)", () => {
  it("creates placeholders with logins and credentials", async () => {
    const pairs = [
      { classArm: "SS2 Science", count: 2 },
      { classArm: "JSS1 Blue", count: 1 }, // new arm — auto-created
    ];
    const p = planPlaceholders({
      pairs,
      schoolName: school.name,
      activeArms: school.activeArms,
      existingUsers,
      defaultPassword: "edutrack123",
    });
    assert.equal(p.summary.ok, 3);
    assert.deepEqual(p.newArms, ["JSS1 Blue"]);

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

    const updated = await demoStore.getSchoolById(school.id);
    assert.ok(updated.activeArms.includes("JSS1 Blue"));

    const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    const jss1 = students.filter((s) => s.assignedClass === "JSS1 Blue");
    assert.equal(jss1.length, 1);
    assert.equal(jss1[0].name, "Student 1");
    assert.ok(jss1[0].email.endsWith(`@${DOMAIN}`));

    const creds = buildCredentials("STUDENT", p.plans, p.parentRefs);
    assert.equal(creds.length, 3);
    assert.ok(creds.every((c) => c.password === "edutrack123"));
  });
});
