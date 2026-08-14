/**
 * Name-based parent accounts.
 *
 * Parents sign in with their FULL NAME (the name the admin typed when
 * creating/linking them) plus a password that is automatically ANY linked
 * child's full name — no email, no admin-chosen password. The admin creates
 * a parent with just the name; linking a student makes that student's name
 * the password (multi-child parents can use any child's name).
 *
 * These tests drive the REAL login route and the REAL demo store.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";

// Force demo mode BEFORE importing the route (it binds the store at import).
const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { POST } = await import("../src/app/api/auth/login/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-parent-login-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function schoolId() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return match.id;
}

function login(body) {
  return POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

/** A name-only parent + a linked child, built through the real store. */
async function nameOnlyParent(school) {
  const parent = await demoStore.createUser({
    schoolId: school,
    name: "Mr. Obi",
    email: "", // name-only parent — no email
    password: "unusable-placeholder",
    role: "PARENT",
  });
  const child = await demoStore.createUser({
    schoolId: school,
    name: "Adam Tope Johnson",
    email: "adam@test.app",
    password: "x12345",
    role: "STUDENT",
    assignedClass: "JSS1",
  });
  // Linking makes the child's slugged full name the parent's password.
  await demoStore.updateUser(child.id, { parentId: parent.id });
  return { parent, child };
}

describe("demo store — findParentByNameInSchool", () => {
  it("finds the seeded parent by full name", async () => {
    const school = await schoolId();
    const parent = await demoStore.findParentByNameInSchool(school, "Mrs. Folake Adebayo");
    assert.ok(parent, "parent should be found by name");
    assert.equal(parent.role, "PARENT");
    assert.equal(parent.name, "Mrs. Folake Adebayo");
  });

  it("matches case-insensitively and ignores surrounding whitespace", async () => {
    const school = await schoolId();
    const parent = await demoStore.findParentByNameInSchool(school, "  mrs. FOLAKE adebayo ");
    assert.ok(parent);
    assert.equal(parent.name, "Mrs. Folake Adebayo");
  });

  it("returns null for a student's name (role filter) and for a different school", async () => {
    const school = await schoolId();
    assert.equal(await demoStore.findParentByNameInSchool(school, "Kunle Adebayo"), null);
    assert.equal(await demoStore.findParentByNameInSchool("sch_999", "Mrs. Folake Adebayo"), null);
  });

  it("creates a name-only parent with no email and finds it by name", async () => {
    const school = await schoolId();
    const { parent } = await nameOnlyParent(school);
    assert.equal(parent.email, "");
    const found = await demoStore.findParentByNameInSchool(school, "Mr. Obi");
    assert.ok(found);
    assert.equal(found.id, parent.id);
  });
});

describe("demo store — name-only parents keep unique blind indexes", () => {
  it("two no-email parents in one school can coexist (no unique-index collision)", async () => {
    const school = await schoolId();
    const a = await demoStore.createUser({ schoolId: school, name: "Parent One", email: "", password: "x12345", role: "PARENT" });
    const b = await demoStore.createUser({ schoolId: school, name: "Parent Two", email: "", password: "x12345", role: "PARENT" });
    // Both created AND independently findable — in Mongo mode the per-school
    // unique emailIdx index would reject the second unless empty emails get
    // a distinct per-user sentinel (the demo store must mirror that).
    assert.equal((await demoStore.findParentByNameInSchool(school, "Parent One")).id, a.id);
    assert.equal((await demoStore.findParentByNameInSchool(school, "Parent Two")).id, b.id);
    // And an empty-email lookup never matches either (nothing should).
    assert.ok(!(await demoStore.findUserByEmailInSchool(school, "")));
  });
});

describe("POST /api/auth/login — name-based parent sign-in", () => {
  it("signs in a name-only parent with their name + their child's full name", async () => {
    const school = await schoolId();
    const { child } = await nameOnlyParent(school);

    const res = await login({ name: "Mr. Obi", password: child.name, role: "PARENT", schoolId: school });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.user.role, "PARENT");
  });

  it("accepts ANY linked child's name as the password (multi-child parents)", async () => {
    const school = await schoolId();
    const { parent } = await nameOnlyParent(school);
    const second = await demoStore.createUser({
      schoolId: school,
      name: "Chidi Obi",
      email: "chidi@test.app",
      password: "x12345",
      role: "STUDENT",
      assignedClass: "JSS2",
    });
    await demoStore.updateUser(second.id, { parentId: parent.id });

    const res = await login({ name: "Mr. Obi", password: "Chidi Obi", role: "PARENT", schoolId: school });

    assert.equal(res.status, 200);
    assert.equal(res.json && true, true);
  });

  it("password matching is case- and spacing-insensitive", async () => {
    const school = await schoolId();
    const { child } = await nameOnlyParent(school);

    const res = await login({
      name: "mr. obi",
      password: `  ${child.name.toLowerCase()}  `,
      role: "PARENT",
      schoolId: school,
    });

    assert.equal(res.status, 200);
  });

  it("rejects a wrong password for a known parent name — warmly worded", async () => {
    const school = await schoolId();
    await nameOnlyParent(school);

    const res = await login({ name: "Mr. Obi", password: "not-a-child-name", role: "PARENT", schoolId: school });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /^Sorry/i);
    assert.match(data.error, /didn't match/i);
  });

  it("rejects an unknown parent name — warmly worded, no account oracle", async () => {
    const school = await schoolId();
    const res = await login({ name: "Nobody Here", password: "whatever123", role: "PARENT", schoolId: school });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /^Sorry/i);
    assert.match(data.error, /didn't match/i);
  });

  it("legacy email login for a parent still works (no regression)", async () => {
    const school = await schoolId();
    const res = await login({ email: "p.adebayo@edutrack.app", password: "parent123", role: "PARENT", schoolId: school });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).user.role, "PARENT");
  });
});
