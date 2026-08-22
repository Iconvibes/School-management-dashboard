/**
 * König's bipartite edge-coloring algorithm.
 *
 * Given a set of edges in a bipartite graph (two vertex sets — e.g. teachers
 * × class arms), assigns each edge a **color** (a period number, 1-indexed)
 * such that no two edges sharing a vertex receive the same color.
 *
 * This is the provably-correct way to schedule a school timetable: edges are
 * slots (a teacher teaches a subject in an arm), and colors are periods.
 * With max degree Δ ≤ number of periods, a valid coloring ALWAYS exists.
 *
 * The greedy "lowest free period" heuristic can wedge — a full-load teacher's
 * last booking finding its only free period blocked — but König's alternating-
 * path recoloring cannot. The algorithm is deterministic: slots are processed
 * in the order given, so the same input always produces the same output.
 *
 * Complexity: O(E · Δ) where E = edge count and Δ = max degree.
 *
 * @module konig
 */

/**
 * Color the edges of a bipartite graph using König's algorithm.
 *
 * @param {Array<{ teacher: string, arm: string }>} edges
 *   The edge list. Each edge connects one teacher to one arm. Duplicate
 *   teacher-arm pairs are overwritten (last wins); a teacher-arm pair should
 *   appear at most once per day.
 *
 * @param {number} [maxColors=8]
 *   The number of available colors (periods). The algorithm needs at least
 *   Δ (the max degree) colors; if Δ > maxColors, some edges will be left
 *   uncolored (undefined in the result). In practice Δ ≤ 8 for a school
 *   timetable with 8 periods.
 *
 * @returns {Object.<string, number>}
 *   A map from `"teacher|arm"` to the assigned color (period number, 1-indexed).
 *   Only edges that were successfully colored appear in the result.
 *
 * @example
 *   const colors = colorDay([
 *     { teacher: "t1", arm: "SS1 Science" },
 *     { teacher: "t1", arm: "SS1 Arts" },
 *     { teacher: "t2", arm: "SS1 Science" },
 *   ]);
 *   // colors["t1|SS1 Science"] === 1
 *   // colors["t1|SS1 Arts"] === 2
 *   // colors["t2|SS1 Science"] === 2
 */
export function colorDay(edges, maxColors = 8) {
  // `incident` is the SINGLE source of truth: "vertex|period" -> edge key.
  // mex() reads it directly (8 periods, so O(8) per lookup), which keeps
  // the ≤1-edge-per-color invariant trivially consistent — no parallel
  // color sets to drift. Two subtleties that naive implementations miss:
  //
  //  1. When an alternating path passes through a vertex TWICE (an
  //     alternating cycle), recoloring must not delete the other edge's
  //     entry: a path edge's OLD color equals its neighbour's NEW color at
  //     the shared vertex, so deletes are guarded with `=== key`.
  //  2. The path walk can enter an alternating cycle; a visited set clips
  //     it. The clipped path still recolors validly (the re-entered vertex
  //     has two path edges swapped in opposite directions, netting to zero).
  const colorOf = {}; // "teacher|arm" -> period
  const incident = {}; // "vertex|period" -> "teacher|arm"

  const vertexHas = (vertex, period) => !!incident[`${vertex}|${period}`];

  /** Find the smallest color not yet used by this vertex. */
  const mex = (vertex) => {
    let c = 1;
    while (vertexHas(vertex, c)) c++;
    return c;
  };

  /** Given an edge key "a|b" and one endpoint, return the other. */
  const otherVertex = (key, vertex) => {
    const [a, b] = key.split("|");
    return a === vertex ? b : a;
  };

  /** Recolor an edge from one color to another, updating the incident map. */
  const recolor = (key, from, to) => {
    const [b, a] = key.split("|"); // key is "teacher|arm"
    if (incident[`${b}|${from}`] === key) delete incident[`${b}|${from}`];
    if (incident[`${a}|${from}`] === key) delete incident[`${a}|${from}`];
    incident[`${b}|${to}`] = key;
    incident[`${a}|${to}`] = key;
    colorOf[key] = to;
  };

  /**
   * Walk a maximal alternating path from `start` with colors firstColor,
   * then c1/c2 alternating; clipped at any vertex already on the path
   * (handles alternating cycles without infinite loops).
   */
  const walk = (start, firstColor, c1, c2) => {
    const path = [];
    const visited = new Set([start]);
    let cur = start;
    let need = firstColor;
    while (vertexHas(cur, need)) {
      const pk = incident[`${cur}|${need}`];
      path.push(pk);
      cur = otherVertex(pk, cur);
      need = need === c1 ? c2 : c1;
      if (visited.has(cur)) break;
      visited.add(cur);
    }
    return path;
  };

  for (const e of edges) {
    const u = e.teacher;
    const v = e.arm;
    const alpha = mex(u);
    const beta = mex(v);
    const key = `${u}|${v}`;

    // Skip if we've already exceeded maxColors.
    if (alpha > maxColors || beta > maxColors) continue;

    if (alpha === beta) {
      // Both endpoints have the same free color — assign it directly.
      colorOf[key] = alpha;
    } else if (alpha < beta) {
      // Path from the ARM v starting with alpha (v holds an alpha edge:
      // alpha < beta = mex(v)). Recolor, then place (u,v) at alpha.
      const path = walk(v, alpha, alpha, beta);
      path.forEach((pk) =>
        recolor(pk, colorOf[pk], colorOf[pk] === alpha ? beta : alpha)
      );
      colorOf[key] = alpha;
    } else {
      // Symmetric: path from the TEACHER u starting with beta (u holds a
      // beta edge: beta < alpha = mex(u)). Place (u,v) at beta.
      const path = walk(u, beta, beta, alpha);
      path.forEach((pk) =>
        recolor(pk, colorOf[pk], colorOf[pk] === beta ? alpha : beta)
      );
      colorOf[key] = beta;
    }

    incident[`${u}|${colorOf[key]}`] = key;
    incident[`${v}|${colorOf[key]}`] = key;
  }

  return colorOf;
}

/**
 * Verify that a coloring is valid: no two edges sharing a vertex
 * (teacher or arm) have the same color. Returns null if valid, or
 * a description of the first violation found.
 *
 * @param {Array<{ teacher: string, arm: string }>} edges
 * @param {Object.<string, number>} coloring  The output of colorDay().
 * @returns {string|null}  Null if valid; error message if not.
 */
export function verifyColoring(edges, coloring) {
  // Check teacher-side conflicts.
  const teacherColors = {}; // "teacher|period" -> arm
  for (const e of edges) {
    const key = `${e.teacher}|${e.arm}`;
    const color = coloring[key];
    if (color === undefined) continue; // uncolored (skipped by maxColors)
    const tk = `${e.teacher}|${color}`;
    if (teacherColors[tk]) {
      return `Teacher ${e.teacher} has two edges in period ${color}: ${teacherColors[tk]} and ${e.arm}`;
    }
    teacherColors[tk] = e.arm;
  }

  // Check arm-side conflicts.
  const armColors = {}; // "arm|period" -> teacher
  for (const e of edges) {
    const key = `${e.teacher}|${e.arm}`;
    const color = coloring[key];
    if (color === undefined) continue;
    const ak = `${e.arm}|${color}`;
    if (armColors[ak]) {
      return `Arm ${e.arm} has two edges in period ${color}: teacher ${armColors[ak]} and ${e.teacher}`;
    }
    armColors[ak] = e.teacher;
  }

  return null;
}
