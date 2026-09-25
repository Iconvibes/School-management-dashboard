/**
 * Pins the three fixes from the tenant-isolation audit (September 2026):
 *
 *   1. /api/billing/verify — was unauthenticated and activated ANY school's
 *      subscription from the `sid` query param. Now requires a SUPER_ADMIN
 *      session and derives the school from it (401 / 403 cases below).
 *   2. /api/auth/logout — an impersonation session was left "active" forever
 *      (endImpersonationSession was never called anywhere). Logout now closes
 *      the session record and writes an impersonation_end audit entry.
 *   3. /api/platform/schools/[id]/impersonate — JWTs carry userId only, so
 *      `session.user?.name` was always undefined and every audit entry read
 *      "Platform Admin". The actor's identity is now loaded from the store.
 *
 * Same harness as policy-integration.test.js (headers-mock + real JWT).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
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
const { GET: billingVerifyGET } = await import(
  "../src/app/api/billing/verify/route.js"
);
const { POST: logoutPOST } = await import("../src/app/api/auth/logout/route.js");
const { POST: impersonatePOST } = await import(
  "../src/app/api/platform/schools/[id]/impersonate/route.js"
);
const { createImpersonationSession } = await import(
  "../src/modules/platform/store.js"
);
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(
    os.tmpdir(),
    `edutrack-secfix-${process.pid}-${Math.random().toString(36).slice(2)}.json`
  );

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
});

afterEach(() => {
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
  __setSessionToken("");
});

async function greenfieldUser(role) {
  const [school] = await demoStore.searchSchools("Greenfield");
  const [user] = await demoStore.listUsers({ schoolId: school.id, role });
  return user;
}

function signInAs(user) {
  __setSessionToken(
    signToken({ userId: user.id, role: user.role, schoolId: user.schoolId })
  );
}

const jsonOf = (r) => r.json().catch(() => null);

describe("billing/verify — session-gated, session-derived schoolId", () => {
  it("a request with NO session is a 401 — the old endpoint was wide open", async () => {
    const res = await billingVerifyGET(
      new Request("http://localhost/api/billing/verify?ref=SUB-1&sid=sch_x")
    );
    assert.equal(res.status, 401);
  });

  it("an authenticated admin replaying ANOTHER school's sid is a 403", async () => {
    const admin = await greenfieldUser("SUPER_ADMIN");
    signInAs(admin);
    const res = await billingVerifyGET(
      new Request(
        "http://localhost/api/billing/verify?ref=SUB-1&sid=sch_other_school"
      )
    );
    assert.equal(res.status, 403);
  });

  it("the school's own sid passes the gate and (demo mode) bounces to the dashboard", async () => {
    const admin = await greenfieldUser("SUPER_ADMIN");
    signInAs(admin);
    const res = await billingVerifyGET(
      new Request(
        `http://localhost/api/billing/verify?ref=SUB-1&sid=${admin.schoolId}`
      )
    );
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /billing=success/);
  });
});

describe("logout — closes impersonation sessions", () => {
  it("logout during impersonation ends the session record and logs impersonation_end", async () => {
    // Start an impersonation session through the module the route uses.
    const sessionId = await createImpersonationSession({
      impersonatorId: "platform-admin-1",
      impersonatorName: "Platform Admin",
      schoolId: "sch_x",
      schoolName: "School X",
      targetUserId: "target-1",
      targetUserName: "Target Admin",
      targetUserRole: "SUPER_ADMIN",
    });

    // The impersonated session cookie: target user + impersonation metadata.
    __setSessionToken(
      signToken({
        userId: "target-1",
        role: "SUPER_ADMIN",
        schoolId: "sch_x",
        impersonatedAt: Date.now(),
        impersonatorId: "platform-admin-1",
        impersonationSessionId: sessionId,
      })
    );

    const res = await logoutPOST();
    assert.equal(res.status, 200);

    const { getImpersonationSessions } = await import(
      "../src/modules/platform/store.js"
    );
    const { sessions } = await getImpersonationSessions({});
    const record = sessions.find((s) => s.id === sessionId);
    assert.ok(record, "session record still exists");
    assert.equal(record.status, "ended", "logout must CLOSE the session");
    assert.equal(record.endedReason, "manual");

    const { listAuditLogs } = await import("../src/modules/platform/store.js");
    const { logs } = await listAuditLogs({ action: "impersonation_end" });
    const entry = logs.find((l) => l.meta?.sessionId === sessionId);
    assert.ok(entry, "an impersonation_end audit entry is written");
    assert.equal(entry.meta.targetUserId, "target-1");
  });

  it("logout without impersonation just clears the cookie (no audit noise)", async () => {
    const user = await greenfieldUser("SUPER_ADMIN");
    signInAs(user);
    const res = await logoutPOST();
    assert.equal(res.status, 200);
    const { listAuditLogs } = await import("../src/modules/platform/store.js");
    const { logs } = await listAuditLogs({ action: "impersonation_end" });
    assert.equal(logs.length, 0);
  });
});

describe("impersonate — audit records the REAL impersonator identity", () => {
  it("session record + audit entry carry the platform admin's actual name and id", async () => {
    // Build a dedicated platform admin so the name is unique and greppable.
    const platformAdmin = await demoStore.createUser({
      schoolId: "sch_platform",
      name: "Ada Platform",
      email: "ada.platform@edutrack.app",
      password: "platform123",
      role: "PLATFORM_ADMIN",
    });

    const [school] = await demoStore.searchSchools("Greenfield");
    const target = await greenfieldUser("SUPER_ADMIN");

    signInAs(platformAdmin); // JWT carries userId only — no user object.
    const res = await impersonatePOST(
      new Request("http://localhost/api/platform/schools/s/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: target.id }),
      }),
      { params: Promise.resolve({ id: school.id }) }
    );
    assert.equal(res.status, 200);

    const { getImpersonationSessions } = await import(
      "../src/modules/platform/store.js"
    );
    const { sessions } = await getImpersonationSessions({});
    const record = sessions.find(
      (s) => s.targetUserId === target.id && s.status === "active"
    );
    assert.ok(record, "an impersonation session record exists");
    assert.equal(record.impersonatorId, platformAdmin.id, "real impersonator id");
    assert.equal(record.impersonatorName, "Ada Platform", "real impersonator name");

    const { listAuditLogs } = await import("../src/modules/platform/store.js");
    const { logs } = await listAuditLogs({ action: "impersonation" });
    const entry = logs.find((l) => l.meta?.sessionId === record.id);
    assert.ok(entry, "audit entry exists");
    assert.equal(entry.actor, "Ada Platform", 'not the literal "Platform Admin"');
    assert.equal(entry.meta.impersonatorId, platformAdmin.id);

    // The impersonated cookie must carry the timeout metadata.
    const body = await jsonOf(res);
    assert.equal(body.success, true);
  });

  it("impersonating a user from a DIFFERENT school than the [id] param is 403", async () => {
    const platformAdmin = await demoStore.createUser({
      schoolId: "sch_platform",
      name: "Kofi Platform",
      email: "kofi.platform@edutrack.app",
      password: "platform123",
      role: "PLATFORM_ADMIN",
    });
    const [school] = await demoStore.searchSchools("Greenfield");
    const otherSchoolAdmin = await greenfieldUser("SUPER_ADMIN");

    signInAs(platformAdmin);
    const res = await impersonatePOST(
      new Request("http://localhost/api/platform/schools/wrong/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: otherSchoolAdmin.id }),
      }),
      { params: Promise.resolve({ id: "sch_not_the_users_school" }) }
    );
    assert.equal(res.status, 403);
    assert.equal((await jsonOf(res)).error, "User does not belong to this school");
  });
});
