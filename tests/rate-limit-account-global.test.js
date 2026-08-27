/**
 * P1.4 — IP-independent account rate limit.
 *
 * Simulates a distributed brute-force attack where an attacker rotates
 * source IPs to bypass per-IP buckets. The new checkAccountRateLimit bucket
 * catches this by keying purely on the account identifier (email/name +
 * school), ignoring the IP.
 *
 * These tests exercise the REAL login route against the REAL demo store.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";
import * as rateLimit from "../src/lib/rate-limit.js";

// Force demo mode BEFORE importing the route
const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { POST } = await import("../src/app/api/auth/login/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-rate-limit-acct-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

function login(body, ip) {
  const headers = { "Content-Type": "application/json" };
  if (ip) headers["x-forwarded-for"] = ip;
  return POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  );
}

async function schoolId() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return match.id;
}

describe("P1.4 — IP-independent account rate limit", () => {
  it("catches a rotating-IP attack against one account after 30 failures", async () => {
    const sid = await schoolId();
    // 30 failures from 30 different IPs — per-IP buckets never trip (each
    // gets only 1 failure), but the global account bucket (max 30) does.
    for (let i = 0; i < 30; i++) {
      const res = await login(
        { email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid },
        `10.0.0.${i + 1}`
      );
      assert.equal(res.status, 401, `attempt ${i + 1} from IP 10.0.0.${i + 1}`);
    }
    // 31st attempt — the 31st failure trips the global account bucket
    const blocked = await login(
      { email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid },
      "10.0.0.100"
    );
    assert.equal(blocked.status, 429);
  });

  it("different accounts are not affected by one account's global lockout", async () => {
    const sid = await schoolId();
    // Exhaust the global bucket for admin@edutrack.app
    for (let i = 0; i < 30; i++) {
      await login(
        { email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid },
        `10.0.0.${i + 1}`
      );
    }
    await login(
      { email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid },
      "10.0.0.100"
    );
    // A different account still signs in fine
    const ok = await login(
      { email: "bursar@edutrack.app", password: "bursar123", role: "BURSAR", schoolId: sid },
      "10.0.0.100"
    );
    assert.equal(ok.status, 200);
  });

  it("the global bucket survives window rotation (escalating lockout)", async () => {
    const sid = await schoolId();
    // Exhaust the global bucket
    for (let i = 0; i < 30; i++) {
      await login(
        { email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid },
        `10.0.0.${i + 1}`
      );
    }
    const blocked = await login(
      { email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid },
      "10.0.0.100"
    );
    assert.equal(blocked.status, 429);

    // Even the CORRECT password is rejected while locked out
    const correctButLocked = await login(
      { email: "admin@edutrack.app", password: "admin123", role: "SUPER_ADMIN", schoolId: sid },
      "10.0.0.200"
    );
    assert.equal(correctButLocked.status, 429);
  });

  it("legitimate users on shared IPs are not affected (under threshold)", async () => {
    const sid = await schoolId();
    // 29 failures from 29 different IPs - each per-IP bucket gets only 1
    // failure (well under the 10/20 limits), and the global account bucket
    // (max 30) is also under its limit.
    for (let i = 0; i < 30; i++) {
      const res = await login(
        { email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid },
        "10.0.0." + (i + 1)
      );
      assert.equal(res.status, 401, "attempt " + (i + 1));
    }
    // 31st failure trips the global bucket
    const blocked = await login(
      { email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid },
      "10.0.0.100"
    );
    assert.equal(blocked.status, 429);
  });
});
