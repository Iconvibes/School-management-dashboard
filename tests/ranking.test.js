/**
 * Class-ranking tests.
 *
 * The ranking algorithm used to live — copy-pasted — inside four route
 * handlers. It was extracted to `src/lib/ranking.js` so it has a real test
 * surface; these tests pin the unit behavior AND the contract end-to-end
 * through the seeded demo adapter (the same data the routes serve).
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  roundAverage,
  rankStudents,
  rankClassPosition,
  buildArmRankings,
} from "../src/lib/ranking.js";
import * as demoStore from "../src/lib/demo-store.js";

let schoolId;

beforeEach(async () => {
  demoStore.__resetDemoStore();
  const schools = await demoStore.searchSchools("Greenfield");
  schoolId = schools[0].id;
});

/** Standard score map shape used by every route. */
function toScoreMap(scores) {
  const map = {};
  scores.forEach((s) => {
    if (!map[s.studentId]) map[s.studentId] = [];
    map[s.studentId].push(s);
  });
  return map;
}

describe("roundAverage", () => {
  it("rounds to 2 decimals", () => {
    assert.equal(roundAverage(100 / 3), 33.33);
    assert.equal(roundAverage(78.6), 78.6);
    assert.equal(roundAverage(0), 0);
  });
});

describe("rankStudents (unit)", () => {
  it("sorts by average descending and assigns positions 1..n", () => {
    const students = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const scoreMap = {
      a: [{ totalScore: 60 }, { totalScore: 80 }], // avg 70
      b: [{ totalScore: 90 }], // avg 90
      c: [{ totalScore: 50 }], // avg 50
    };
    const ranked = rankStudents(students, scoreMap);
    assert.deepEqual(
      ranked.map((r) => r.id),
      ["b", "a", "c"]
    );
    assert.deepEqual(
      ranked.map((r) => r.position),
      [1, 2, 3]
    );
    assert.deepEqual(ranked.map((r) => r.outOf), [3, 3, 3]);
  });

  it("keeps input order on exact ties (stable sort)", () => {
    const students = [{ id: "a" }, { id: "b" }];
    const scoreMap = { a: [{ totalScore: 70 }], b: [{ totalScore: 70 }] };
    const ranked = rankStudents(students, scoreMap);
    assert.deepEqual(
      ranked.map((r) => r.id),
      ["a", "b"]
    );
  });

  it("derives grade + standing from the average", () => {
    const students = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const scoreMap = {
      a: [{ totalScore: 78 }], // A / Distinction
      b: [{ totalScore: 62 }], // B / Very Good
      c: [{ totalScore: 30 }], // F / Needs Support
    };
    const ranked = rankStudents(students, scoreMap);
    assert.equal(ranked.find((r) => r.id === "a").grade, "A");
    assert.equal(ranked.find((r) => r.id === "a").standing, "Distinction");
    assert.equal(ranked.find((r) => r.id === "b").grade, "B");
    assert.equal(ranked.find((r) => r.id === "b").standing, "Very Good");
    assert.equal(ranked.find((r) => r.id === "c").grade, "F");
    assert.equal(ranked.find((r) => r.id === "c").standing, "Needs Support");
  });

  it("a student with no scores ranks last with a null grade", () => {
    const students = [{ id: "a" }, { id: "b" }];
    const scoreMap = { a: [{ totalScore: 80 }], b: [] };
    const ranked = rankStudents(students, scoreMap);
    assert.deepEqual(
      ranked.map((r) => r.id),
      ["a", "b"]
    );
    assert.equal(ranked[1].average, 0);
    assert.equal(ranked[1].grade, null);
    assert.equal(ranked[1].subjects, 0);
  });

  it("never leaks fields beyond the report-card allow-list", () => {
    const students = [{ id: "a", name: "A", email: "a@x", assignedClass: "SS1", feePaid: true, password: "hash" }];
    const ranked = rankStudents(students, { a: [{ totalScore: 70 }] });
    assert.deepEqual(Object.keys(ranked[0]).sort(), [
      "assignedClass",
      "average",
      "email",
      "feePaid",
      "grade",
      "id",
      "name",
      "outOf",
      "position",
      "standing",
      "subjects",
    ]);
  });

  it("handles an empty roster", () => {
    assert.deepEqual(rankStudents([], {}), []);
  });
});

describe("rankClassPosition (unit)", () => {
  it("returns null position when the student is not in the list", () => {
    const { position, outOf } = rankClassPosition("ghost", [{ id: "a" }], {});
    assert.equal(position, null);
    assert.equal(outOf, 1);
  });
});

