/**
 * Production-clean-slate gate tests.
 *
 * Production ships with NO demo data: the boot-time demo seed is gated by
 * SEED_DEMO_SCHOOL (off by default when NODE_ENV=production), so a fresh
 * start has zero schools and the first registered user becomes the first
 * school's admin. Dev/test keep the seeded demo school for exploration.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import * as demoStore from "../src/lib/demo-store.js";
import { demoSeedEnabled } from "../src/lib/demo-store.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-gate-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;
let hadSeed;
let hadNodeEnv;

beforeEach(() => {
  hadSeed = process.env.SEED_DEMO_SCHOOL;
  hadNodeEnv = process.env.NODE_ENV;
  delete process.env.SEED_DEMO_SCHOOL;
  delete process.env.NODE_ENV;
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore(); // seeded dev state
});

afterEach(() => {
  if (hadSeed === undefined) delete process.env.SEED_DEMO_SCHOOL;
  else process.env.SEED_DEMO_SCHOOL = hadSeed;
  if (hadNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = hadNodeEnv;
  try {
    rmSync(file, { force: true });
    rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

describe("demoSeedEnabled — the production gate", () => {
  it("defaults OFF outside production (dev/test)", () => {
    delete process.env.SEED_DEMO_SCHOOL;
    delete process.env.NODE_ENV;
    assert.equal(demoSeedEnabled(), false);
  });

  it("defaults OFF in production", () => {
    delete process.env.SEED_DEMO_SCHOOL;
    process.env.NODE_ENV = "production";
    assert.equal(demoSeedEnabled(), false);
  });

  it("SEED_DEMO_SCHOOL=0 forces it off, unset catches same path", () => {
    process.env.SEED_DEMO_SCHOOL = "0";
    delete process.env.NODE_ENV;
    assert.equal(demoSeedEnabled(), false);
  });

  it("SEED_DEMO_SCHOOL=1 forces it on even in production", () => {
    process.env.SEED_DEMO_SCHOOL = "1";
    process.env.NODE_ENV = "production";
    assert.equal(demoSeedEnabled(), true);
  });

  it("false/true spellings are honoured", () => {
    process.env.SEED_DEMO_SCHOOL = "false";
    assert.equal(demoSeedEnabled(), false);
    process.env.SEED_DEMO_SCHOOL = "true";
    assert.equal(demoSeedEnabled(), true);
  });

  it("SEED_DEMO_SCHOOL=yes/no are honoured", () => {
    process.env.SEED_DEMO_SCHOOL = "no";
    assert.equal(demoSeedEnabled(), false);
    process.env.SEED_DEMO_SCHOOL = "yes";
    assert.equal(demoSeedEnabled(), true);
  });
});

describe("production boot — clean slate", () => {
  it("a fresh boot with the seed disabled has NO schools", async () => {
    process.env.SEED_DEMO_SCHOOL = "0";
    process.env.NODE_ENV = "production";
    demoStore.__reloadDemoStore(); // wipe + reload from a fresh snapshot
    const schools = await demoStore.searchSchools("");
    assert.equal(schools.length, 0, "no pre-existing schools on a fresh start");
  });

  it("the first registered user becomes the first school's admin", async () => {
    process.env.SEED_DEMO_SCHOOL = "0";
    demoStore.__reloadDemoStore();
    const { school, user } = await demoStore.createSchoolAndAdmin({
      schoolName: "First Academy",
      adminName: "First Admin",
      email: "first@academy.edu.ng",
      password: "first123",
    });
    assert.equal(user.role, "SUPER_ADMIN");
    assert.equal(user.schoolId, school.id);
    assert.equal(school.onboardingComplete, false, "first-run wizard still pending");
    const schools = await demoStore.searchSchools("First");
    assert.equal(schools.length, 1, "exactly one school exists after the first registration");
  });

  it("re-enabling the seed repopulates the demo school (dev convenience)", async () => {
    process.env.SEED_DEMO_SCHOOL = "0";
    demoStore.__reloadDemoStore();
    assert.equal((await demoStore.searchSchools("")).length, 0);
    process.env.SEED_DEMO_SCHOOL = "1";
    demoStore.__reloadDemoStore();
    const schools = await demoStore.searchSchools("Greenfield");
    assert.equal(schools.length, 1, "demo school comes back when seeding is on");
  });
});

describe("no demo accounts exist when seeding is off", () => {
  it("the demo admin is absent — the /api/auth/demo sign-in has nothing to find", async () => {
    process.env.SEED_DEMO_SCHOOL = "0";
    demoStore.__reloadDemoStore();
    assert.equal(
      await demoStore.findUserByEmail("admin@edutrack.app"),
      undefined,
      "demo admin does not exist on a clean boot"
    );
    // With the seed on (dev/test), the demo admin exists again.
    process.env.SEED_DEMO_SCHOOL = "1";
    demoStore.__reloadDemoStore();
    assert.ok(await demoStore.findUserByEmail("admin@edutrack.app"));
  });
});
