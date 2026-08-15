/**
 * Cloudflare Turnstile on the login + register routes.
 *
 * When TURNSTILE_SECRET_KEY is unset (demo/dev/pre-launch) the check is
 * disabled and requests pass untouched — the existing suite covers that.
 * When it IS set, the token must verify through siteverify (stubbed here via
 * global fetch): missing token → 403, explicit failure → 403, success →
 * request proceeds. Also pins the fail-open-on-network-error rule.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";
import * as rateLimit from "../src/lib/rate-limit.js";

// Force demo mode BEFORE importing the routes.
const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { POST: loginPOST } = await import("../src/app/api/auth/login/route.js");
const { POST: registerPOST } = await import("../src/app/api/auth/register/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const realFetch = globalThis.fetch;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-turnstile-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  rateLimit.__resetRateLimits();
  process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
  globalThis.fetch = realFetch;
});

afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  globalThis.fetch = realFetch;
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

async function schoolId() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return match.id;
}

/** Stub siteverify to answer { success }. */
function stubSiteverify(success) {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
}

describe("Turnstile — login", () => {
  it("missing token is rejected (403) when Turnstile is configured", async () => {
    stubSiteverify(true);
    const res = await post(loginPOST, {
      email: "admin@edutrack.app",
      password: "admin123",
      role: "SUPER_ADMIN",
      schoolId: await schoolId(),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "Bot check failed. Please try again.");
  });

  it("explicit siteverify failure is rejected (403)", async () => {
    stubSiteverify(false);
    const res = await post(loginPOST, {
      email: "admin@edutrack.app",
      password: "admin123",
      role: "SUPER_ADMIN",
      schoolId: await schoolId(),
      cfTurnstileResponse: "some-token",
    });
    assert.equal(res.status, 403);
  });

  it("verified token proceeds to a normal login", async () => {
    stubSiteverify(true);
    const res = await post(loginPOST, {
      email: "admin@edutrack.app",
      password: "admin123",
      role: "SUPER_ADMIN",
      schoolId: await schoolId(),
      cfTurnstileResponse: "valid-token",
    });
    assert.equal(res.status, 200);
  });

  it("a siteverify network error fails OPEN (login availability at 08:00)", async () => {
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    const res = await post(loginPOST, {
      email: "admin@edutrack.app",
      password: "admin123",
      role: "SUPER_ADMIN",
      schoolId: await schoolId(),
      cfTurnstileResponse: "token-while-cf-down",
    });
    assert.equal(res.status, 200);
  });
});

describe("Turnstile — register", () => {
  it("missing token is rejected (403) when Turnstile is configured", async () => {
    stubSiteverify(true);
    const res = await post(registerPOST, {
      schoolName: "TS School",
      adminName: "TS Admin",
      email: "ts@test.co",
      password: "secret123",
    });
    assert.equal(res.status, 403);
  });

  it("verified token proceeds to tenant creation (201)", async () => {
    stubSiteverify(true);
    const res = await post(registerPOST, {
      schoolName: "TS School",
      adminName: "TS Admin",
      email: "ts@test.co",
      password: "secret123",
      cfTurnstileResponse: "valid-token",
    });
    assert.equal(res.status, 201);
  });
});

describe("Turnstile — disabled when not configured", () => {
  it("login passes without any token when TURNSTILE_SECRET_KEY is unset", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const res = await post(loginPOST, {
      email: "admin@edutrack.app",
      password: "admin123",
      role: "SUPER_ADMIN",
      schoolId: await schoolId(),
    });
    assert.equal(res.status, 200);
  });
});
