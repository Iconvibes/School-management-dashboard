/**
 * Dashboard-stats cache (traffic audit §6.3) — through the REAL route.
 *
 * The overview is the heaviest page in the app (10+ countDocuments per
 * load). With a cache driver active, GET /api/admin/stats must serve the
 * cached stats for up to 45s instead of recomputing — so a fee payment
 * recorded after the first load is NOT visible until the cache refreshes,
 * and clearing the cache (or one TTL later) shows it.
 *
 * CACHE_MODE=memory is set before import (own process per node --test file),
 * so this suite exercises the cache while every other suite keeps the
 * default "off" driver and their exact pre-cache behavior.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const { GET: getStats } = await import("../src/app/api/admin/stats/route.js");
const { __resetCache } = await import("../src/lib/cache.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-stats-cache-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;
let school;
let admin;

beforeEach(async () => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  __resetCache();
  __setSessionToken("");
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

describe("GET /api/admin/stats cache", () => {
  it("serves cached stats for the TTL instead of recomputing after a payment", async () => {
    as(admin);

    const first = await (await getStats()).json();
    assert.equal(first.stats.feeCollectedAmount > 0, true, "seed payments are collected");

    // A new CONFIRMED payment lands in the store AFTER the first load.
    const [student] = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    await demoStore.recordFeePayment({
      schoolId: school.id,
      studentId: student.id,
      amount: 5000,
      method: "cash",
      note: "cache test",
      status: "CONFIRMED",
    });

    // Second load: served from cache — the new payment is NOT visible yet.
    const second = await (await getStats()).json();
    assert.deepEqual(second.stats, first.stats, "cached stats ignore the new payment");

    // Fresh computation (cache cleared) reflects the payment.
    __resetCache();
    const fresh = await (await getStats()).json();
    assert.equal(
      fresh.stats.feeCollectedAmount,
      first.stats.feeCollectedAmount + 5000,
      "the payment shows once the cache refreshes"
    );
  });

  it("cache keys are per-school (a second tenant never shares stats)", async () => {
    as(admin);
    const first = await (await getStats()).json();
    assert.ok(first.stats.totalStudents > 0, "Greenfield is seeded");

    // A brand-new tenant signs in and loads ITS stats — a fresh computation
    // under a different key, never school A's cached entry.
    const { user: otherAdmin } = await demoStore.createSchoolAndAdmin({
      schoolName: "Bridge Academy",
      adminName: "Bridge Admin",
      email: "bridge@test.app",
      password: "bridge123",
    });
    as(otherAdmin);
    const otherStats = await (await getStats()).json();
    assert.equal(otherStats.stats.totalStudents, 0, "a brand-new tenant has zero students");
    assert.notDeepEqual(otherStats.stats, first.stats, "different tenant, different stats");

    // School A's cached entry is untouched by the other tenant's load.
    as(admin);
    const again = await (await getStats()).json();
    assert.deepEqual(again.stats, first.stats, "school A still gets its cached stats");
  });
});
