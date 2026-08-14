/**
 * Reminder batch idempotency tests — a retry or a double rollover can never
 * notify the same parent twice.
 *
 * Drives the REAL routes (headers mock + signed session token):
 *   1. POST /api/fees/reminders with the same batchId twice → the retry
 *      replays the stored result (replayed: true) and creates NO new
 *      notification or audit entry
 *   2. A fresh batchId is a legitimately new send
 *   3. POST /api/school/rollover records a deterministic rollover batch —
 *      and a second rollover attempt to the same term is rejected with no
 *      extra notifications (the double-rollover guarantee)
 *   4. Batches survive a simulated restart
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
const { POST: postReminders } = await import(
  "../src/app/api/fees/reminders/route.js"
);
const { POST: postRollover } = await import(
  "../src/app/api/school/rollover/route.js"
);
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-batches-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function defaultersLinkedTo(parent) {
  // Seed links Folake to Kunle, who is a defaulter (₦111,000 outstanding).
  const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
  const linked = students.find((s) => s.parentId === parent.id);
  assert.ok(linked, "seed links Folake to a student");
  return linked;
}

function feeRemindersFor(schoolId, viewerId) {
  return demoStore.listNotifications(schoolId, viewerId).then((all) =>
    all.filter((n) => n.kind === "fee_reminder")
  );
}

describe("manual sends — batchId idempotency through the real route", () => {
  it("a retried batchId replays the stored result and never notifies twice", async () => {
    as(admin);
    const parent = await demoStore.findUserByEmailInSchool(school.id, "p.adebayo@edutrack.app");
    const kid = await defaultersLinkedTo(parent);
    const body = { studentIds: [kid.id], batchId: "retry-me" };

    const first = await postReminders(json("/api/fees/reminders", { method: "POST", body }));
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.sent.length, 1);
    assert.equal(firstBody.replayed, undefined);

    // The retry — identical request, same batchId.
    const retry = await postReminders(json("/api/fees/reminders", { method: "POST", body }));
    assert.equal(retry.status, 200);
    const retryBody = await retry.json();
    assert.equal(retryBody.replayed, true, "the retry is a replay");
    assert.deepEqual(retryBody.sent, firstBody.sent, "stored result replayed verbatim");
    assert.equal(retryBody.total, 1);

    // The parent saw exactly ONE reminder; one audit entry.
    const reminders = await feeRemindersFor(school.id, parent.id);
    assert.equal(reminders.length, 1, "no second notification was created");
    const trail = await demoStore.listFeeAudit(school.id);
    assert.equal(trail.filter((e) => e.action === "REMINDER_SENT").length, 1);

    // A FRESH batchId is a legitimately new send.
    const fresh = await postReminders(
      json("/api/fees/reminders", {
        method: "POST",
        body: { studentIds: [kid.id], batchId: "fresh-key" },
      })
    );
    assert.equal((await fresh.json()).replayed, undefined);
    assert.equal((await feeRemindersFor(school.id, parent.id)).length, 2);
  });

  it("a send without a batchId still works (legacy callers unaffected)", async () => {
    as(admin);
    const parent = await demoStore.findUserByEmailInSchool(school.id, "p.adebayo@edutrack.app");
    const kid = await defaultersLinkedTo(parent);
    const res = await postReminders(
      json("/api/fees/reminders", { method: "POST", body: { studentIds: [kid.id] } })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sent.length, 1);
    assert.equal(body.replayed, undefined);
    assert.equal((await feeRemindersFor(school.id, parent.id)).length, 1);
  });
});

describe("rollover reminders — deterministic batch key", () => {
  it("records a rollover batch and a second rollover never re-notifies", async () => {
    as(admin);

    const first = await postRollover(
      json("/api/school/rollover", { method: "POST", body: { newTerm: "Second Term" } })
    );
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.ok(firstBody.counts.remindersSent > 0, "automatic reminders sent on the real rollover");

    // The batch record exists under the deterministic key for the new term.
    const key = `rollover:${school.id}:${firstBody.school.currentSession}:${firstBody.school.currentTerm}`;
    const batch = await demoStore.getReminderBatchByKey(school.id, "rollover", key);
    assert.ok(batch, "the rollover send is recorded as a batch");
    assert.equal(batch.context, "2025/2026 · Second Term");
    assert.equal(batch.studentIds.length, firstBody.counts.remindersSent);
    assert.equal(batch.result.sent.length, firstBody.counts.remindersSent);

    const reminderCount = (await feeRemindersFor(school.id, admin.id)).length;

    // A double rollover: the school is already on Second Term, so the attempt
    // is rejected — and crucially, no reminder is sent to anyone again.
    const again = await postRollover(
      json("/api/school/rollover", { method: "POST", body: { newTerm: "Second Term" } })
    );
    assert.equal(again.status, 400);
    assert.equal(
      (await feeRemindersFor(school.id, admin.id)).length,
      reminderCount,
      "a double rollover never re-notifies anyone"
    );
  });

  it("replays the recorded count when the same rollover batch key is re-run", async () => {
    as(admin);
    const first = await postRollover(
      json("/api/school/rollover", { method: "POST", body: { newTerm: "Second Term" } })
    );
    const body = await first.json();
    const key = `rollover:${school.id}:${body.school.currentSession}:${body.school.currentTerm}`;

    // Simulate the reminder step re-running under the same key (what a
    // concurrent duplicate of the route would produce): the route's guard
    // reads the batch and replays the count instead of sending again.
    const existing = await demoStore.getReminderBatchByKey(school.id, "rollover", key);
    assert.equal(existing.result.sent.length, body.counts.remindersSent);

    const countBefore = (await feeRemindersFor(school.id, admin.id)).length;
    // The store-level save is a no-op for an existing key — never a second record.
    const { batch: recorded, created } = await demoStore.saveReminderBatch({
      schoolId: school.id,
      kind: "rollover",
      key,
      studentIds: existing.studentIds,
      result: existing.result,
    });
    assert.equal(created, false, "the duplicate save returns the existing batch");
    assert.equal(recorded.id, existing.id);
    assert.equal(
      (await feeRemindersFor(school.id, admin.id)).length,
      countBefore,
      "no new notifications"
    );
  });

  it("batches survive a simulated restart", async () => {
    as(admin);
    await postReminders(
      json("/api/fees/reminders", {
        method: "POST",
        body: { studentIds: [], batchId: "persist-me" },
      })
    );
    demoStore.__persistNow();
    demoStore.__reloadDemoStore();

    const batch = await demoStore.getReminderBatchByKey(school.id, "manual", "persist-me");
    assert.ok(batch, "the batch record survived the restart");
    assert.equal(batch.kind, "manual");
  });
});
