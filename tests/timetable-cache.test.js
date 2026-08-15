/**
 * Timetable 5-minute cache (traffic audit §6.3) — behavior through the REAL
 * GET /api/timetable route with the memory driver on.
 *
 *  1. a cached response is served WITHOUT a store read — proven by mutating
 *     the store between calls and watching the second call return the stale
 *     (cached) entries;
 *  2. the cache key is per-USER: a different caller (new token, same query)
 *     gets a FRESH read, never another user's cached copy;
 *  3. clearing the cache (or a TTL expiry) makes the mutation visible.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Enable the memory cache BEFORE anything imports the route/cache stack.
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
const { GET } = await import("../src/app/api/timetable/route.js");
const { __resetCache } = await import("../src/lib/cache.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-timetable-cache-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;
let schoolId;
let adminToken;
let teacher;

beforeEach(async () => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  __resetCache();
  __setSessionToken("");

  const [match] = await demoStore.searchSchools("Greenfield");
  schoolId = match.id;
  const admin = await demoStore.findUserByEmailInSchool(schoolId, "admin@edutrack.app");
  adminToken = signToken({ userId: admin.id, role: admin.role, schoolId });
  [teacher] = await demoStore.listUsers({ schoolId, role: "TEACHER" });
});

afterEach(() => {
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

const getTimetable = (query = "") =>
  GET(new Request(`http://localhost/api/timetable${query}`, { method: "GET" }));

async function entries() {
  const res = await getTimetable();
  assert.equal(res.status, 200);
  return (await res.json()).entries;
}

/** A free (day, period) slot in the seeded timetable. */
async function freeSlot() {
  const existing = await demoStore.getTimetable({ schoolId });
  const used = new Set(existing.map((e) => `${e.day}|${e.period}`));
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
    for (let p = 1; p <= 12; p++) {
      if (!used.has(`${day}|${p}`)) return { day, period: p };
    }
  }
  throw new Error("no free slot in seeded timetable");
}

describe("timetable 5-minute cache (CACHE_MODE=memory)", () => {
  it("serves the cached copy after a store mutation (TTL window)", async () => {
    __setSessionToken(adminToken);
    const before = await entries();
    const beforeCount = before.length;

    // Mutate the store underneath the cache.
    const slot = await freeSlot();
    await demoStore.saveTimetableEntry({
      schoolId,
      classArm: "JSS1",
      day: slot.day,
      period: slot.period,
      subject: "Mathematics",
      teacherId: teacher.id,
    });

    // Cache hit: same entries, mutation NOT visible.
    const cached = await entries();
    assert.equal(cached.length, beforeCount, "cache should serve the pre-mutation copy");

    // Clear the cache -> fresh read sees the mutation.
    __resetCache();
    const fresh = await entries();
    assert.equal(fresh.length, beforeCount + 1, "fresh read sees the new slot");
  });

  it("a different user never receives another user's cached copy", async () => {
    __setSessionToken(adminToken);
    const baseline = (await entries()).length; // cold read; warms the admin's key

    // Mutate the store underneath the admin's warm key.
    const slot = await freeSlot();
    await demoStore.saveTimetableEntry({
      schoolId,
      classArm: "JSS1",
      day: slot.day,
      period: slot.period,
      subject: "Mathematics",
      teacherId: teacher.id,
    });

    // Same user: warm key serves the pre-mutation copy.
    assert.equal((await entries()).length, baseline, "admin's warm key stays stale");

    // A genuinely different user (fresh userId in the key) must NOT get the
    // admin's cached copy — their first read is cold and sees the mutation.
    const second = await demoStore.createUser({
      schoolId,
      name: "Second Admin",
      email: "second.admin@edutrack.app",
      password: "admin123",
      role: "SUPER_ADMIN",
    });
    __setSessionToken(signToken({ userId: second.id, role: "SUPER_ADMIN", schoolId }));
    const newUserView = await entries();
    assert.equal(newUserView.length, baseline + 1, "different user's key is cold -> fresh read");
  });
});
