/**
 * Per-school reminder-template tests — the persisted { parent, student }
 * wording the Send reminder modal prefills and term-rollover reminders reuse.
 *
 * Drives the REAL routes (headers mock + signed session token):
 *   1. GET  /api/school/reminder-templates — empty until customized
 *   2. PUT  /api/school/reminder-templates — saves, validates length, RBAC
 *   3. POST /api/fees/reminders — sends the parent + student variants and
 *      AUTO-SAVES whatever non-blank wording was sent as the school's template
 *   4. A TEACHER (no fees.remind) gets 403 on both endpoints
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as demoStore from "../src/lib/demo-store.js";
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
const { GET: getTemplates, PUT: putTemplates } = await import(
  "../src/app/api/school/reminder-templates/route.js"
);
const { POST: postReminders } = await import(
  "../src/app/api/fees/reminders/route.js"
);
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-templates-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;
let school;
let admin;
let bursar;

beforeEach(async () => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  const [match] = await demoStore.searchSchools("Greenfield");
  school = await demoStore.getSchoolById(match.id);
  admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
  bursar = await demoStore.findUserByEmailInSchool(school.id, "bursar@edutrack.app");
});

afterEach(() => {
  __setSessionToken("");
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

function as(user) {
  __setSessionToken(signToken({ userId: user.id, role: user.role, schoolId: user.schoolId }));
}

const json = (url, { method = "GET", body } = {}) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

describe("GET /api/school/reminder-templates", () => {
  it("returns empty templates until the school customizes", async () => {
    as(admin);
    const res = await getTemplates();
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).templates, {});
  });

  it("returns the saved wording after a PUT round-trip", async () => {
    as(admin);
    await putTemplates(
      json("/api/school/reminder-templates", {
        method: "PUT",
        body: { parent: "Settle {balance} please", student: "Ask a guardian to pay {balance}" },
      })
    );
    const res = await getTemplates();
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).templates, {
      parent: "Settle {balance} please",
      student: "Ask a guardian to pay {balance}",
    });
  });
});

describe("PUT /api/school/reminder-templates", () => {
  it("persists both variants on the school and trims whitespace", async () => {
    as(admin);
    const res = await putTemplates(
      json("/api/school/reminder-templates", {
        method: "PUT",
        body: { parent: "  Hi {name}  ", student: "   " },
      })
    );
    assert.equal(res.status, 200);
    const stored = await demoStore.getSchoolById(school.id);
    assert.equal(stored.reminderTemplates.parent, "Hi {name}");
    assert.equal(stored.reminderTemplates.student, "");
  });

  it("rejects messages over 4000 characters", async () => {
    as(admin);
    const res = await putTemplates(
      json("/api/school/reminder-templates", {
        method: "PUT",
        body: { parent: "x".repeat(4001) },
      })
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /too long/);
  });
});

describe("POST /api/fees/reminders auto-saves the sent wording", () => {
  it("persists parent + student variants and sends each recipient their own copy", async () => {
    as(admin);
    // A parent-linked defaulter (Kunle → Folake) and a parent-less defaulter.
    const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    const parent = await demoStore.findUserByEmailInSchool(school.id, "p.adebayo@edutrack.app");
    const linked = students.find((s) => s.parentId === parent.id);
    assert.ok(linked, "seed links Folake to a student");
    const orphan = await demoStore.createUser({
      schoolId: school.id,
      name: "Template Orphan",
      email: "template.orphan@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS1 Arts",
    });

    const res = await postReminders(
      json("/api/fees/reminders", {
        method: "POST",
        body: {
          studentIds: [linked.id, orphan.id],
          message: "Dear {name}, kindly settle {balance}",
          messageStudent: "{name}, pay {balance} at the office",
        },
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sent.length, 2);

    // Saved as the school's templates — the modal prefills these next time.
    const stored = await demoStore.getSchoolById(school.id);
    assert.equal(stored.reminderTemplates.parent, "Dear {name}, kindly settle {balance}");
    assert.equal(stored.reminderTemplates.student, "{name}, pay {balance} at the office");

    // Each recipient got their own variant.
    const all = await demoStore.listNotifications(school.id, admin.id);
    const byTo = Object.fromEntries(
      all.filter((n) => n.kind === "fee_reminder").map((n) => [n.to[0], n])
    );
    assert.ok(byTo[parent.email].body.includes("Dear Mrs. Folake Adebayo,"));
    assert.ok(!byTo[parent.email].body.includes("pay {balance} at the office"));
    assert.ok(byTo["template.orphan@edutrack.app"].body.includes("Template Orphan, pay"));
    assert.ok(!byTo["template.orphan@edutrack.app"].body.includes("Dear"), "student never gets the parent wording");
  });

  it("keeps an existing saved variant when only the other one is sent", async () => {
    as(admin);
    await demoStore.updateSchool(school.id, {
      reminderTemplates: { parent: "Existing parent copy", student: "Existing student copy" },
    });

    // Send with only a parent message — the student variant must survive.
    const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    const parent = await demoStore.findUserByEmailInSchool(school.id, "p.adebayo@edutrack.app");
    const linked = students.find((s) => s.parentId === parent.id);
    const res = await postReminders(
      json("/api/fees/reminders", {
        method: "POST",
        body: { studentIds: [linked.id], message: "New parent wording" },
      })
    );
    assert.equal(res.status, 200);

    const stored = await demoStore.getSchoolById(school.id);
    assert.equal(stored.reminderTemplates.parent, "New parent wording");
    assert.equal(stored.reminderTemplates.student, "Existing student copy", "untouched variant survives");
  });
});

describe("RBAC", () => {
  it("a TEACHER gets 403 on both GET and PUT", async () => {
    const teacher = await demoStore.findUserByEmailInSchool(school.id, "a.okafor@edutrack.app");
    assert.ok(teacher, "seed has a teacher");
    as(teacher);

    assert.equal((await getTemplates()).status, 403);
    const putRes = await putTemplates(
      json("/api/school/reminder-templates", {
        method: "PUT",
        body: { parent: "nope" },
      })
    );
    assert.equal(putRes.status, 403);
  });

  it("a BURSAR can read and write the wording (they send reminders too)", async () => {
    as(bursar);
    const putRes = await putTemplates(
      json("/api/school/reminder-templates", {
        method: "PUT",
        body: { parent: "Bursar wording {name}" },
      })
    );
    assert.equal(putRes.status, 200);
    const getRes = await getTemplates();
    assert.equal((await getRes.json()).templates.parent, "Bursar wording {name}");
  });
});
