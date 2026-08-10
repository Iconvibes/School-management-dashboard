/**
 * Account-status alert tests.
 *
 * Freezing, reactivating or restoring a school sends a safety-confirmation
 * email to its SUPER_ADMIN(s) and drops an in-app notification, so the action
 * is never silent. The mailer (src/lib/mailer.js) is a graceful no-op without
 * SMTP config, and the route treats the alert as best-effort.
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
import { sendMail, __setMailerTransport } from "../src/lib/mailer.js";

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
const { POST } = await import("../src/app/api/school/status/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-status-alert-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  __setSessionToken("");
  __setMailerTransport(null);
});

afterEach(() => {
  __setSessionToken("");
  __setMailerTransport(null);
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

async function seededSchool() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return demoStore.getSchoolById(match.id);
}

/** Create the school's SUPER_ADMIN (the seed school has none) and log in. */
async function seedSuperAdmin() {
  const school = await seededSchool();
  const admin = await demoStore.createUser({
    schoolId: school.id,
    name: "Founder Admin",
    email: "founder@greenfield.test",
    password: "adminpass",
    role: "SUPER_ADMIN",
  });
  __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));
  return { school, admin };
}

async function postStatus(action) {
  return POST(
    new Request("http://localhost/api/school/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
  );
}

async function schoolNotifications(schoolId) {
  const admin = await demoStore.findUserByEmailInSchool(schoolId, "founder@greenfield.test");
  return demoStore.listNotifications(schoolId, admin.id);
}

describe("mailer", () => {
  it("is a graceful no-op without SMTP config", async () => {
    const res = await sendMail({ to: "a@b.test", subject: "Test", text: "Hi" });
    assert.deepEqual(res, { sent: false, transport: "disabled" });
  });

  it("sends through an injected transport without throwing", async () => {
    const sent = [];
    __setMailerTransport({ sendMail: async (m) => sent.push(m) });
    const res = await sendMail({ to: "a@b.test", subject: "Frozen", text: "Body" });
    assert.deepEqual(res, { sent: true, transport: "smtp" });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "a@b.test");
    assert.equal(sent[0].subject, "Frozen");
    assert.match(sent[0].text, /Body/);
  });
});

describe("status-change alerts", () => {
  it("freezing sends an email + in-app notification to the SUPER_ADMIN", async () => {
    const { school, admin } = await seedSuperAdmin();
    const sent = [];
    __setMailerTransport({ sendMail: async (m) => sent.push(m) });

    const res = await postStatus("deactivate");
    assert.equal(res.status, 200);

    // The email went to every super admin (the seed admin + our founder).
    assert.ok(sent.length >= 1);
    const mine = sent.find((m) => m.to === admin.email);
    assert.ok(mine, "founder received the freeze email");
    assert.equal(mine.subject, `${school.name} has been frozen`);
    assert.match(mine.text, /logins are blocked/);

    // And an in-app notification lands in the bell.
    const notes = await schoolNotifications(school.id);
    const alert = notes.find((n) => n.subject === `${school.name} has been frozen`);
    assert.ok(alert, "freeze notification exists");
    assert.equal(alert.kind, "alert");
    assert.ok(alert.to.includes(admin.id));
    assert.equal((await demoStore.getSchoolById(school.id)).status, "frozen");
  });

  it("reactivating sends the reactivated confirmation", async () => {
    const { school } = await seedSuperAdmin();
    const sent = [];
    __setMailerTransport({ sendMail: async (m) => sent.push(m) });

    await postStatus("deactivate");
    sent.length = 0;
    const res = await postStatus("reactivate");
    assert.equal(res.status, 200);

    assert.equal(sent[0].subject, `${school.name} has been reactivated`);
    const notes = await schoolNotifications(school.id);
    assert.ok(notes.some((n) => n.subject === `${school.name} has been reactivated`));
    assert.equal((await demoStore.getSchoolById(school.id)).status, "active");
  });

  it("restoring a deleted school sends the restored confirmation", async () => {
    const { school } = await seedSuperAdmin();
    await demoStore.deleteSchool(school.id);
    const sent = [];
    __setMailerTransport({ sendMail: async (m) => sent.push(m) });

    const res = await postStatus("restore");
    assert.equal(res.status, 200);

    assert.equal(sent[0].subject, `${school.name} has been restored`);
    const notes = await schoolNotifications(school.id);
    assert.ok(notes.some((n) => n.subject === `${school.name} has been restored`));
    assert.equal((await demoStore.getSchoolById(school.id)).status, "active");
  });

  it("never fails the action when the mailer throws", async () => {
    const { school } = await seedSuperAdmin();
    __setMailerTransport({
      sendMail: async () => {
        throw new Error("SMTP down");
      },
    });

    const res = await postStatus("deactivate");
    assert.equal(res.status, 200);
    assert.equal((await demoStore.getSchoolById(school.id)).status, "frozen");
    // The in-app notification is still created (it does not depend on SMTP).
    const notes = await schoolNotifications(school.id);
    assert.ok(notes.some((n) => n.subject === `${school.name} has been frozen`));
  });
});
