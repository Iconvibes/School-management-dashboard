import { test } from "node:test";
import assert from "node:assert/strict";
import { colorDay, verifyColoring } from "../src/lib/konig.js";

// ── Basic correctness ────────────────────────────────────────────────

test("empty edge list returns empty coloring", () => {
  const result = colorDay([]);
  assert.deepEqual(result, {});
});

test("single edge gets period 1", () => {
  const result = colorDay([{ teacher: "A", arm: "X" }]);
  assert.equal(result["A|X"], 1);
});

test("two edges sharing a teacher get different periods", () => {
  const result = colorDay([
    { teacher: "A", arm: "X" },
    { teacher: "A", arm: "Y" },
  ]);
  assert.notEqual(result["A|X"], result["A|Y"]);
  assert.ok(result["A|X"] >= 1);
  assert.ok(result["A|Y"] >= 1);
});

test("two edges sharing an arm get different periods", () => {
  const result = colorDay([
    { teacher: "A", arm: "X" },
    { teacher: "B", arm: "X" },
  ]);
  assert.notEqual(result["A|X"], result["B|X"]);
});

test("no two edges sharing a vertex have the same color (invariant)", () => {
  const edges = [
    { teacher: "T1", arm: "S1" },
    { teacher: "T1", arm: "S2" },
    { teacher: "T1", arm: "S3" },
    { teacher: "T2", arm: "S1" },
    { teacher: "T2", arm: "S2" },
    { teacher: "T3", arm: "S1" },
  ];
  const result = colorDay(edges);
  const err = verifyColoring(edges, result);
  assert.equal(err, null, `Coloring invalid: ${err}`);
});

// ── Determinism ──────────────────────────────────────────────────────

test("same input always produces the same output (deterministic)", () => {
  const edges = [
    { teacher: "T1", arm: "A" },
    { teacher: "T1", arm: "B" },
    { teacher: "T2", arm: "A" },
    { teacher: "T2", arm: "B" },
    { teacher: "T2", arm: "C" },
  ];
  const r1 = colorDay(edges);
  const r2 = colorDay(edges);
  assert.deepEqual(r1, r2);
});

// ── Complete bipartite graph (worst case) ────────────────────────────

test("K2,3 complete bipartite — every teacher teaches every arm", () => {
  const teachers = ["T1", "T2"];
  const arms = ["A", "B", "C"];
  const edges = teachers.flatMap((t) => arms.map((a) => ({ teacher: t, arm: a })));
  // 6 edges, max degree = 3 — needs 3 colors.
  const result = colorDay(edges);
  const err = verifyColoring(edges, result);
  assert.equal(err, null, `Coloring invalid: ${err}`);
  assert.equal(Object.keys(result).length, edges.length, "All edges colored");
});

// ── Max degree stress ────────────────────────────────────────────────

test("handles max degree = 8 (full school day) without conflicts", () => {
  // One teacher teaches 8 arms — all 8 slots must get different periods.
  const edges = Array.from({ length: 8 }, (_, i) => ({
    teacher: "T1",
    arm: `Arm${i + 1}`,
  }));
  const result = colorDay(edges);
  const periods = Object.values(result);
  assert.equal(new Set(periods).size, 8, "All 8 periods used");
  const err = verifyColoring(edges, result);
  assert.equal(err, null, `Coloring invalid: ${err}`);
});

// ── maxColors limit ──────────────────────────────────────────────────

test("edges exceeding maxColors are skipped (left uncolored)", () => {
  // T1 teaches 5 arms but only 3 colors available.
  const edges = Array.from({ length: 5 }, (_, i) => ({
    teacher: "T1",
    arm: `Arm${i + 1}`,
  }));
  const result = colorDay(edges, 3);
  // Only 3 should be colored; 2 should be skipped.
  const colored = Object.keys(result).length;
  assert.ok(colored <= 3, `Expected at most 3 colored edges, got ${colored}`);
});

// ── Deterministic ordering ───────────────────────────────────────────

test("different edge orders both produce valid colorings (algorithm is order-sensitive but always correct)", () => {
  const edges = [
    { teacher: "T1", arm: "A" },
    { teacher: "T1", arm: "B" },
    { teacher: "T2", arm: "A" },
    { teacher: "T2", arm: "B" },
    { teacher: "T2", arm: "C" },
    { teacher: "T3", arm: "B" },
    { teacher: "T3", arm: "C" },
  ];
  const reversed = [...edges].reverse();
  const r1 = colorDay(edges);
  const r2 = colorDay(reversed);
  // Both must be valid colorings (no conflicts), even if they differ.
  assert.equal(verifyColoring(edges, r1), null, "forward order invalid");
  assert.equal(verifyColoring(edges, r2), null, "reversed order invalid");
});

// ── Real-world: Nigerian secondary school demo graph ─────────────────

