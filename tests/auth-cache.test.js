/**
 * Auth-snapshot cache (traffic audit §6.2) — behavior through the REAL
 * requireAuth guard and the REAL mutation routes.
 *
 * The cache is enabled with CACHE_MODE=memory in this process (each node
 * --test file runs in its own process, so other suites keep the default "off"
 * driver and their exact pre-cache behavior).
 *
 * What is pinned here:
 *   1. a cached snapshot is served WITHOUT a store lookup (and expires the
 *      account's visibility for at most one TTL — the documented trade-off);
 *   2. the cache is tokenVersion-aware: a version bump forces a fresh fetch
 *      even if the matching cacheDel was missed;
 *   3. the change-password route invalidates the snapshot (instant revocation);
 *   4. the role re-roll route invalidates the snapshot (instant re-roll);
 *   5. the school-status route invalidates EVERY snapshot (instant freeze).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Enable the memory cache BEFORE anything imports the auth stack.
process.env.CACHE_MODE = "memory";

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
const { requireAuth, isDenied } = await import("../src/lib/policy.js");
const { __resetCache } = await import("../src/lib/cache.js");
const { POST: postChangePassword } = await import("../src/app/api/auth/change-password/route.js");
const { PATCH: patchRole } = await import("../src/app/api/users/[id]/role/route.js");
const { POST: postSchoolStatus } = await import("../src/app/api/school/status/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-auth-cache-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;
let school;
let admin;
let student;

beforeEach(async () => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  __resetCache();
  __setSessionToken("");
  const [match] = await demoStore.searchSchools("Greenfield");
  school = await demoStore.getSchoolById(match.id);
  admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
  student = await demoStore.findUserByEmailInSchool(school.id, "k.adebayo@edutrack.app");
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

const sessionOf = (user, tokenVersion = 0) => ({
  userId: user.id,
  role: user.role,
  schoolId: user.schoolId,
  tokenVersion,
});

describe("auth-snapshot cache", () => {
  it("serves a cached snapshot without a store lookup (≤1 TTL visibility for deleted accounts)", async () => {
    const session = sessionOf(student);
    assert.equal(isDenied(await requireAuth(undefined, session)), false, "fresh fetch caches the snapshot");

    // The account is deleted from the store — the cached snapshot still
    // authenticates (the documented ≤60s trade-off), proving no store call.
    await demoStore.deleteUser(student.id);
    assert.equal(
      isDenied(await requireAuth(undefined, session)),
      false,
      "cached snapshot serves without hitting the store"
    );

    // Clearing the cache (or one TTL later) the deletion becomes visible.
    __resetCache();
    const gone = await requireAuth(undefined, session);
    assert.equal(gone.status, 401, "deleted account is rejected once the cache is fresh");
  });

  it("is tokenVersion-aware: a version bump forces a fresh fetch even if the DEL was missed", async () => {
    const oldSession = sessionOf(student, 0);
    assert.equal(isDenied(await requireAuth(undefined, oldSession)), false, "v0 snapshot cached");

    // Simulate a password change whose cacheDel was MISSED — only the bump.
    await demoStore.updateUser(student.id, { tokenVersion: 1 });

    // A fresh v1 session refetches (cached v0 mismatches) and works.
    const newSession = sessionOf(student, 1);
    assert.equal(isDenied(await requireAuth(undefined, newSession)), false, "v1 token works after refetch");

    // The stale v0 token is now revoked — the refetched v1 snapshot fails the
    // version check, so the missed DEL cannot extend the session.
    assert.equal((await requireAuth(undefined, oldSession)).status, 401, "old token revoked");
  });

  it("change-password invalidates the cached snapshot (instant revocation)", async () => {
    const oldSession = sessionOf(student, 0);
    assert.equal(isDenied(await requireAuth(undefined, oldSession)), false, "v0 snapshot cached");

    as(student);
    const res = await postChangePassword(
      json("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: "student123", newPassword: "freshpass42" },
      })
    );
    assert.equal(res.status, 200, "password change succeeds");

    // Without the route's cacheDel, the cached v0 snapshot would match the
    // old token and still authenticate — the DEL is what makes this 401.
    assert.equal((await requireAuth(undefined, oldSession)).status, 401, "old token dies immediately");
  });

  it("role re-roll invalidates the cached snapshot (instant re-roll)", async () => {
    const teacher = await demoStore.findUserByEmailInSchool(school.id, "a.okafor@edutrack.app");
    const oldSession = sessionOf(teacher);
    assert.equal(isDenied(await requireAuth(undefined, oldSession)), false, "TEACHER snapshot cached");

    as(admin);
    const res = await patchRole(
      json(`/api/users/${teacher.id}/role`, { method: "PATCH", body: { role: "REGISTRAR" } }),
      { params: { id: teacher.id } }
    );
    assert.equal(res.status, 200, "re-roll succeeds");

    // The fresh snapshot has the new role; the token claims TEACHER — the
    // claim mismatch forces a re-login. Without the route's cacheDel, the
    // cached TEACHER snapshot would still match.
    assert.equal((await requireAuth(undefined, oldSession)).status, 401, "re-rolled account must sign in again");
  });

  it("school-status invalidates every cached snapshot (instant freeze)", async () => {
    const session = sessionOf(student);
    assert.equal(isDenied(await requireAuth(undefined, session)), false, "active snapshot cached");

    as(admin);
    const res = await postSchoolStatus(
      json("/api/school/status", { method: "POST", body: { action: "deactivate" } })
    );
    assert.equal(res.status, 200, "freeze succeeds");

    // Without the status-route invalidation the cached "active" snapshot
    // would let the student through — the DEL is what makes this 403.
    const blocked = await requireAuth(undefined, session);
    assert.equal(blocked.status, 403, "frozen school blocks a cached non-admin immediately");
  });
});
