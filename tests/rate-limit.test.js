/**
 * Login rate limiting — failures only, account-scoped.
 *
 * The old limiter counted EVERY login attempt per IP, so legitimate testing
 * (log in, log out, switch roles — all SUCCESSFUL) burned the budget and
 * locked the tester out. The fix: successful logins never count, an IP
 * bucket still catches scripted distributed attempts, and a per-account
 * bucket (email-or-name + school, whether or not the account exists) catches
 * targeted guessing on one account without locking out the others.
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
  path.join(os.tmpdir(), `edutrack-rate-limit-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

describe("checkRateLimit — per-account keys", () => {
  it("gives each key its own independent bucket", async () => {
    const req = () => new Request("http://localhost/x", { method: "POST" });
    for (let i = 0; i < 5; i++) {
      assert.equal(await rateLimit.checkRateLimit({ request: req(), windowMs: 60000, max: 5, prefix: "t", key: "a" }), null);
    }
    // Key "a" is now exhausted -> 429.
    assert.ok(await rateLimit.checkRateLimit({ request: req(), windowMs: 60000, max: 5, prefix: "t", key: "a" }));
    // Key "b" shares the IP but has its own bucket -> still allowed.
    assert.equal(await rateLimit.checkRateLimit({ request: req(), windowMs: 60000, max: 5, prefix: "t", key: "b" }), null);
  });

  it("per-school buckets are independent of per-account buckets", async () => {
    const req = () => new Request("http://localhost/x", { method: "POST" });
    const school = (id) => rateLimit.checkRateLimit({
      request: req(),
      windowMs: 60000,
      max: 3,
      prefix: "auth-login-school",
      key: `school:${id}`,
    });
    for (let i = 0; i < 3; i++) {
      assert.equal(await school("s1"), null);
    }
    // School s1's bucket is exhausted -> 429; school s2 is untouched.
    assert.ok(await school("s1"));
    assert.equal(await school("s2"), null);
  });
});

describe("login rate limiting — failures only, account-scoped", () => {
  it("successful logins across roles never trip the limiter", async () => {
    const sid = await schoolId();
    const accounts = [
      { email: "admin@edutrack.app", password: "admin123", role: "SUPER_ADMIN" },
      { email: "a.okafor@edutrack.app", password: "teacher123", role: "TEACHER" },
      { email: "k.adebayo@edutrack.app", password: "student123", role: "STUDENT" },
      { name: "Mrs. Folake Adebayo", password: "Kunle Adebayo", role: "PARENT" },
    ];
    // 3 full cycles of role-switching = 12 successful logins. The old
    // all-attempts limiter 429'd at #11.
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const c of accounts) {
        const res = await login({ ...c, schoolId: sid });
        assert.equal(res.status, 200, `cycle ${cycle} ${c.role}`);
      }
    }
  });

  it("locks a targeted account after repeated failures, others unaffected", async () => {
    const sid = await schoolId();
    // 11 wrong-password attempts on ONE account: the account bucket (max 10
    // failures) trips, not the IP bucket.
    for (let i = 0; i < 10; i++) {
      const res = await login({ email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid });
      assert.equal(res.status, 401, `attempt ${i + 1}`);
    }
    const blocked = await login({ email: "admin@edutrack.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid });
    assert.equal(blocked.status, 429);
    // A DIFFERENT account still signs in fine — its bucket is untouched.
    const ok = await login({ email: "bursar@edutrack.app", password: "bursar123", role: "BURSAR", schoolId: sid });
    assert.equal(ok.status, 200);
  });

  it("unknown accounts consume the account bucket too (no account oracle)", async () => {
    const sid = await schoolId();
    for (let i = 0; i < 10; i++) {
      const res = await login({ email: "ghost@test.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid });
      assert.equal(res.status, 401, `attempt ${i + 1}`);
    }
    const blocked = await login({ email: "ghost@test.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid });
    assert.equal(blocked.status, 429);
  });

  it("the IP bucket still stops distributed attempts across many accounts", async () => {
    const sid = await schoolId();
    // One failure per DIFFERENT account: per-account buckets never trip, but
    // the shared IP bucket (max 20 failures) does.
    for (let i = 0; i < 20; i++) {
      const res = await login({ email: `spray${i}@test.app`, password: "wrong", role: "SUPER_ADMIN", schoolId: sid });
      assert.equal(res.status, 401, `attempt ${i + 1}`);
    }
    const blocked = await login({ email: "spray20@test.app", password: "wrong", role: "SUPER_ADMIN", schoolId: sid });
    assert.equal(blocked.status, 429);
  });
});

describe("login rate limiting — per-teacher-name bucket", () => {
  // The school name is PUBLIC (it's in the school picker) and it IS the
  // password for every teacher — so an attacker who knows the scheme can
  // probe teacher names against it. Each teacher name gets its own tight
  // 5-failure bucket (tighter than the 10-failure account bucket) so a
  // single name can't be hammered, while the IP bucket still caps how many
  // DIFFERENT names one source can try per window.
  const TEACHER = { role: "TEACHER" };

  it("blocks a teacher name after 5 failures (before the 10-failure account bucket)", async () => {
    const sid = await schoolId();
    for (let i = 0; i < 5; i++) {
      const res = await login({ name: "Mrs. Adaeze Okafor", password: "wrong", ...TEACHER, schoolId: sid });
      assert.equal(res.status, 401, `attempt ${i + 1}`);
    }
    const blocked = await login({ name: "Mrs. Adaeze Okafor", password: "wrong", ...TEACHER, schoolId: sid });
    assert.equal(blocked.status, 429);
  });

  it("each teacher name gets its own independent bucket", async () => {
    const sid = await schoolId();
    // Exhaust one name's bucket.
    for (let i = 0; i < 5; i++) {
      await login({ name: "Mrs. Adaeze Okafor", password: "wrong", ...TEACHER, schoolId: sid });
    }
    assert.equal((await login({ name: "Mrs. Adaeze Okafor", password: "wrong", ...TEACHER, schoolId: sid })).status, 429);
    // A DIFFERENT teacher's name is untouched — still a plain 401.
    const other = await login({ name: "Mr. Tunde Bakare", password: "wrong", ...TEACHER, schoolId: sid });
    assert.equal(other.status, 401);
  });

  it("successful teacher logins never consume the name bucket", async () => {
    const sid = await schoolId();
    for (let i = 0; i < 6; i++) {
      const res = await login({
        name: "Mrs. Adaeze Okafor",
        password: "Greenfield International School",
        ...TEACHER,
        schoolId: sid,
      });
      assert.equal(res.status, 200, `successful login ${i + 1}`);
    }
  });

  it("parent name logins are NOT subject to the teacher-name bucket", async () => {
    const sid = await schoolId();
    // 8 wrong-password attempts on a parent's name: the teacher-name bucket
    // (max 5) must not apply — only the account bucket (max 10) does.
    for (let i = 0; i < 8; i++) {
      const res = await login({ name: "Mrs. Folake Adebayo", password: "wrong", role: "PARENT", schoolId: sid });
      assert.equal(res.status, 401, `attempt ${i + 1}`);
    }
  });

  it("unknown teacher names consume the name bucket too (no account oracle)", async () => {
    const sid = await schoolId();
    for (let i = 0; i < 5; i++) {
      const res = await login({ name: "Ghost Teacher Xyz", password: "wrong", ...TEACHER, schoolId: sid });
      assert.equal(res.status, 401, `attempt ${i + 1}`);
    }
    const blocked = await login({ name: "Ghost Teacher Xyz", password: "wrong", ...TEACHER, schoolId: sid });
    assert.equal(blocked.status, 429);
  });

  it("a tripped name bucket never locks the rest of the school", async () => {
    const sid = await schoolId();
    for (let i = 0; i < 5; i++) {
      await login({ name: "Mrs. Adaeze Okafor", password: "wrong", ...TEACHER, schoolId: sid });
    }
    assert.equal((await login({ name: "Mrs. Adaeze Okafor", password: "wrong", ...TEACHER, schoolId: sid })).status, 429);
    // The student portal still works — its bucket is untouched.
    const student = await login({ email: "k.adebayo@edutrack.app", password: "student123", role: "STUDENT", schoolId: sid });
    assert.equal(student.status, 200);
  });
});
