/**
 * Bulk import engine tests.
 *
 * Covers the three layers of the Phase-1 import feature:
 *   1. csv.js        — RFC-4180 parsing + serialization
 *   2. importer.js   — header mapping, planning (validation, auto-logins,
 *                      dedupe, parent resolution, new class arms)
 *   3. applyImport   — the exact store operations the route performs, run
 *                      against the seeded demo adapter end-to-end
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, toCSV } from "../src/lib/csv.js";
import {
  parseRows,
  mapColumns,
  planImport,
  applyImport,
  buildCredentials,
  emailSlug,
  schoolDomain,
  uniqueEmail,
} from "../src/lib/importer.js";

const DOMAIN = schoolDomain("Greenfield International School");
import * as demoStore from "../src/lib/demo-store.js";

let school;
let existingUsers;
let existingParents;

beforeEach(async () => {
  demoStore.__resetDemoStore();
  const schools = await demoStore.searchSchools("Greenfield");
  school = await demoStore.getSchoolById(schools[0].id);
  existingUsers = await demoStore.listUsers({ schoolId: school.id });
  existingParents = await demoStore.listUsers({ schoolId: school.id, role: "PARENT" });
});

const plan = (rows, overrides = {}) =>
  planImport({
    role: "STUDENT",
    rows,
    schoolName: school.name,
    activeArms: school.activeArms,
    existingUsers,
    existingParents,
    defaultPassword: "edutrack123",
    createArms: true,
    ...overrides,
  });

// ---- csv.js -----------------------------------------------------------------

describe("parseCSV", () => {
  it("parses simple rows and drops the trailing empty line", () => {
    assert.deepEqual(parseCSV("a,b\n1,2\n"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    assert.deepEqual(parseCSV('name,class\n"Kunle, Adebayo",SS1\n'), [
      ["name", "class"],
      ["Kunle, Adebayo", "SS1"],
    ]);
  });

  it("un-escapes doubled quotes", () => {
    assert.deepEqual(parseCSV('"say ""hi""",x'), [['say "hi"', "x"]]);
  });

  it("normalizes CRLF line endings", () => {
    assert.deepEqual(parseCSV("a,b\r\n1,2\r\n"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a UTF-8 BOM", () => {
    assert.deepEqual(parseCSV("\uFEFFa,b\n1,2\n"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("detects ; as the delimiter when it outnumbers commas", () => {
    assert.deepEqual(parseCSV("name;class\nKunle;SS1\n"), [
      ["name", "class"],
      ["Kunle", "SS1"],
    ]);
  });

  it("supports newlines inside quoted fields", () => {
    assert.deepEqual(parseCSV('a,b\n"line1\nline2",2\n'), [
      ["a", "b"],
      ["line1\nline2", "2"],
    ]);
  });
});

describe("toCSV", () => {
  it("quotes fields that need it and round-trips", () => {
    const rows = [
      ["name", "note"],
      ["Kunle", 'say "hi", ok'],
    ];
    assert.equal(toCSV(rows), 'name,note\nKunle,"say ""hi"", ok"');
    assert.deepEqual(parseCSV(toCSV(rows)), rows);
  });
});

// ---- importer.js: header mapping + parseRows --------------------------------

describe("mapColumns", () => {
  it("maps common aliases and reports unknowns", () => {
    const { map, unknown } = mapColumns([
      "Full Name",
      "Class Arm",
      "Parent Phone",
      "Shoe Size",
    ]);
    assert.equal(map.name, 0);
    assert.equal(map.classArm, 1);
    assert.equal(map.parentPhone, 2);
    assert.deepEqual(unknown, ["Shoe Size"]);
  });
});

describe("parseRows", () => {
  it("normalizes rows with headers in any order", () => {
    const { rows, unknown } = parseRows(
      "STUDENT",
      "class,phone,name\nSS1 Science,08031234567,Kunle Adebayo\n"
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Kunle Adebayo");
    assert.equal(rows[0].classArm, "SS1 Science");
    assert.equal(rows[0].phone, "08031234567");
    assert.equal(rows[0].row, 2); // 1-based, offset by the header row
    assert.deepEqual(unknown, []);
  });

  it("reports a missing name column", () => {
    const { error } = parseRows("STUDENT", "email,class\nx@y.com,SS1\n");
    assert.ok(error.includes("name"));
  });

  it("rejects an empty file", () => {
    assert.ok(parseRows("STUDENT", "").error);
    assert.ok(parseRows("STUDENT", "name\n").error); // header only, no data
  });
});

// ---- importer.js: slug/domain helpers ---------------------------------------

describe("email helpers", () => {
  it("builds first.last slugs without titles", () => {
    assert.equal(emailSlug("Mrs. Adaeze Okafor"), "adaeze.okafor");
    assert.equal(emailSlug("Kunle Adebayo"), "kunle.adebayo");
    assert.equal(emailSlug("Dr. Ifeoma Nwosu"), "ifeoma.nwosu");
    assert.equal(emailSlug("Zainab"), "zainab");
  });

  it("derives a school domain from the school name", () => {
    assert.equal(schoolDomain("Greenfield International School"), "greenfieldinternationalschool.edu.ng");
    assert.equal(schoolDomain(""), "edutrack.edu.ng");
  });

  it("de-duplicates with a numeric suffix", () => {
    const used = new Set(["kunle.adebayo@x.edu.ng", "kunle.adebayo2@x.edu.ng"]);
    assert.equal(uniqueEmail("kunle.adebayo", "x.edu.ng", used), "kunle.adebayo3@x.edu.ng");
    assert.ok(used.has("kunle.adebayo3@x.edu.ng"));
  });
});

// ---- importer.js: planning --------------------------------------------------

describe("planImport (students)", () => {
  it("plans valid rows with auto-generated logins and reused parents", () => {
    const { rows } = parseRows(
      "STUDENT",
      "name,email,class,phone,password,parent name,parent phone\n" +
        "Kunle Adebayo,,SS1 Science,08031234567,,Mrs. Folake Adebayo,08031234567\n" +
        "Chidinma Obi,,SS1 Science,08079876543,,Mr. Emeka Obi,08079876543\n" +
        "Emeka Nwosu,e.nwosu@edutrack.app,SS1 Science,08051112222,,,\n"
    );
    const p = plan(rows);

    assert.equal(p.summary.total, 3);
    assert.equal(p.summary.ok, 2);
    assert.equal(p.summary.duplicates, 1); // e.nwosu@edutrack.app already seeded
    assert.equal(p.summary.errors, 0);

    const kunle = p.plans.find((r) => r.name === "Kunle Adebayo");
    assert.equal(kunle.status, "ok");
    assert.equal(kunle.email, `kunle.adebayo@${DOMAIN}`);
    assert.equal(kunle.password, "edutrack123");
    // Mrs. Folake Adebayo exists in the seed with this phone -> parent reused.
    assert.ok(kunle.parentKey.startsWith("existing:"));

    const chidinma = p.plans.find((r) => r.name === "Chidinma Obi");
    assert.equal(chidinma.status, "ok");
    assert.equal(chidinma.email, `chidinma.obi@${DOMAIN}`);
    assert.ok(chidinma.parentKey.startsWith("new:"));

    // One parent reused, one parent created.
    assert.equal(p.summary.parentsToCreate, 1);
    assert.equal(p.parentRefs.length, 2);
  });

  it("dedupes generated emails with a numeric suffix", () => {
    const { rows } = parseRows(
      "STUDENT",
      "name,class\nKunle Adebayo,SS1 Science\nKunle Adebayo,SS1 Arts\n"
    );
    const p = plan(rows);
    assert.deepEqual(
      p.plans.map((r) => r.email),
      [`kunle.adebayo@${DOMAIN}`, `kunle.adebayo2@${DOMAIN}`]
    );
    assert.equal(p.summary.ok, 2);
  });

  it("flags missing names, invalid emails and short passwords", () => {
    const { rows } = parseRows(
      "STUDENT",
      "name,email,password\n,foo@,short\n"
    );
    const p = plan(rows);
    assert.equal(p.summary.errors, 1);
    const err = p.plans[0];
    assert.equal(err.status, "error");
    assert.ok(err.error.includes("Name is required"));
    assert.ok(err.error.includes("Invalid email"));
    assert.ok(err.error.includes("Password"));
  });

  it("adds unknown arms when createArms is on, errors when off", () => {
    const { rows } = parseRows("STUDENT", "name,class\nAisha Bello,JSS1 Blue\n");
    const on = plan(rows);
    assert.deepEqual(on.newArms, ["JSS1 Blue"]);
    assert.equal(on.plans[0].status, "ok");

    const off = plan(rows, { createArms: false });
    assert.deepEqual(off.newArms, []);
    assert.equal(off.plans[0].status, "error");
    assert.ok(off.plans[0].error.includes("JSS1 Blue"));
  });

  it("requires a parent name when a parent phone is given", () => {
    const { rows } = parseRows(
      "STUDENT",
      "name,class,parent phone\nTunde Bakare,SS1 Science,08099998888\n"
    );
    const p = plan(rows);
    assert.equal(p.plans[0].status, "error");
    assert.ok(p.plans[0].error.includes("Parent name"));
  });

  it("gives new parents the row password when no default is set", () => {
    const { rows } = parseRows(
      "STUDENT",
      "name,class,password,parent name,parent phone\n" +
        "Amina Suleiman,JSS1 Blue,secret99,Alhaji Suleiman,08010000001\n"
    );
    const p = planImport({
      role: "STUDENT",
      rows,
      schoolName: school.name,
      activeArms: school.activeArms,
      existingUsers,
      existingParents,
      defaultPassword: "", // no default -> the row's own password must be used
      createArms: true,
    });
    assert.equal(p.summary.ok, 1);
    const parent = p.parentRefs.find((r) => r.isNew);
    assert.ok(parent);
    assert.equal(parent.password, "secret99");
  });
});

describe("planImport (teachers)", () => {
  it("plans teacher rows without parent columns", () => {
    const { rows } = parseRows(
      "TEACHER",
      "name,email,assigned class\nMrs. Ada Obi,,SS2 Science\nMr. Yemi Lawal,,SS3 Arts\n"
    );
    const p = planImport({
      role: "TEACHER",
      rows,
      schoolName: school.name,
      activeArms: school.activeArms,
      existingUsers,
      existingParents,
      defaultPassword: "edutrack123",
      createArms: true,
    });
    assert.equal(p.summary.ok, 2);
    assert.equal(p.parentRefs.length, 0);
    assert.equal(p.plans[0].email, `ada.obi@${DOMAIN}`);
  });
});

describe("buildCredentials", () => {
  it("includes ok rows and newly created parents only", () => {
    const { rows } = parseRows(
      "STUDENT",
      "name,class,parent name,parent phone\n" +
        "Kunle Adebayo,SS1 Science,Mrs. Folake Adebayo,08031234567\n" +
        "Chidinma Obi,SS1 Science,Mr. Emeka Obi,08079876543\n"
    );
    const p = plan(rows);
    const creds = buildCredentials("STUDENT", p.plans, p.parentRefs);
    assert.equal(creds.length, 3); // 2 students + 1 new parent
    assert.ok(creds.every((c) => c.password === "edutrack123"));
    assert.ok(creds.some((c) => c.role === "PARENT"));
  });
});

// ---- importer.js: apply end-to-end through the demo store -------------------

describe("applyImport (demo store)", () => {
  it("creates arms, users and parent links exactly as planned", async () => {
    const { rows } = parseRows(
      "STUDENT",
      "name,class,phone,parent name,parent phone\n" +
        "Amina Suleiman,JSS1 Blue,08010000001,Alhaji Suleiman,08010000001\n" +
        "Halima Suleiman,JSS1 Blue,08010000001,Alhaji Suleiman,08010000001\n" + // same parent
        "Bola Ajayi,SS1 Science,08020000002,Mrs. Funke Ajayi,08020000002\n" +
        "Ghost Row,,,,08030000000\n" // parent phone without parent name -> error, skipped
    );
    const p = plan(rows);
    assert.equal(p.summary.ok, 3);
    assert.equal(p.summary.errors, 1);
    assert.equal(p.summary.parentsToCreate, 2); // Suleiman once, Ajayi once

    const applied = await applyImport({
      store: demoStore,
      schoolId: school.id,
      role: "STUDENT",
      plans: p.plans,
      parentRefs: p.parentRefs,
      newArms: p.newArms,
    });

    assert.equal(applied.created.students, 3);
    assert.equal(applied.created.parents, 2);
    assert.equal(applied.created.linked, 3);
    assert.deepEqual(applied.failed, []);

    // New arm added to the school.
    const updated = await demoStore.getSchoolById(school.id);
    assert.ok(updated.activeArms.includes("JSS1 Blue"));

    // Students exist and are linked to the right parent.
    const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    const amina = students.find((s) => s.name === "Amina Suleiman");
    const halima = students.find((s) => s.name === "Halima Suleiman");
    assert.equal(amina.parentId, halima.parentId); // one shared parent
    assert.ok(amina.parentId);
    const parents = await demoStore.listUsers({ schoolId: school.id, role: "PARENT" });
    const suleiman = parents.find((p) => p.name === "Alhaji Suleiman");
    assert.equal(amina.parentId, suleiman.id);

    // The ghost row was not created.
    assert.ok(!students.some((s) => s.name === "Ghost Row"));
  });

  it("imports teachers with PENDING payroll", async () => {
    const { rows } = parseRows(
      "TEACHER",
      "name,assigned class\nMrs. Ada Obi,SS2 Science\n"
    );
    const p = planImport({
      role: "TEACHER",
      rows,
      schoolName: school.name,
      activeArms: school.activeArms,
      existingUsers,
      existingParents,
      defaultPassword: "edutrack123",
      createArms: true,
    });
    const applied = await applyImport({
      store: demoStore,
      schoolId: school.id,
      role: "TEACHER",
      plans: p.plans,
      parentRefs: p.parentRefs,
      newArms: p.newArms,
    });
    assert.equal(applied.created.teachers, 1);
    assert.deepEqual(applied.failed, []);
    const teachers = await demoStore.listUsers({ schoolId: school.id, role: "TEACHER" });
    const ada = teachers.find((t) => t.name === "Mrs. Ada Obi");
    assert.ok(ada);
    assert.equal(ada.payrollStatus, "PENDING");
    assert.ok(ada.email.endsWith(`@${DOMAIN}`));
  });
});