describe("buildArmRankings (unit)", () => {
  it("groups by assigned class and ranks each arm once", () => {
    const students = [
      { id: "s1", assignedClass: "SS1 Science" },
      { id: "s2", assignedClass: "SS1 Science" },
      { id: "s3", assignedClass: "SS1 Arts" },
      { id: "s4", assignedClass: "" }, // unassigned bucket
    ];
    const scoreMap = {
      s1: [{ totalScore: 90 }],
      s2: [{ totalScore: 70 }],
      s3: [{ totalScore: 80 }],
    };
    const rankings = buildArmRankings(students, scoreMap);
    assert.equal(rankings["SS1 Science"].s1.position, 1);
    assert.equal(rankings["SS1 Science"].s1.outOf, 2);
    assert.equal(rankings["SS1 Science"].s2.position, 2);
    assert.equal(rankings["SS1 Arts"].s3.position, 1);
    assert.equal(rankings["SS1 Arts"].s3.outOf, 1);
    assert.equal(rankings[""].s4.position, 1); // unassigned bucket
    assert.equal(rankings[""].s4.outOf, 1);
  });
});

describe("class ranking through the demo adapter", () => {
  it("ranks the seeded SS1 Science class (all tied at 78.6, 5 subjects each)", async () => {
    const students = await demoStore.listUsers({
      schoolId,
      role: "STUDENT",
      classArm: "SS1 Science",
    });
    assert.equal(students.length, 4);

    const scoreMap = toScoreMap(await demoStore.getScoresBySchool(schoolId));
    const ranked = rankStudents(students, scoreMap);

    assert.ok(ranked.every((r) => r.subjects === 5));
    // The seed's offsets cancel out (ca+off / exam-off), so every student in an
    // arm ties — the averages below pin the exact seeded arithmetic.
    assert.ok(ranked.every((r) => r.average === 78.6));
    assert.deepEqual(
      ranked.map((r) => r.position),
      [1, 2, 3, 4]
    );
    assert.ok(ranked.every((r) => r.outOf === 4));
    assert.ok(ranked.every((r) => r.grade === "A"));
    assert.ok(ranked.every((r) => r.standing === "Distinction"));
  });

  it("matches the per-arm contract for every seeded arm", async () => {
    const students = await demoStore.listUsers({ schoolId, role: "STUDENT" });
    const scoreMap = toScoreMap(await demoStore.getScoresBySchool(schoolId));

    const byArm = {};
    students.forEach((s) => {
      (byArm[s.assignedClass] ||= []).push(s);
    });

    for (const [arm, armStudents] of Object.entries(byArm)) {
      const ranked = rankStudents(armStudents, scoreMap);
      assert.equal(ranked.length, armStudents.length);
      assert.deepEqual(
        ranked.map((r) => r.position),
        ranked.map((_, i) => i + 1)
      );
      assert.ok(ranked.every((r) => r.outOf === armStudents.length));
      // Totals are constant within an arm by seed design.
      assert.equal(new Set(ranked.map((r) => r.average)).size, 1);
    }
  });

  it("rankClassPosition finds a seeded student's position", async () => {
    const students = await demoStore.listUsers({
      schoolId,
      role: "STUDENT",
      classArm: "SS1 Science",
    });
    const scoreMap = toScoreMap(await demoStore.getScoresBySchool(schoolId));
    // All four SS1 Science students tie, so stable sort keeps seed order:
    // Kunle (first seeded) ranks 1st of 4.
    const kunle = students.find((s) => s.email === "k.adebayo@edutrack.app");
    const { position, outOf } = rankClassPosition(kunle.id, students, scoreMap);
    assert.equal(position, 1);
    assert.equal(outOf, 4);
  });

  it("the parent portal resolves both children from one ranking pass", async () => {
    const parent = await demoStore.findUserByEmail("p.adebayo@edutrack.app");
    const children = await demoStore.getChildren(parent.id);
    assert.equal(children.length, 2);

    const students = await demoStore.listUsers({ schoolId, role: "STUDENT" });
    const scoreMap = toScoreMap(await demoStore.getScoresBySchool(schoolId));
    const armRankings = buildArmRankings(students, scoreMap);

    for (const child of children) {
      const pos = armRankings[child.assignedClass]?.[child.id];
      assert.ok(pos, `child ${child.id} should be ranked in ${child.assignedClass}`);
      assert.equal(pos.outOf, 4); // SS1 Science has 4 students
      assert.ok(pos.position >= 1 && pos.position <= 4);
    }
  });
});
