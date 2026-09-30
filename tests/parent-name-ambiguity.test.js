/**
 * Duplicate-parent-name guard at LOGIN (TECH_DEBT L2 hardening).
 *
 * The create/rename paths already reject duplicate parent names within a
 * school (tests/parent-duplicate.test.js). This suite proves the failure
 * mode that guard exists to prevent: if two same-named parents somehow DO
 * coexist (legacy rows, a raced guard, an import), the ambiguous name must
 * NEVER silently resolve to one of them — that would hand one family's
 * linked children to whoever shares the name. The login route now fails
 * closed (401) for an ambiguous name while the same name in a DIFFERENT
 * school still logs in fine (tenant-scoped), and unambiguous names keep
 * working.
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

// Force demo mode BEFORE importing the route (it binds the store at import).
const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { POST: loginPOST } = await import("../src/app/api/auth/login/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(
    os.tmpdir(),
    `edutrack-l2-${process.pid}-${Math.random().toString(36).slice(2)}.json`
  );

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
});

afterEach(() => {
  __setSessionToken("");
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

/** Forge the coexistence scenario: two same-named parents in one school. */
async function seedAmbiguousParents(schoolId, name) {
  // Seed one parent with a linked child, then force a second same-named
  // parent with a DIFFERENT child — bypassing the create guard, exactly the
  // legacy/raced-row scenario the hardening targets.
  const childA = await demoStore.createUser({
    schoolId,
    name: "Ada Firstborn",
    email: "ada.first@test.app",
    password: "ada12345",
    role: "STUDENT",
    assignedClass: "JSS1",
  });
  const childB = await demoStore.createUser({
    schoolId,
    name: "Tunde Secondborn",
    email: "tunde.second@test.app",
    password: "tunde123",
    role: "STUDENT",
    assignedClass: "JSS1",
  });
  const parentA = await demoStore.createUser({
    schoolId,
    name,
    email: "parent.a@test.app",
    password: "placeholder-a",
    role: "PARENT",
  });
  const parentB = await demoStore.createUser({
    schoolId,
    name, // same name, second account
    email: "parent.b@test.app",
    password: "placeholder-b",
    role: "PARENT",
  });
  await demoStore.updateUser(childA.id, { parentId: parentA.id });
  await demoStore.updateUser(childB.id, { parentId: parentB.id });
  return { parentA, parentB, childA, childB };
}

async function parentLogin(schoolId, name, childName) {
  const res = await loginPOST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, password: childName, role: "PARENT", schoolId }),
    })
  );
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body };
}

describe("L2 — two same-named parents cannot reach each other's children", () => {
  it("the ambiguous name is REFUSED at login (401), never silently resolved", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const NAME = "Mrs. Dup Test";

    const { parentA, childA, childB } = await seedAmbiguousParents(school.id, NAME);

    // Parent A's correct credential (her own child's name) must NOT log her
    // in: with two same-named parents the resolver cannot know which account
    // was intended, and guessing would leak the other family's records.
    const viaA = await parentLogin(school.id, NAME, "Ada Firstborn");
    assert.equal(viaA.status, 401, "ambiguous name must fail closed");
    assert.match(viaA.body.error, /more than one account/i);

    // Symmetric: parent B's credential is refused too.
    const viaB = await parentLogin(school.id, NAME, "Tunde Secondborn");
    assert.equal(viaB.status, 401, "the second twin is equally ambiguous");

    // And NEITHER parent's session can be used to read the other's child:
    // no session was ever issued, but assert the guard fired before any
    // child-name validation ran (no account oracle in the message).
    assert.ok(!viaA.body.user && !viaB.body.user, "no session body may be returned");
    void parentA; void childA; void childB;
  });

  it("the same name in a DIFFERENT school still logs in (tenant-scoped)", async () => {
    const [greenfield] = await demoStore.searchSchools("Greenfield");
    const NAME = "Mrs. Cross Tenant";
    await seedAmbiguousParents(greenfield.id, NAME);

    const other = await demoStore.createSchoolAndAdmin({
      schoolName: "L2 Academy",
      adminName: "Ms. Boss",
      email: "boss@l2.app",
      password: "boss12345",
    });
    const otherChild = await demoStore.createUser({
      schoolId: other.school.id,
      name: "Chidi Only",
      email: "chidi@l2.app",
      password: "chidi123",
      role: "STUDENT",
      assignedClass: "JSS1",
    });
    const otherParent = await demoStore.createUser({
      schoolId: other.school.id,
      name: NAME,
      email: "cross@l2.app",
      password: "placeholder-x",
      role: "PARENT",
    });
    await demoStore.updateUser(otherChild.id, { parentId: otherParent.id });

    const res = await parentLogin(other.school.id, NAME, "Chidi Only");
    assert.equal(res.status, 200, "a unique name in another tenant is fine");
    assert.equal(res.body.user.role, "PARENT");
  });

  it("an unambiguous parent name keeps logging in (no false positives)", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const seeded = await demoStore.listUsers({ schoolId: school.id, role: "PARENT" });
    assert.ok(seeded.length > 0, "demo seed ships a parent");
    const child = (await demoStore.getChildren(seeded[0].id))?.[0];
    assert.ok(child, "seeded parent has a linked child");

    const res = await parentLogin(school.id, seeded[0].name, child.name);
    assert.equal(res.status, 200, "the happy path must not regress");
    assert.equal(res.body.user.id, seeded[0].id);
  });
});
