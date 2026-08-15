/**
 * Response sanitization sweep — no API response may leak internal fields.
 *
 * Drives the REAL routes (login, register, me, users list, notifications)
 * and asserts every returned object is free of:
 *   - any key starting with `_`  (_id, __v, _pw…)
 *   - `password` (and `passwordSet`)
 *   - `tokenVersion`            (session-revocation counter)
 *   - the blind indexes         (emailIdx / phoneIdx — offline-dictionary bait)
 *
 * The internal shapes that MUST carry those fields (userToLoginShape for
 * login/change-password, findAuthSnapshot for requireAuth) are deliberately
 * NOT exercised here — they never cross the HTTP boundary.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import * as demoStore from "../src/lib/demo-store.js";
import * as rateLimit from "../src/lib/rate-limit.js";
import { signToken } from "../src/lib/token.js";
import { __setSessionToken } from "./helpers/headers-mock.js";

// Intercept next/headers BEFORE any app module that imports it is evaluated.
const MOCK_URL = pathToFileURL(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "helpers",
    "headers-mock.js"
  )
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers" || specifier === "next/headers.js") {
      return { url: MOCK_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

// Force demo mode BEFORE importing the routes.
const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { POST: loginPOST } = await import("../src/app/api/auth/login/route.js");
const { POST: registerPOST } = await import("../src/app/api/auth/register/route.js");
const { GET: meGET } = await import("../src/app/api/auth/me/route.js");
const { GET: usersGET } = await import("../src/app/api/users/route.js");
const { GET: notificationsGET } = await import("../src/app/api/notifications/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const FORBIDDEN = (key) =>
  key.startsWith("_") ||
  key === "password" ||
  key === "passwordSet" ||
  key === "tokenVersion" ||
  key === "emailIdx" ||
  key === "phoneIdx";

/** Deep-scan an object tree for any forbidden key. Returns the first hit. */
function firstForbidden(node, where = "root") {
  if (node === null || typeof node !== "object") return null;
  for (const [k, v] of Object.entries(node)) {
    if (FORBIDDEN(k)) return `${where}.${k}`;
    const hit = firstForbidden(v, `${where}.${k}`);
    if (hit) return hit;
  }
  return null;
}

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-sanitize-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  rateLimit.__resetRateLimits();
  __setSessionToken("");
});

afterEach(() => {
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

const post = (route, body) =>
  route(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

async function loginAsAdmin() {
  const [match] = await demoStore.searchSchools("Greenfield");
  const res = await post(loginPOST, {
    email: "admin@edutrack.app",
    password: "admin123",
    role: "SUPER_ADMIN",
    schoolId: match.id,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  return body;
}

describe("API responses never leak internal fields", () => {
  it("login response: user + school are clean", async () => {
    const body = await loginAsAdmin();
    assert.equal(firstForbidden(body.user), null, "login user leaked");
    assert.equal(firstForbidden(body.school), null, "login school leaked");
  });

  it("register response: user + school are clean", async () => {
    const res = await post(registerPOST, {
      schoolName: "Sanitize School",
      adminName: "Sanitize Admin",
      email: "sanitize@test.co",
      password: "secret123",
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(firstForbidden(body.user), null, "register user leaked");
    assert.equal(firstForbidden(body.school), null, "register school leaked");
  });

  it("/api/auth/me response is clean", async () => {
    const { user } = await loginAsAdmin();
    __setSessionToken(signToken({ userId: user.id, role: user.role, schoolId: user.schoolId }));
    const res = await meGET();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(firstForbidden(body), null, "me response leaked");
  });

  it("the roster list (GET /api/users) has zero leaks across every user", async () => {
    const { user } = await loginAsAdmin();
    __setSessionToken(signToken({ userId: user.id, role: user.role, schoolId: user.schoolId }));
    const res = await usersGET(new Request("http://localhost/api/users?limit=100", { method: "GET" }));
    assert.equal(res.status, 200);
    const body = await res.json();
    const users = body.users || body;
    assert.equal(firstForbidden(users), null, "users list leaked");
  });

  it("the notifications inbox (GET /api/notifications) has zero leaks", async () => {
    const { user } = await loginAsAdmin();
    __setSessionToken(signToken({ userId: user.id, role: user.role, schoolId: user.schoolId }));
    const res = await notificationsGET(new Request("http://localhost/api/notifications", { method: "GET" }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(firstForbidden(body), null, "notifications leaked");
  });

  it("store parity: listUsers strips tokenVersion/passwordSet like the Mongo toJSON", async () => {
    const [match] = await demoStore.searchSchools("Greenfield");
    const roster = await demoStore.listUsers({ schoolId: match.id });
    assert.ok(roster.length > 0);
    for (const u of roster) {
      assert.equal(firstForbidden(u), null, `roster user leaked: ${JSON.stringify(u).slice(0, 120)}`);
      assert.equal(u.password, undefined);
      assert.equal(u.tokenVersion, undefined);
    }
  });
});