test("real demo-seed graph: one school day — zero conflicts", () => {
  // The real seed calls colorDay ONCE PER DAY, not for the whole week.
  // On a single day, each teacher has at most ~6 slots (core subjects
  // staggered across arm groups). This test reconstructs a realistic
  // Monday with the same teacher→arm→subject structure.
  const JSS_ARMS = ["JSS1", "JSS2", "JSS3"];
  const STREAMS = ["Science", "Arts", "Commercial"];
  const SS_NAMES = ["SS1", "SS2", "SS3"];
  const SS_SCIENCE_ARMS = SS_NAMES.map((c) => `${c} Science`);
  const SS_ARTS_ARMS = SS_NAMES.map((c) => `${c} Arts`);
  const SS_COMMERCIAL_ARMS = SS_NAMES.map((c) => `${c} Commercial`);
  const ALL_ARMS = [...JSS_ARMS, ...SS_NAMES.flatMap((c) => STREAMS.map((s) => `${c} ${s}`))];

  // Teacher → arms (same as demo seed).
  const teacherArms = {
    Okafor: ALL_ARMS, Bakare: ALL_ARMS, Fagbemi: ALL_ARMS,
    Nwosu: SS_SCIENCE_ARMS, Obi: SS_SCIENCE_ARMS,
    Okonkwo: [...JSS_ARMS, ...SS_SCIENCE_ARMS], Yusuf: [...JSS_ARMS, ...SS_SCIENCE_ARMS],
    Adeyemi: SS_ARTS_ARMS, Suleiman: [...JSS_ARMS, ...SS_ARTS_ARMS], Anya: SS_ARTS_ARMS,
    Eze: [...SS_ARTS_ARMS, ...SS_COMMERCIAL_ARMS], Adeleke: SS_COMMERCIAL_ARMS,
    Balogun: SS_COMMERCIAL_ARMS, Danjuma: [...JSS_ARMS, ...SS_COMMERCIAL_ARMS],
    Adewale: JSS_ARMS, Nnadi: JSS_ARMS,
  };

  // Build one day's edge list: each teacher teaches ~2 arms on Monday
  // (core subjects are staggered so no teacher exceeds 8/day).
  const DAY_ARMS = {
    Okafor: ["JSS1", "SS2 Science"], Bakare: ["JSS2", "SS1 Arts"],
    Fagbemi: ["JSS3", "SS3 Commercial"], Nwosu: ["SS1 Science"],
    Obi: ["SS3 Science"], Okonkwo: ["JSS1", "SS2 Science"],
    Yusuf: ["JSS2", "SS1 Commercial"], Adeyemi: ["SS1 Arts"],
    Suleiman: ["JSS3", "SS3 Arts"], Anya: ["SS2 Arts"],
    Eze: ["SS1 Commercial", "SS3 Commercial"], Adeleke: ["SS2 Commercial"],
    Balogun: ["SS3 Commercial"], Danjuma: ["JSS1", "SS2 Commercial"],
    Adewale: ["JSS2"], Nnadi: ["JSS3"],
  };

  const edges = [];
  for (const [name, arms] of Object.entries(DAY_ARMS)) {
    for (const arm of arms) {
      edges.push({ teacher: name, arm });
    }
  }

  const coloring = colorDay(edges, 8);
  const err = verifyColoring(edges, coloring);
  assert.equal(err, null, `Real demo day conflict: ${err}`);

  // Every edge should be colored (max degree ≤ 8 per day).
  assert.equal(
    Object.keys(coloring).length,
    edges.length,
    "All single-day edges should be colored"
  );

  // All periods are in range 1–8.
  for (const period of Object.values(coloring)) {
    assert.ok(period >= 1 && period <= 8, `Period ${period} out of range`);
  }
});

// ── verifyColoring helper ────────────────────────────────────────────

test("verifyColoring detects a teacher-side conflict", () => {
  const edges = [
    { teacher: "T1", arm: "A" },
    { teacher: "T1", arm: "B" },
  ];
  // Both colored 1 — that's a conflict.
  const bad = { "T1|A": 1, "T1|B": 1 };
  const err = verifyColoring(edges, bad);
  assert.ok(err.includes("T1"), "Should mention the conflicting teacher");
  assert.ok(err.includes("period 1"), "Should mention the conflicting period");
});

test("verifyColoring detects an arm-side conflict", () => {
  const edges = [
    { teacher: "T1", arm: "A" },
    { teacher: "T2", arm: "A" },
  ];
  const bad = { "T1|A": 1, "T2|A": 1 };
  const err = verifyColoring(edges, bad);
  assert.ok(err.includes("Arm A"), "Should mention the conflicting arm");
});

test("verifyColoring ignores uncolored edges", () => {
  const edges = [{ teacher: "T1", arm: "A" }, { teacher: "T1", arm: "B" }];
  // Only one edge colored — the other is undefined (skipped by maxColors).
  const partial = { "T1|A": 1 };
  const err = verifyColoring(edges, partial);
  assert.equal(err, null);
});

// ── Star graph (one teacher, many arms) ──────────────────────────────

test("star graph: one teacher, N arms — all get different periods", () => {
  const N = 6;
  const edges = Array.from({ length: N }, (_, i) => ({
    teacher: "T1",
    arm: `Arm${i + 1}`,
  }));
  const result = colorDay(edges);
  const periods = Object.values(result);
  assert.equal(new Set(periods).size, N, "All periods distinct");
});

// ── Heavy skew (one arm, many teachers) ──────────────────────────────

test("heavy skew: one arm taught by many teachers", () => {
  const N = 8;
  const edges = Array.from({ length: N }, (_, i) => ({
    teacher: `T${i + 1}`,
    arm: "SS1 Science",
  }));
  const result = colorDay(edges);
  const periods = Object.values(result);
  assert.equal(new Set(periods).size, N, "All periods distinct");
});

// ── Alternating path recoloring triggers ─────────────────────────────

test("recoloring produces valid coloring on a challenging graph", () => {
  // A 3×3 complete bipartite graph — forces König's alternating path logic.
  const edges = ["T1", "T2", "T3"].flatMap((t) =>
    ["A", "B", "C"].map((a) => ({ teacher: t, arm: a }))
  );
  const result = colorDay(edges);
  assert.equal(Object.keys(result).length, 9, "All 9 edges colored");
  const err = verifyColoring(edges, result);
  assert.equal(err, null, `3×3 complete bipartite conflict: ${err}`);
});
