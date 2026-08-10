/**
 * Demo sample-roster generator tests.
 *
 * The generator must produce deterministic, realistic, import-ready CSV:
 * correct row counts, even distribution across the school's arms, parents
 * shared between siblings (so the importer's parent dedupe has real work),
 * and a format planImport accepts with every row valid.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateRosterCsv,
  DEFAULT_SAMPLE_ARMS,
} from "../src/lib/sample-roster.js";
import { parseCSV } from "../src/lib/csv.js";
import { parseRows, planImport } from "../src/lib/importer.js";

describe("generateRosterCsv", () => {
  it("is deterministic for a fixed seed", () => {
    const a = generateRosterCsv({ role: "STUDENT" });
    const b = generateRosterCsv({ role: "STUDENT" });
    assert.equal(a, b);
  });

  it("generates 1800 students + header across the twelve seeded arms", () => {
    const table = parseCSV(generateRosterCsv({ role: "STUDENT" }));
    assert.equal(table.length, 1801); // header + 1800
    assert.deepEqual(
      table[0],
      ["name", "email", "class", "phone", "password", "parent name", "parent phone"]
    );
  });

  it("distributes students evenly across arms (150 each)", () => {
    const table = parseCSV(generateRosterCsv({ role: "STUDENT" }));
    const counts = {};
    table.slice(1).forEach((r) => {
      counts[r[2]] = (counts[r[2]] || 0) + 1;
    });
    assert.deepEqual(counts, {
      "JSS1": 150, "JSS2": 150, "JSS3": 150,
      "SS1 Science": 150, "SS1 Arts": 150, "SS1 Commercial": 150,
      "SS2 Science": 150, "SS2 Arts": 150, "SS2 Commercial": 150,
      "SS3 Science": 150, "SS3 Arts": 150, "SS3 Commercial": 150,
    });
  });

  it("gives every student a unique phone", () => {
    const table = parseCSV(generateRosterCsv({ role: "STUDENT" }));
    const phones = new Set(table.slice(1).map((r) => r[3]));
    assert.equal(phones.size, 1800);
  });

  it("shares parents between sibling students", () => {
    const table = parseCSV(generateRosterCsv({ role: "STUDENT" }));
    const parentPhoneCounts = {};
    table.slice(1).forEach((r) => {
      if (r[6]) parentPhoneCounts[r[6]] = (parentPhoneCounts[r[6]] || 0) + 1;
    });
    const siblings = Object.values(parentPhoneCounts).filter((n) => n > 1);
    assert.ok(siblings.length > 0, "expected some parents to have multiple children");
  });

  it("generates 50 subject-specialist teachers with subjects × arms", () => {
    const table = parseCSV(generateRosterCsv({ role: "TEACHER" }));
    assert.equal(table.length, 51); // header + 50
    assert.deepEqual(table[0], [
      "name", "email", "assigned class", "subjects", "assigned classes", "phone", "password",
    ]);
    const subjects = new Set(table.slice(1).map((r) => r[3].split("; ")[0]));
    assert.ok(subjects.has("Mathematics"), "a Mathematics teacher is in the sample");
    assert.ok(subjects.has("English Language"), "an English teacher is in the sample");
    // Every teacher carries the full arm list of their profile, and the
    // profiles together cover every arm of the school.
    const allArms = new Set(
      table.slice(1).flatMap((r) => r[4].split("; "))
    );
    assert.deepEqual([...allArms].sort(), [...DEFAULT_SAMPLE_ARMS].sort());
    // Display arm is the first of the profile's arms (JSS1 — plain class).
    assert.equal(table[1][2], "JSS1");
  });
});

describe("sample roster through the import planner", () => {
  it("plans every student row as ok (emails/passwords auto-filled)", () => {
    // Small scale keeps the test fast; the distribution logic is identical.
    const csv = generateRosterCsv({
      role: "STUDENT",
      arms: DEFAULT_SAMPLE_ARMS.slice(0, 2),
      studentsPerArm: 5,
    });
    const { rows } = parseRows("STUDENT", csv);
    assert.equal(rows.length, 10);

    const p = planImport({
      role: "STUDENT",
      rows,
      schoolName: "Greenfield International School",
      activeArms: DEFAULT_SAMPLE_ARMS.slice(0, 2),
      existingUsers: [],
      existingParents: [],
      defaultPassword: "edutrack123",
      createArms: true,
    });
    assert.equal(p.summary.ok, 10);
    assert.equal(p.summary.errors, 0);
    assert.equal(p.summary.duplicates, 0);
    assert.equal(p.summary.parentsToCreate, 3); // 5 parented students, 2 parents
    assert.ok(p.plans.every((r) => r.email.endsWith("@greenfieldinternationalschool.edu.ng")));
  });

  it("plans every teacher row as ok", () => {
    const csv = generateRosterCsv({ role: "TEACHER", teacherCount: 10 });
    const { rows } = parseRows("TEACHER", csv);
    assert.equal(rows.length, 10);

    const p = planImport({
      role: "TEACHER",
      rows,
      schoolName: "Greenfield International School",
      activeArms: DEFAULT_SAMPLE_ARMS,
      existingUsers: [],
      existingParents: [],
      defaultPassword: "edutrack123",
      createArms: true,
    });
    assert.equal(p.summary.ok, 10);
    assert.equal(p.summary.errors, 0);
    assert.equal(p.parentRefs.length, 0);
  });
});
