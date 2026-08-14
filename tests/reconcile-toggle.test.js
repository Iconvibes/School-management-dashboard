/**
 * Reconcile & forward × admin-deletion toggle — through the REAL routes.
 *
 * The school setting `reconcileDeletedReminders` decides whether reminders
 * the admin deleted from the inbox stay eligible for the Reconcile & forward
 * list:
 *   1. Default (off): a deleted reminder disappears from reconcile too
 *   2. On: the same deleted reminder returns to the list and forwards once
 *      the student's parent is linked
 *   3. PATCH /api/school rejects non-boolean values
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
const { GET: getReconcile, POST: postReconcile } = await import(
  "../src/app/api/fees/reconcile/route.js"
);
const { POST: postDelete } = await import(
  "../src/app/api/notifications/delete/route.js"
);
const { PATCH: patchSchool } = await import("../src/app/api/school/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-reconcile-toggle-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;
let school;
let admin;

beforeEach(async () => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  const [match] = await demoStore.searchSchools("Greenfield");
  school = await demoStore.getSchoolById(match.id);
  admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
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

/** A parent-less defaulter + a student-addressed reminder + a NOW-linked parent. */
async function seedForwardableReminder() {
  const student = await demoStore.createUser({
    schoolId: school.id,
    name: "Toggle Kid",
    email: "toggle.kid@edutrack.app",
    password: "student123",
    role: "STUDENT",
    assignedClass: "SS1 Science",
  });
  const reminder = await demoStore.createNotification({
    schoolId: school.id,
    kind: "fee_reminder",
    to: [student.email],
    subject: "Fee reminder · Toggle Kid",
    preview: "p",
    body: "b",
    amount: 50000,
  });
  const parent = await demoStore.createUser({
    schoolId: school.id,
    name: "Mrs. Toggle",
    email: "mrs.toggle@edutrack.app",
    password: "parent123",
    role: "PARENT",
  });
  await demoStore.updateUser(student.id, { parentId: parent.id });
  return { student, parent, reminder };
}

describe("Reconcile & forward × admin deletion toggle", () => {
  it("default (off): a deleted reminder disappears from reconcile too", async () => {
    as(admin);
    const { student, reminder } = await seedForwardableReminder();

    const before = await (await getReconcile()).json();
    assert.equal(before.pending.length, 1, "baseline: forwardable");

    const del = await postDelete(
      json("/api/notifications/delete", { method: "POST", body: { ids: [reminder.id] } })
    );
    assert.deepEqual(await del.json(), { deleted: 1 });

    const after = await (await getReconcile()).json();
    assert.equal(
      after.pending.length,
      0,
      "deleted reminder is also removed from Reconcile & forward by default"
    );
    assert.ok(
      !after.pending.some((p) => p.studentName === student.name),
      "the student is not listed"
    );
  });

  it("on: the same deleted reminder returns to reconcile and forwards to the parent", async () => {
    as(admin);
    const { student, parent, reminder } = await seedForwardableReminder();

    // Admin deletes the reminder from the inbox…
    await postDelete(
      json("/api/notifications/delete", { method: "POST", body: { ids: [reminder.id] } })
    );
    assert.equal((await (await getReconcile()).json()).pending.length, 0);

    // …then the school opts into keeping deleted reminders forwardable.
    const patch = await patchSchool(
      json("/api/school", {
        method: "PATCH",
        body: { reconcileDeletedReminders: true },
      })
    );
    assert.equal(patch.status, 200);
    assert.equal((await demoStore.getSchoolById(school.id)).reconcileDeletedReminders, true);

    const listed = await (await getReconcile()).json();
    assert.equal(listed.pending.length, 1, "deleted reminder is forwardable again");
    assert.equal(listed.pending[0].studentName, student.name);
    assert.equal(listed.pending[0].amount, 50000);

    // Forwarding still works — parent gets the copy, original is stamped.
    const res = await postReconcile();
    assert.equal(res.status, 200);
    const { forwarded } = await res.json();
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].studentName, student.name);

    const parentAll = await demoStore.listNotifications(school.id, parent.id);
    const mine = parentAll.filter(
      (n) => n.kind === "fee_reminder" && (n.to || []).includes(parent.email)
    );
    assert.equal(mine.length, 1, "the parent received the forwarded copy");
    const original = await demoStore.listNotifications(school.id, admin.id, {
      includeDeleted: true,
    });
    assert.ok(
      original.find((n) => n.id === reminder.id)?.reconciledAt,
      "original stamped reconciledAt — never forwarded twice"
    );
  });

  it("PATCH /api/school rejects a non-boolean value", async () => {
    as(admin);
    const res = await patchSchool(
      json("/api/school", {
        method: "PATCH",
        body: { reconcileDeletedReminders: "yes" },
      })
    );
    assert.equal(res.status, 400);
  });
});
