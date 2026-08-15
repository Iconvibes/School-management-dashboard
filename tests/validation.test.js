/**
 * Zod validation on the public credential surface (login + register).
 *
 * Unit level: the schemas reject on the first invalid field with the exact
 * historical messages. Route level: the REAL routes return 400 with that
 * message — no store writes, no sessions, for any invalid input.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";
import * as rateLimit from "../src/lib/rate-limit.js";
import { loginSchema, registerSchema, firstValidationMessage } from "../src/lib/validation.js";

// Force demo mode BEFORE importing the routes (they bind the store at import).
const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { POST: loginPOST } = await import("../src/app/api/auth/login/route.js");
const { POST: registerPOST } = await import("../src/app/api/auth/register/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-validation-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

const post = (route, body) =>
  route(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

describe("loginSchema — rejects on first invalid field", () => {
  it("requires a schoolId", () => {
    assert.equal(
      firstValidationMessage(loginSchema, { email: "a@b.c", password: "x" }),
      "Please select your school first"
    );
  });

  it("leaves the email/name compound rule to the route (schema accepts either)", () => {
    // The schema can't express "either email OR name"; the route checks it
    // first so the message beats the password one (see login route).
    assert.equal(firstValidationMessage(loginSchema, { schoolId: "s1", password: "x" }), null);
  });

  it("requires a password", () => {
    assert.equal(
      firstValidationMessage(loginSchema, { schoolId: "s1", email: "a@b.c" }),
      "Password is required"
    );
  });

  it("accepts a valid login body (email or name)", () => {
    assert.equal(
      firstValidationMessage(loginSchema, { schoolId: "s1", email: "a@b.c", password: "x" }),
      null
    );
    assert.equal(
      firstValidationMessage(loginSchema, { schoolId: "s1", name: "Ada Obi", password: "x", role: "TEACHER" }),
      null
    );
  });
});

describe("registerSchema — rejects on first invalid field", () => {
  it("single combined message for any missing required field", () => {
    const msg = "School name, admin name, email and password are required";
    assert.equal(firstValidationMessage(registerSchema, {}), msg);
    assert.equal(firstValidationMessage(registerSchema, { schoolName: "S", adminName: "A", email: "a@b.c" }), msg);
  });

  it("password length beats a bad email (historical priority)", () => {
    const out = firstValidationMessage(registerSchema, {
      schoolName: "S",
      adminName: "A",
      email: "not-an-email",
      password: "abc", // short AND email bad → password message first
    });
    assert.equal(out, "Password must be at least 6 characters");
  });

  it("bad email alone gets the format message", () => {
    assert.equal(
      firstValidationMessage(registerSchema, {
        schoolName: "S",
        adminName: "A",
        email: "not-an-email",
        password: "longenough",
      }),
      "Please provide a valid email address"
    );
  });

  it("accepts a valid registration", () => {
    assert.equal(
      firstValidationMessage(registerSchema, {
        schoolName: "S",
        adminName: "A",
        email: "a@b.co",
        password: "secret123",
      }),
      null
    );
  });
});

describe("login route — invalid input is rejected with 400 before any work", () => {
  it("missing fields never reach the store (no user lookup side effects)", async () => {
    const res = await post(loginPOST, { email: "admin@edutrack.app", schoolId: "sch_101" });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "Password is required");
  });

  it("no email AND no name → the compound message (route-level rule)", async () => {
    const res = await post(loginPOST, { schoolId: "sch_101", password: "x" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "Email or name is required");
  });

  it("no schoolId → the school-first message", async () => {
    const res = await post(loginPOST, { email: "admin@edutrack.app", password: "x" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "Please select your school first");
  });

  it("rejects non-string payload shapes via zod", async () => {
    const res = await post(loginPOST, { schoolId: "sch_101", email: "admin@edutrack.app", password: 12345 });
    assert.equal(res.status, 400);
  });
});

describe("register route — invalid input is rejected with 400", () => {
  it("short password", async () => {
    const res = await post(registerPOST, {
      schoolName: "S",
      adminName: "A",
      email: "a@b.co",
      password: "abc",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "Password must be at least 6 characters");
  });

  it("bad email", async () => {
    const res = await post(registerPOST, {
      schoolName: "S",
      adminName: "A",
      email: "nope",
      password: "longenough",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "Please provide a valid email address");
  });

  it("valid registration still works end-to-end (201 + session)", async () => {
    const res = await post(registerPOST, {
      schoolName: "Zod Test School",
      adminName: "Zod Admin",
      email: "zod@test.co",
      password: "secret123",
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.user.schoolId, body.school.id);
    // Password hash must never leak.
    assert.equal(body.user.password, undefined);
  });
});
