/**
 * School seal (sealUrl) tests.
 *
 * Schools can upload a seal / signature stamp image that prints on report
 * cards next to the logo. It lives on the school record like logoUrl, is
 * saved through the same PATCH /api/school branding path, and must obey the
 * same image-safety rules (image data under ~2 MB).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const { PATCH } = await import("../src/app/api/school/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-seal-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  __setSessionToken("");
});

afterEach(() => {
  __setSessionToken("");
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

async function seededSchool() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return demoStore.getSchoolById(match.id);
}

/** Seed the school's SUPER_ADMIN (the seed school has none) and log in. */
async function seedSuperAdmin() {
  const school = await seededSchool();
  const admin = await demoStore.createUser({
    schoolId: school.id,
    name: "Founder Admin",
    email: "founder@greenfield.test",
    password: "adminpass",
    role: "SUPER_ADMIN",
  });
  __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));
  return { school, admin };
}

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function patchSchool(body) {
  return PATCH(
    new Request("http://localhost/api/school", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("school seal (sealUrl)", () => {
  it("a new school starts without a seal and updateSchool persists one", async () => {
    const { school } = await demoStore.createSchoolAndAdmin({
      schoolName: "Seal Academy",
      adminName: "Seal Admin",
      email: "seal@edutrack.app",
      password: "seal123",
    });
    assert.equal(school.sealUrl, "");

    const updated = await demoStore.updateSchool(school.id, { sealUrl: TINY_PNG });
    assert.equal(updated.sealUrl, TINY_PNG);

    // Survives a simulated restart (persistence round-trip).
    const reloaded = await demoStore.getSchoolById(school.id);
    assert.equal(reloaded.sealUrl, TINY_PNG);
  });

  it("PATCH /api/school stores the seal next to the logo", async () => {
    const { school } = await seedSuperAdmin();
    const res = await patchSchool({
      logoUrl: TINY_PNG,
      sealUrl: TINY_PNG,
      brandColor: "#7C3AED",
    });
    assert.equal(res.status, 200);
    const { school: saved } = await res.json();
    assert.equal(saved.sealUrl, TINY_PNG);
    assert.equal(saved.logoUrl, TINY_PNG);
    assert.equal(saved.brandColor, "#7C3AED");
  });

  it("rejects a non-image seal", async () => {
    await seedSuperAdmin();
    const res = await patchSchool({ sealUrl: "data:text/plain;base64,SGVsbG8=" });
    assert.equal(res.status, 400);
  });

  it("rejects an oversized seal (over ~2 MB)", async () => {
    await seedSuperAdmin();
    const huge = `data:image/png;base64,${"A".repeat(2 * 1024 * 1024 + 1)}`;
    const res = await patchSchool({ sealUrl: huge });
    assert.equal(res.status, 400);
  });

  it("an empty sealUrl clears the seal", async () => {
    const { school } = await seedSuperAdmin();
    await patchSchool({ sealUrl: TINY_PNG });
    assert.equal((await demoStore.getSchoolById(school.id)).sealUrl, TINY_PNG);

    const res = await patchSchool({ sealUrl: "" });
    assert.equal(res.status, 200);
    assert.equal((await demoStore.getSchoolById(school.id)).sealUrl, "");
  });
});
