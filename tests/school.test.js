/**
 * School onboarding-flag tests — the state that drives the /onboarding
 * skip-if-complete redirect.
 *
 * The flag lives on the School record: the seeded demo school is complete
 * (the wizard must never appear for it), a freshly registered tenant starts
 * incomplete (the wizard is its first-run step), and the onboarding save
 * flips it true via updateSchool. The /onboarding page reads it through
 * /api/auth/me; the store-level behavior is what's covered here.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-school-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
});

afterEach(() => {
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

async function seededSchoolId() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return match.id;
}

describe("school onboarding flag", () => {
  it("the seeded demo school is already onboarding-complete", async () => {
    const school = await demoStore.getSchoolById(await seededSchoolId());
    assert.equal(school.onboardingComplete, true);
  });

  it("a freshly registered school starts incomplete", async () => {
    const { school } = await demoStore.createSchoolAndAdmin({
      schoolName: "Fresh Academy",
      adminName: "Fresh Admin",
      email: "fresh@edutrack.app",
      password: "fresh123",
    });
    assert.equal(school.onboardingComplete, false);
  });

  it("updateSchool can mark a school complete (the onboarding save)", async () => {
    const { school } = await demoStore.createSchoolAndAdmin({
      schoolName: "Wizard Academy",
      adminName: "Wizard Admin",
      email: "wizard@edutrack.app",
      password: "wizard123",
    });
    const completed = await demoStore.updateSchool(school.id, {
      activeArms: ["JSS1"],
      onboardingComplete: true,
    });
    assert.equal(completed.onboardingComplete, true);
  });

  it("the flag survives a simulated restart (persistence round-trip)", async () => {
    const { school } = await demoStore.createSchoolAndAdmin({
      schoolName: "Survivor Academy",
      adminName: "Survivor Admin",
      email: "survivor@edutrack.app",
      password: "survivor123",
    });
    await demoStore.updateSchool(school.id, { onboardingComplete: true });
    await demoStore.__persistNow();

    demoStore.__reloadDemoStore();

    const restored = await demoStore.getSchoolById(school.id);
    assert.equal(restored.onboardingComplete, true);
  });
});
