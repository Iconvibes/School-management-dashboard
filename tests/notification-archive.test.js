/**
 * Notification auto-archive tests — through the REAL routes.
 *
 *   1. GET /api/notifications hides rows older than the school's retention
 *      window; ?view=archived returns that history; unread always reflects
 *      the inbox view
 *   2. PATCH /api/school rejects invalid retention values and accepts a
 *      valid one (the "configurable" half of the feature)
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
const { PATCH: patchSchool } = await import("../src/app/api/school/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-notif-arch-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

describe("GET /api/notifications?view=archived", () => {
  it("hides old rows from the inbox, serves them as history, keeps unread on the inbox", async () => {
    as(admin);
    await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: ["admin@edutrack.app"],
      subject: "Fresh",
      preview: "p",
      body: "b",
    });
    const old = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_reminder",
      to: ["admin@edutrack.app"],
      subject: "Old",
      preview: "p",
      body: "b",
    });
    demoStore.__persistNow();
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    data.notifications.find((n) => n.id === old.id).createdAt = new Date(
      Date.now() - 200 * 24 * 60 * 60 * 1000
    ).toISOString();
    fs.writeFileSync(file, JSON.stringify(data));
    demoStore.__reloadDemoStore();

    const inbox = await (await getNotifications(json("/api/notifications"))).json();
    assert.deepEqual(inbox.notifications.map((n) => n.subject), ["Fresh"], "inbox is lean");
    assert.equal(inbox.unread, 1);

    const archived = await (
      await getNotifications(json("/api/notifications?view=archived"))
    ).json();
    assert.deepEqual(archived.notifications.map((n) => n.subject), ["Old"], "history is served");
    assert.equal(archived.unread, 1, "unread always reflects the inbox view");
  });
});

describe("PATCH /api/school — notificationRetentionDays", () => {
  it("rejects out-of-range and non-integer values", async () => {
    as(admin);
    for (const bad of [0, -5, 3651, 2.5, "many"]) {
      const res = await patchSchool(
        json("/api/school", { method: "PATCH", body: { notificationRetentionDays: bad } })
      );
      assert.equal(res.status, 400, `retention ${bad} must be rejected`);
    }
  });

  it("accepts a valid window and persists it on the school", async () => {
    as(admin);
    const res = await patchSchool(
      json("/api/school", { method: "PATCH", body: { notificationRetentionDays: 30 } })
    );
    assert.equal(res.status, 200);
    const updated = await demoStore.getSchoolById(school.id);
    assert.equal(updated.notificationRetentionDays, 30);
  });
});
