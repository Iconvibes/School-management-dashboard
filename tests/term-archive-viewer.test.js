/**
 * Term-archive viewer tests — the "Previous Terms" admin tab.
 *
 * A term rollover snapshots the old term's scores + attendance into the
 * archive; this suite pins the store helpers that group those rows into a
 * term summary and the API route that joins them with student names and
 * rebuilds report-card payloads (with class positions from the archived
 * cohort), plus the RBAC gate (SUPER_ADMIN/REGISTRAR only).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as demoStore from "../src/lib/demo-store.js";
import { buildAlumniCsv } from "../src/lib/alumni-csv.js";
import { signToken } from "../src/lib/token.js";
import { __setSessionToken } from "./helpers/headers-mock.js";

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
const { GET } = await import("../src/app/api/school/archives/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-archives-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
});

afterEach(() => {
  __setSessionToken("");
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

// Roll the seeded school over once so First Term's data lands in the archive.
async function seededArchivedSchool() {
  const [school] = await demoStore.searchSchools("Greenfield");
  const res = await demoStore.rolloverTerm(school.id, { newTerm: "Second Term" });
  assert.ok(!res.error, `rollover should succeed: ${res.error || ""}`);
  return school;
}

describe("store — archive grouping + detail", () => {
  it("getTermArchiveTerms groups the archived term with per-arm counts", async () => {
    const school = await seededArchivedSchool();
    const terms = await demoStore.getTermArchiveTerms(school.id);

    assert.equal(terms.length, 1);
    const t = terms[0];
    assert.equal(t.session, "2025/2026");
    assert.equal(t.term, "First Term");
    assert.equal(t.scoreCount, 73);
    assert.equal(t.attendanceCount, 140);
    assert.equal(t.students, 16); // the archived cohort roster, never counted as scores

    // Every arm with archived data appears with its own counts.
    const jss1 = t.arms.find((a) => a.classArm === "JSS1");
    assert.ok(jss1, "JSS1 should be in the archived arms");
    assert.equal(jss1.scoreCount, 10); // 2 JSS1 students × 5 subjects
    assert.equal(jss1.attendanceCount, 20); // 20 school days, one register per day
    assert.ok(
      t.arms.every((a) => a.scoreCount > 0 || a.attendanceCount > 0 || a.students > 0)
    );
  });

  it("an archived term with NO scores/attendance still appears (fresh school)", async () => {
    // The user's scenario: a brand-new school rolls over with students but no
    // marks entered — the archive holds only the roster snapshot, and the term
    // must STILL show up in the viewer (0 scores, 0 attendance, N students).
    const { school } = await demoStore.createSchoolAndAdmin({
      schoolName: "Fresh Roll Academy",
      adminName: "Fresh Admin",
      email: "fresh.admin@fresh.academy",
      password: "admin123",
    });
    await demoStore.createUser({
      schoolId: school.id,
      name: "First Kid",
      email: "first.kid@fresh.academy",
      password: "student123",
      role: "STUDENT",
      assignedClass: "JSS1",
    });
    await demoStore.createUser({
      schoolId: school.id,
      name: "Second Kid",
      email: "second.kid@fresh.academy",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });

    const res = await demoStore.rolloverTerm(school.id, { newTerm: "Second Term" });
    assert.ok(!res.error, `rollover should succeed: ${res.error || ""}`);
    // Nothing billed at this fresh school, so nothing carries — the point of
    // this test is that the term itself still shows up in the archive viewer.
    assert.equal(res.counts.carryovers, 0);

    const terms = await demoStore.getTermArchiveTerms(school.id);
    assert.equal(terms.length, 1, "the previous term appears even with no scores/attendance");
    const t = terms[0];
    assert.equal(t.term, "First Term");
    assert.equal(t.scoreCount, 0);
    assert.equal(t.attendanceCount, 0);
    assert.equal(t.students, 2, "the archived cohort roster is counted");

    // Arms appear from the roster too, so the admin can open them and see the
    // cohort even though nothing was scored.
    assert.equal(t.arms.length, 2);
    const jss1 = t.arms.find((a) => a.classArm === "JSS1");
    assert.ok(jss1, "JSS1 appears from the roster snapshot");
    assert.equal(jss1.students, 1);
    assert.equal(jss1.scoreCount, 0);
    assert.equal(jss1.attendanceCount, 0);

    // The detail payload still resolves the cohort (names from the archive).
    const rows = await demoStore.getTermArchiveDetail(school.id, {
      session: "2025/2026",
      term: "First Term",
      classArm: "JSS1",
    });
    assert.equal(rows.filter((r) => r.kind === "student").length, 1);
  });

  it("getTermArchiveDetail returns only rows for the requested session/term/arm", async () => {
    const school = await seededArchivedSchool();
    const rows = await demoStore.getTermArchiveDetail(school.id, {
      session: "2025/2026",
      term: "First Term",
      classArm: "JSS1",
    });
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.session === "2025/2026" && r.term === "First Term" && r.classArm === "JSS1"));
    assert.ok(rows.some((r) => r.kind === "score"));
    assert.ok(rows.some((r) => r.kind === "attendance"));
  });

  it("rollover snapshots the cohort roster (names) without inflating counts", async () => {
    const school = await seededArchivedSchool();
    const roster = await demoStore.listTermArchives(school.id, { kind: "student" });
    assert.equal(roster.length, 16); // every seeded student, not just those with scores
    assert.ok(roster.every((r) => r.kind === "student" && r.studentName));
    const jss1 = roster.find((r) => r.studentId && r.classArm === "JSS1");
    assert.ok(jss1.studentName, "roster rows carry the student name");

    // The roster must NOT inflate the term or per-arm counts.
    const terms = await demoStore.getTermArchiveTerms(school.id);
    assert.equal(terms[0].scoreCount, 73);
    assert.equal(terms[0].attendanceCount, 140);
    assert.equal(terms[0].arms.find((a) => a.classArm === "JSS1").scoreCount, 10);
  });

  it("an empty archive yields an empty summary", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    assert.deepEqual(await demoStore.getTermArchiveTerms(school.id), []);
    assert.deepEqual(
      await demoStore.getTermArchiveDetail(school.id, { session: "2025/2026", term: "First Term" }),
      []
    );
  });
});

describe("getAlumni — archived students no longer on the live roster", () => {
  it("returns nothing while every archived student is still enrolled", async () => {
    const school = await seededArchivedSchool();
    assert.deepEqual(await demoStore.getAlumni(school.id), []);
  });

  it("lists deleted students with their last archived term and arm", async () => {
    const school = await seededArchivedSchool();
    const jss1 = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT", classArm: "JSS1" });
    const musa = jss1.find((s) => s.name === "Musa Sule");
    assert.ok(musa);
    await demoStore.deleteUser(musa.id);

    const alumni = await demoStore.getAlumni(school.id);
    assert.equal(alumni.length, 1);
    assert.equal(alumni[0].studentId, musa.id);
    assert.equal(alumni[0].studentName, "Musa Sule"); // from the archived roster
    assert.equal(alumni[0].classArm, "JSS1");
    assert.equal(alumni[0].lastSession, "2025/2026");
    assert.equal(alumni[0].lastTerm, "First Term");
  });

  it("uses the LAST term the student appears in across multiple archives", async () => {
    const school = await seededArchivedSchool();
    // Roll to Third Term: the First→Second roll archives the First-Term
    // roster, and the Second→Third roll archives the Second-Term roster.
    // A student deleted now is still on BOTH archived rosters, so their last
    // archived appearance is Second Term (Third Term has not been rolled over
    // — it is the live term — so it has no roster snapshot yet).
    await demoStore.rolloverTerm(school.id, { newTerm: "Third Term" });
    const musa = (await demoStore.listUsers({ schoolId: school.id, role: "STUDENT", classArm: "JSS1" })).find(
      (s) => s.name === "Musa Sule"
    );
    await demoStore.deleteUser(musa.id);

    const alumni = await demoStore.getAlumni(school.id);
    const entry = alumni.find((a) => a.studentId === musa.id);
    assert.ok(entry, "the deleted student should be alumni");
    assert.equal(entry.lastTerm, "Second Term");
    assert.equal(entry.lastSession, "2025/2026");
  });
});

describe("GET /api/school/archives — through the real API", () => {
  async function getArchives(actor, query = "") {
    const res = await GET(new Request(`http://localhost/api/school/archives${query}`));
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  it("SUPER_ADMIN sees the archived-term summary", async () => {
    const school = await seededArchivedSchool();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const res = await getArchives(admin);
    assert.equal(res.status, 200);
    assert.equal(res.body.terms.length, 1);
    assert.equal(res.body.terms[0].term, "First Term");
    assert.equal(res.body.terms[0].scoreCount, 73);
  });

  it("detail mode returns report-card payloads with archived cohort positions", async () => {
    const school = await seededArchivedSchool();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const res = await getArchives(
      admin,
      "?session=2025%2F2026&term=First%20Term&classArm=JSS1"
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.term, "First Term");
    assert.equal(res.body.classArm, "JSS1");

    // The synthesized school carries the ARCHIVED term for printing.
    assert.equal(res.body.school.currentSession, "2025/2026");
    assert.equal(res.body.school.currentTerm, "First Term");

    // Both JSS1 students appear with names, scores (+ remarks), attendance
    // and a summary whose position ranks within the archived cohort.
    assert.equal(res.body.students.length, 2);
    for (const st of res.body.students) {
      assert.ok(st.studentName, "student name should be joined from the roster");
      assert.equal(st.classArm, "JSS1");
      assert.ok(st.scores.length > 0, "archived scores should be present");
      assert.ok(st.scores.every((s) => s.remark), "each score should carry a remark");
      assert.ok(st.attendance.total > 0, "archived attendance should be present");
      assert.equal(st.summary.subjects, st.scores.length);
      assert.ok(st.summary.position >= 1 && st.summary.position <= 2);
      assert.equal(st.summary.outOf, 2);
      assert.ok(st.summary.standing.label);
    }
    // Sorted by average, descending.
    const avgs = res.body.students.map((s) => s.summary.average);
    assert.deepEqual(avgs, [...avgs].sort((a, b) => b - a));
  });

  it("a deleted student keeps their archived name on the report card", async () => {
    const school = await seededArchivedSchool();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    // Grab a JSS1 student's id + archived name, then DELETE them from the
    // live roster (graduated/left) — their archive rows must survive.
    const jss1Before = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT", classArm: "JSS1" });
    const student = jss1Before[0];
    assert.ok(await demoStore.deleteUser(student.id));
    assert.equal(await demoStore.findUserById(student.id), null);

    const res = await getArchives(
      admin,
      "?session=2025%2F2026&term=First%20Term&classArm=JSS1"
    );
    assert.equal(res.status, 200);
    const entry = res.body.students.find((s) => s.studentId === student.id);
    assert.ok(entry, "the deleted student should still appear in the archived cohort");
    assert.equal(entry.studentName, student.name); // from the archive roster, not the live one
    assert.ok(entry.scores.length > 0, "their archived scores are still printable");
    assert.ok(entry.attendance.total > 0, "their archived attendance is still printable");
  });

  it("alumni mode lists only departed students with their last term", async () => {
    const school = await seededArchivedSchool();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    // Nobody has left yet.
    let res = await getArchives(admin, "?alumni=1");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.alumni, []);

    // Delete a student, then the alumni list picks them up with last term.
    const jss1 = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT", classArm: "JSS1" });
    await demoStore.deleteUser(jss1[0].id);
    res = await getArchives(admin, "?alumni=1");
    assert.equal(res.status, 200);
    assert.equal(res.body.alumni.length, 1);
    assert.equal(res.body.alumni[0].studentName, jss1[0].name);
    assert.equal(res.body.alumni[0].lastTerm, "First Term");
    assert.equal(res.body.alumni[0].lastSession, "2025/2026");
  });

  it("format=csv returns the alumni list as a downloadable attachment", async () => {
    const school = await seededArchivedSchool();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const jss1 = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT", classArm: "JSS1" });
    await demoStore.deleteUser(jss1[0].id);

    const res = await GET(new Request("http://localhost/api/school/archives?alumni=1&format=csv"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
    const disposition = res.headers.get("Content-Disposition");
    assert.ok(disposition.startsWith("attachment;"), `attachment disposition: ${disposition}`);
    assert.match(disposition, /filename="alumni-greenfield-international-school-\d{4}-\d{2}-\d{2}\.csv"/);

    // The wire bytes carry the UTF-8 BOM (EF BB BF) — TextDecoder strips it on
    // .text(), so the raw bytes are the proof a browser download keeps it.
    const buf = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual([...buf.slice(0, 3)], [0xef, 0xbb, 0xbf]);

    // The payload after the BOM is byte-identical to the tested pure builder
    // (header + row, CRLF endings) — the server and browser exports agree.
    const expected = buildAlumniCsv(await demoStore.getAlumni(school.id));
    assert.ok(expected.startsWith("\uFEFFStudent name,Last class arm,Last session,Last term\r\n"));
    assert.equal(new TextDecoder().decode(buf.slice(3)), expected.slice(1));
    assert.ok(expected.includes(jss1[0].name));
  });

  it("format=csv still enforces the role gate", async () => {
    const school = await seededArchivedSchool();
    const bursar = await demoStore.findUserByEmailInSchool(school.id, "bursar@edutrack.app");
    __setSessionToken(signToken({ userId: bursar.id, role: bursar.role, schoolId: school.id }));
    const res = await GET(new Request("http://localhost/api/school/archives?alumni=1&format=csv"));
    assert.equal(res.status, 403);
  });

  it("a REGISTRAR may read archives; a BURSAR cannot", async () => {
    const school = await seededArchivedSchool();
    const registrar = await demoStore.findUserByEmailInSchool(school.id, "registrar@edutrack.app");
    __setSessionToken(signToken({ userId: registrar.id, role: registrar.role, schoolId: school.id }));
    assert.equal((await getArchives(registrar)).status, 200);

    const bursar = await demoStore.findUserByEmailInSchool(school.id, "bursar@edutrack.app");
    __setSessionToken(signToken({ userId: bursar.id, role: bursar.role, schoolId: school.id }));
    assert.equal((await getArchives(bursar)).status, 403);
  });

  it("an unauthenticated request is rejected", async () => {
    const res = await GET(new Request("http://localhost/api/school/archives"));
    assert.equal(res.status, 401);
  });
});
