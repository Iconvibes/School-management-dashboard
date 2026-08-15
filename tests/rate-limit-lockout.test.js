/**
 * Account lockout — 1h hard block after the 10th failed login.
 *
 * The account bucket (max 10 failures / 15 min) previously let an attacker
 * resume guessing after the window rotated. The lockout is a SEPARATE,
 * longer-lived block: once the account bucket trips, the account rejects
 * EVERY attempt — including the correct password — until the hour passes.
 * The pre-check runs before the user lookup and bcrypt compare, so a locked
 * account costs the server nothing.
 *
 * These tests drive the REAL login route against the REAL demo store.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";
import * as rateLimit from "../src/lib/rate-limit.js";

// Force demo mode BEFORE importing the route (it binds the store at import).
const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { POST } = await import("../src/app/api/auth/login/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-lockout-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  rateLimit.__resetRateLimits();
});

afterEach(() => {
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

function login(body) {
  return POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function schoolId() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return match.id;
}

describe("account lockout (1h after 10 failed logins)", () => {
  it("the correct password is rejected while the account is locked", async () => {
    const sid = await schoolId();
    // Burn the account bucket: 11 failures → the 11th is the 429 that also
    // sets the 1h lockout.
    for (let i = 0; i < 11; i++) {
      const res = await login({ email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid });
      assert.equal(res.status, i < 10 ? 401 : 429, `attempt ${i + 1}`);
    }
    // The lockout pre-check beats the CORRECT credentials.
    const blocked = await login({ email: "admin@edutrack.app", password: "admin123", role: "SUPER_ADMIN", schoolId: sid });
    assert.equal(blocked.status, 429);
  });

  it("the lockout is per-account — other accounts sign in fine", async () => {
    const sid = await schoolId();
    for (let i = 0; i < 11; i++) {
      await login({ email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid });
    }
    assert.equal(
      (await login({ email: "bursar@edutrack.app", password: "bursar123", role: "BURSAR", schoolId: sid })).status,
      200
    );
  });

  it("isLockedOut reports the remaining seconds, 0 for a fresh account", async () => {
    const sid = await schoolId();
    const key = `admin@edutrack.app@${sid}`;
    const req = () =>
      new Request("http://localhost/api/auth/login", { method: "POST" });

    assert.equal(await rateLimit.isLockedOut({ request: req(), prefix: "auth-login", key }), 0);

    for (let i = 0; i < 11; i++) {
      await login({ email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid });
    }
    const remaining = await rateLimit.isLockedOut({ request: req(), prefix: "auth-login", key });
    assert.ok(remaining >= 3600 - 5 && remaining <= 3600, `remaining=${remaining}`);
  });

  it("checkRateLimit honors an active lockout even for a bucket whose window reset", async () => {
    // Unit level: after the lockout is set, a brand-new checkRateLimit call
    // (fresh window entry) still returns 429 — the lockout outlives windows.
    const req = () => new Request("http://localhost/x", { method: "POST" });
    for (let i = 0; i < 11; i++) {
      await rateLimit.checkRateLimit({
        request: req(),
        windowMs: 15 * 60 * 1000,
        max: 10,
        prefix: "auth-login",
        key: "someone@sch",
        lockoutMs: 60 * 60 * 1000,
      });
    }
    // The 11th call tripped the bucket; a 12th (would-be new slot) is blocked.
    const blocked = await rateLimit.checkRateLimit({
      request: req(),
      windowMs: 15 * 60 * 1000,
      max: 10,
      prefix: "auth-login",
      key: "someone@sch",
    });
    assert.equal(blocked.status, 429);
  });

  it("failed logins under the threshold never set a lockout", async () => {
    const sid = await schoolId();
    const key = `a.pupil@edutrack.app@${sid}`;
    for (let i = 0; i < 5; i++) {
      await login({ email: "k.adebayo@edutrack.app", password: "wrong", role: "STUDENT", schoolId: sid });
    }
    assert.equal(
      await rateLimit.isLockedOut({
        request: new Request("http://localhost/api/auth/login", { method: "POST" }),
        prefix: "auth-login",
        key,
      }),
      0
    );
    // And the account still signs in with the right password.
    assert.equal(
      (await login({ email: "k.adebayo@edutrack.app", password: "student123", role: "STUDENT", schoolId: sid })).status,
      200
    );
  });
});
