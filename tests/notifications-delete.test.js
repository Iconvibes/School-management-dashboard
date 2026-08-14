/**
 * Notification delete tests — the admin inbox cleanup, through the REAL route.
 *
 *   1. SUPER_ADMIN deletes one notification → it disappears from GET and the
 *      unread count drops
 *   2. \"Clear all\" (all ids) empties the inbox
 *   3. Tenant scope — deleting one school's ids never touches another school
 *   4. RBAC — a TEACHER gets 403 on the delete endpoint
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
const { GET: getNotifications } = await import(
  "../src/app/api/notifications/route.js"
);
const { POST: postDelete } = await import(
  "../src/app/api/notifications/delete/route.js"
);
const { GET: getParentReminders } = await import(
  "../src/app/api/parent/reminders/route.js"
);
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-notif-del-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

const getInbox = () => getNotifications(json("/api/notifications"));

async function seedInbox(n) {
  const created = [];
  for (let i = 0; i < n; i += 1) {
    created.push(
      await demoStore.createNotification({
        schoolId: school.id,
        kind: i % 2 === 0 ? "fee_payment" : "fee_reminder",
        to: ["admin@edutrack.app"],
        subject: `Notice ${i}`,
        preview: `preview ${i}`,
        body: `body ${i}`,
      })
    );
  }
  return created;
}

describe("POST /api/notifications/delete", () => {
  it("deletes one notification and drops the unread count", async () => {
    as(admin);
    const [a, b] = await seedInbox(2);

    const res = await postDelete(
      json("/api/notifications/delete", { method: "POST", body: { ids: [a.id] } })
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { deleted: 1 });

    const body = await (await getInbox()).json();
    const remaining = body.notifications.map((n) => n.subject);
    assert.deepEqual(remaining, ["Notice 1"], "only the other notification remains");
    assert.equal(body.unread, 1, "unread count reflects the deletion");
  });

  it("clears the whole inbox when sent every id", async () => {
    as(admin);
    const created = await seedInbox(4);
    const res = await postDelete(
      json("/api/notifications/delete", {
        method: "POST",
        body: { ids: created.map((n) => n.id) },
      })
    );
    assert.deepEqual(await res.json(), { deleted: 4 });

    const body = await (await getInbox()).json();
    assert.deepEqual(body.notifications, []);
    assert.equal(body.unread, 0);
  });

  it("is SOFT — deleting from the admin inbox never removes a parent's copy", async () => {
    const parent = await demoStore.findUserById(
      (await demoStore.listUsers({ schoolId: school.id, role: "PARENT" }))[0].id
    );
    const reminder = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_reminder",
      to: [parent.email],
      subject: "Term one balance",
      preview: "p",
      body: "b",
    });

    // The admin deletes it from their inbox…
    as(admin);
    const del = await postDelete(
      json("/api/notifications/delete", { method: "POST", body: { ids: [reminder.id] } })
    );
    assert.deepEqual(await del.json(), { deleted: 1 });
    const inbox = await (await getInbox()).json();
    assert.deepEqual(inbox.notifications, [], "admin inbox no longer shows it");

    // …but the parent still sees their reminder copy.
    as(parent);
    const parentAfter = await (await getParentReminders()).json();
    assert.deepEqual(
      parentAfter.reminders.map((r) => r.subject),
      ["Term one balance"],
      "parent keeps their copy after the admin deletes from the inbox"
    );
  });

  it("an empty id list is a harmless no-op", async () => {
    as(admin);
    await seedInbox(1);
    const res = await postDelete(
      json("/api/notifications/delete", { method: "POST", body: { ids: [] } })
    );
    assert.deepEqual(await res.json(), { deleted: 0 });
    assert.equal((await (await getInbox()).json()).notifications.length, 1);
  });

  it("is tenant-scoped — another school's notifications are never touched", async () => {
    as(admin);
    const [mine] = await seedInbox(1);

    // A second school with its own notification.
    const { school: other } = await demoStore.createSchoolAndAdmin({
      schoolName: "Delete Neighbour",
      adminName: "Neighbour Admin",
      email: "neighbour@other.academy",
      password: "admin123",
    });
    const theirs = await demoStore.createNotification({
      schoolId: other.id,
      kind: "info",
      to: [],
      subject: "Theirs",
      preview: "p",
      body: "b",
    });

    // Deleting MY ids can't remove THEIR notification…
    const res = await postDelete(
      json("/api/notifications/delete", {
        method: "POST",
        body: { ids: [theirs.id, mine.id] },
      })
    );
    assert.deepEqual(await res.json(), { deleted: 1 }, "only my own was deleted");
    assert.equal((await demoStore.listNotifications(other.id, admin.id)).length, 1);
  });

  it("a TEACHER gets 403", async () => {
    const teacher = await demoStore.findUserByEmailInSchool(school.id, "a.okafor@edutrack.app");
    as(teacher);
    const res = await postDelete(
      json("/api/notifications/delete", { method: "POST", body: { ids: ["whatever"] } })
    );
    assert.equal(res.status, 403);
  });
});
