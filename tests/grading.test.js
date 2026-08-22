/**
 * Tests for src/lib/grading.ts — the pure-function grading toolkit.
 *
 * These tests exercise every exported function and constant, confirming
 * the TypeScript conversion preserves all existing behavior.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_CA,
  MAX_CA_PER_COMPONENT,
  CA_COMPONENTS,
  MAX_EXAM,
  computeCA,
  DEFAULT_SUBJECTS,
  TERMS,
  getSubjects,
  computeGrade,
  clampScore,
  gradeBadgeClasses,
  standingFromAverage,
  standingRemark,
  subjectRemark,
  ordinal,
} from "../src/lib/grading.ts";

// ── Constants ────────────────────────────────────────────────────────

describe("grading constants", () => {
  it("MAX_CA is 40", () => assert.equal(MAX_CA, 40));
  it("MAX_CA_PER_COMPONENT is 10", () => assert.equal(MAX_CA_PER_COMPONENT, 10));
  it("CA_COMPONENTS is 4", () => assert.equal(CA_COMPONENTS, 4));
  it("MAX_EXAM is 60", () => assert.equal(MAX_EXAM, 60));
});

// ── computeCA ────────────────────────────────────────────────────────

describe("computeCA", () => {
  it("sums four numeric components", () => {
    assert.equal(computeCA(10, 8, 7, 5), 30);
  });

  it("caps at MAX_CA (40)", () => {
    assert.equal(computeCA(10, 10, 10, 10), 40);
    assert.equal(computeCA(12, 12, 12, 12), 40);
  });

  it("coerces string inputs to numbers", () => {
    assert.equal(computeCA("8", "7", "6", "5"), 26);
  });

  it("treats null/undefined as 0", () => {
    assert.equal(computeCA(null, undefined, 10, 5), 15);
  });

  it("treats empty/falsy values as 0", () => {
    assert.equal(computeCA("", 0, false, null), 0);
  });

  it("floors at 0 (no negative totals)", () => {
    assert.equal(computeCA(-5, -3, -2, -1), 0);
  });
});

// ── computeGrade ─────────────────────────────────────────────────────

describe("computeGrade", () => {
  it("A for >= 70", () => {
    assert.equal(computeGrade(70), "A");
    assert.equal(computeGrade(100), "A");
    assert.equal(computeGrade(85), "A");
  });

  it("B for 60-69", () => {
    assert.equal(computeGrade(60), "B");
    assert.equal(computeGrade(69), "B");
  });

  it("C for 50-59", () => {
    assert.equal(computeGrade(50), "C");
    assert.equal(computeGrade(59), "C");
  });

  it("D for 40-49", () => {
    assert.equal(computeGrade(40), "D");
    assert.equal(computeGrade(49), "D");
  });

  it("F for < 40", () => {
    assert.equal(computeGrade(0), "F");
    assert.equal(computeGrade(39), "F");
    assert.equal(computeGrade(-5), "F");
  });
});

// ── clampScore ───────────────────────────────────────────────────────

describe("clampScore", () => {
  it("clamps to max", () => assert.equal(clampScore(15, 10), 10));
  it("clamps negative to 0", () => assert.equal(clampScore(-5, 10), 0));
  it("rounds to nearest integer", () => assert.equal(clampScore(7.3, 10), 7));
  it("coerces string to number", () => assert.equal(clampScore("8", 10), 8));
  it("treats empty string as 0", () => assert.equal(clampScore("", 10), 0));
});

// ── gradeBadgeClasses ────────────────────────────────────────────────

describe("gradeBadgeClasses", () => {
  it("returns emerald classes for A", () => {
    assert.match(gradeBadgeClasses("A"), /emerald/);
  });
  it("returns brand classes for B", () => {
    assert.match(gradeBadgeClasses("B"), /brand/);
  });
  it("returns amber classes for C", () => {
    assert.match(gradeBadgeClasses("C"), /amber/);
  });
  it("returns orange classes for D", () => {
    assert.match(gradeBadgeClasses("D"), /orange/);
  });
  it("returns rose classes for F", () => {
    assert.match(gradeBadgeClasses("F"), /rose/);
  });
  it("returns rose classes for unknown grade", () => {
    assert.match(gradeBadgeClasses("X"), /rose/);
  });
});

// ── standingFromAverage ──────────────────────────────────────────────

describe("standingFromAverage", () => {
  it("Distinction for >= 70", () => {
    assert.equal(standingFromAverage(75).label, "Distinction");
  });
  it("Very Good for 60-69", () => {
    assert.equal(standingFromAverage(65).label, "Very Good");
  });
  it("Good for 50-59", () => {
    assert.equal(standingFromAverage(55).label, "Good");
  });
  it("Credit for 40-49", () => {
    assert.equal(standingFromAverage(45).label, "Credit");
  });
  it("Needs Support for < 40", () => {
    assert.equal(standingFromAverage(30).label, "Needs Support");
  });
  it("every standing has a color and classes", () => {
    for (const avg of [80, 65, 55, 45, 20]) {
      const s = standingFromAverage(avg);
      assert.ok(typeof s.color === "string" && s.color.startsWith("#"), `color for avg ${avg}`);
      assert.ok(typeof s.classes === "string" && s.classes.length > 0, `classes for avg ${avg}`);
    }
  });
});

// ── standingRemark ───────────────────────────────────────────────────

describe("standingRemark", () => {
  it("returns a non-empty string for each standing", () => {
    const standings = ["Distinction", "Very Good", "Good", "Credit", "Needs Support"];
    for (const label of standings) {
      const remark = standingRemark(label);
      assert.ok(remark.length > 10, `remark for "${label}"`);
    }
  });
  it("unknown label gets a supportive fallback", () => {
    assert.match(standingRemark("Unknown"), /reach out/);
  });
});

// ── subjectRemark ────────────────────────────────────────────────────

describe("subjectRemark", () => {
  it("returns grade-appropriate remarks", () => {
    assert.match(subjectRemark("A"), /Excellent/);
    assert.match(subjectRemark("B"), /Very good/);
    assert.match(subjectRemark("C"), /Good/);
    assert.match(subjectRemark("D"), /Fair/);
    assert.match(subjectRemark("F"), /Needs significant/);
  });
});

// ── ordinal ──────────────────────────────────────────────────────────

describe("ordinal", () => {
  it("1st, 2nd, 3rd", () => {
    assert.equal(ordinal(1), "1st");
    assert.equal(ordinal(2), "2nd");
    assert.equal(ordinal(3), "3rd");
  });
  it("4th through 20th use 'th'", () => {
    assert.equal(ordinal(4), "4th");
    assert.equal(ordinal(11), "11th");
    assert.equal(ordinal(12), "12th");
    assert.equal(ordinal(13), "13th");
    assert.equal(ordinal(20), "20th");
  });
  it("21st, 22nd, 23rd", () => {
    assert.equal(ordinal(21), "21st");
    assert.equal(ordinal(22), "22nd");
    assert.equal(ordinal(23), "23rd");
  });
  it("large numbers", () => {
    assert.equal(ordinal(100), "100th");
    assert.equal(ordinal(101), "101st");
  });
  it("NaN or 0 returns em dash", () => {
    assert.equal(ordinal(0), "—");
    assert.equal(ordinal(NaN), "—");
  });
});

// ── DEFAULT_SUBJECTS ─────────────────────────────────────────────────

describe("DEFAULT_SUBJECTS", () => {
  it("has at least 10 subjects", () => {
    assert.ok(DEFAULT_SUBJECTS.length >= 10);
  });
  it("includes Mathematics", () => {
    assert.ok(DEFAULT_SUBJECTS.includes("Mathematics"));
  });
  it("is readonly at the type level (as const)", () => {
    // as const gives readonly access at compile time; runtime is a plain array
    assert.ok(Array.isArray(DEFAULT_SUBJECTS));
  });
});

// ── TERMS ────────────────────────────────────────────────────────────

describe("TERMS", () => {
  it("has exactly 3 terms", () => {
    assert.equal(TERMS.length, 3);
  });
  it("includes First Term", () => {
    assert.ok(TERMS.includes("First Term"));
  });
  it("is readonly at the type level (as const)", () => {
    // as const gives readonly access at compile time; runtime is a plain array
    assert.ok(Array.isArray(TERMS));
  });
});

// ── getSubjects ──────────────────────────────────────────────────────

describe("getSubjects", () => {
  it("returns DEFAULT_SUBJECTS when env var is not set", () => {
    const original = process.env.EDUTRACK_SUBJECTS;
    delete process.env.EDUTRACK_SUBJECTS;
    const result = getSubjects();
    assert.deepEqual(result, [...DEFAULT_SUBJECTS]);
    // Restore
    if (original !== undefined) process.env.EDUTRACK_SUBJECTS = original;
  });

  it("parses comma-separated env var", () => {
    const original = process.env.EDUTRACK_SUBJECTS;
    process.env.EDUTRACK_SUBJECTS = "Math, English,  Physics ,";
    const result = getSubjects();
    assert.deepEqual(result, ["Math", "English", "Physics"]);
    // Restore
    if (original !== undefined) process.env.EDUTRACK_SUBJECTS = original;
    else delete process.env.EDUTRACK_SUBJECTS;
  });

  it("returns empty array for empty env var", () => {
    const original = process.env.EDUTRACK_SUBJECTS;
    process.env.EDUTRACK_SUBJECTS = "  ,  ,  ";
    const result = getSubjects();
    assert.deepEqual(result, []);
    // Restore
    if (original !== undefined) process.env.EDUTRACK_SUBJECTS = original;
    else delete process.env.EDUTRACK_SUBJECTS;
  });

  it("returns a mutable copy (not the frozen constant)", () => {
    const original = process.env.EDUTRACK_SUBJECTS;
    delete process.env.EDUTRACK_SUBJECTS;
    const result = getSubjects();
    result.push("Custom Subject");
    // Original constant should be unaffected
    assert.ok(!DEFAULT_SUBJECTS.includes("Custom Subject"));
    // Restore
    if (original !== undefined) process.env.EDUTRACK_SUBJECTS = original;
  });
});
