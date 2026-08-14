/**
 * Parent name-password flow tests.
 *
 * A parent's login password is their linked child's full name, slugged the
 * same way student auto-passwords are (lowercase, unspaced — "Adam Tope
 * Johnson" → "adamtopejohnson"). Linking a child to a parent sets that name
 * as the parent's password; a parent linked to several children can sign in
 * with ANY of their names (the login route checks every linked child) and
 * then sees all of them.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcrypt";
import * as demoStore from "../src/lib/demo-store.js";
import { nameSlug, matchesChildName } from "../src/lib/passwords.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-parent-pw-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function seededSchool() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return demoStore.getSchoolById(match.id);
}

describe("nameSlug", () => {
  it("lowercases and strips spaces and punctuation", () => {
    assert.equal(nameSlug("Adam Tope Johnson"), "adamtopejohnson");
    assert.equal(nameSlug("Chidi Obi"), "chidiobi");
    assert.equal(nameSlug("Aisha Bello-Ogunleye"), "aishabelloogunleye");
  });
  it("handles missing values", () => {
    assert.equal(nameSlug(""), "");
    assert.equal(nameSlug(null), "");
  });
});

describe("matchesChildName", () => {
  const children = [
    { id: "c1", name: "Adam Tope Johnson" },
    { id: "c2", name: "Chidinma Obi" },
  ];
  it("accepts any linked child's full name", () => {
    assert.equal(matchesChildName("Adam Tope Johnson", children), true);
    assert.equal(matchesChildName("chidinmaobi", children), true);
  });
  it("is case- and spacing-insensitive", () => {
    assert.equal(matchesChildName("aDaM tOpE JoHnSoN", children), true);
    assert.equal(matchesChildName("adam top ejohnson", children), true);
  });
  it("rejects unrelated or partial names", () => {
    assert.equal(matchesChildName("password123", children), false);
    assert.equal(matchesChildName("Adam Tope", children), false);
    assert.equal(matchesChildName("", children), false);
  });
});

describe("parent link sync (demo store)", () => {
  it("linking one child sets the parent's password to the child's slugged full name", async () => {
    const school = await seededSchool();
    const parent = await demoStore.createUser({
      schoolId: school.id,
      name: "Mr. Obi",
      email: "parent@test.app",
      password: "initial123",
      role: "PARENT",
    });
    const child = await demoStore.createUser({
      schoolId: school.id,
      name: "Adam Tope Johnson",
      email: "adam@test.app",
      password: "whatever123",
      role: "STUDENT",
      assignedClass: "JSS1",
    });

    await demoStore.updateUser(child.id, { parentId: parent.id });

    const withSecret = await demoStore.findUserByIdWithAuth(parent.id);
    assert.equal(withSecret.generatedPassword, "adamtopejohnson");
    assert.equal(await bcrypt.compare("adamtopejohnson", withSecret.password), true);
    assert.equal(await bcrypt.compare("initial123", withSecret.password), false);

    const linked = await demoStore.getChildren(parent.id);
    assert.deepEqual(linked.map((c) => c.id), [child.id]);
  });

  it("linking several children — latest name is the stored hash, any name still matches", async () => {
    const school = await seededSchool();
    const parent = await demoStore.createUser({
      schoolId: school.id,
      name: "Mrs. Obi",
      email: "mrs@test.app",
      password: "initial123",
      role: "PARENT",
    });
    const ada = await demoStore.createUser({
      schoolId: school.id,
      name: "Ada Obi",
      email: "ada@test.app",
      password: "x12345",
      role: "STUDENT",
      assignedClass: "JSS1",
    });
    const chidi = await demoStore.createUser({
      schoolId: school.id,
      name: "Chidi Obi",
      email: "chidi@test.app",
      password: "x12345",
      role: "STUDENT",
      assignedClass: "JSS2",
    });

    await demoStore.updateUser(ada.id, { parentId: parent.id });
    await demoStore.updateUser(chidi.id, { parentId: parent.id });

    const withSecret = await demoStore.findUserByIdWithAuth(parent.id);
    // The most recently linked child wins the stored hash…
    assert.equal(withSecret.generatedPassword, "chidiobi");
    assert.equal(await bcrypt.compare("chidiobi", withSecret.password), true);
    assert.equal(await bcrypt.compare("adaobi", withSecret.password), false);

    // …but the login route accepts ANY linked child's name.
    const children = await demoStore.getChildren(parent.id);
    assert.equal(children.length, 2);
    assert.equal(matchesChildName("Ada Obi", children), true);
    assert.equal(matchesChildName("Chidi Obi", children), true);
  });

  it("unlinking a child leaves the parent's password untouched", async () => {
    const school = await seededSchool();
    const parent = await demoStore.createUser({
      schoolId: school.id,
      name: "Mr. Obi",
      email: "unlink@test.app",
      password: "initial123",
      role: "PARENT",
    });
    const child = await demoStore.createUser({
      schoolId: school.id,
      name: "Ada Obi",
      email: "ada2@test.app",
      password: "x12345",
      role: "STUDENT",
      assignedClass: "JSS1",
    });

    await demoStore.updateUser(child.id, { parentId: parent.id });
    await demoStore.updateUser(child.id, { parentId: null });

    const withSecret = await demoStore.findUserByIdWithAuth(parent.id);
    assert.equal(withSecret.generatedPassword, "adaobi");
    assert.equal(await bcrypt.compare("adaobi", withSecret.password), true);
    assert.equal((await demoStore.getChildren(parent.id)).length, 0);
  });

  it("does nothing when the linked record is not a student or the target is not a parent", async () => {
    const school = await seededSchool();
    const admin = await demoStore.createUser({
      schoolId: school.id,
      name: "School Admin",
      email: "admin2@test.app",
      password: "admin123",
      role: "SUPER_ADMIN",
    });
    const parent = await demoStore.createUser({
      schoolId: school.id,
      name: "Mr. Obi",
      email: "p2@test.app",
      password: "initial123",
      role: "PARENT",
    });

    // Linking a non-student (SUPER_ADMIN) must not overwrite the parent.
    await demoStore.updateUser(admin.id, { parentId: parent.id });
    const withSecret = await demoStore.findUserByIdWithAuth(parent.id);
    assert.equal(withSecret.generatedPassword, "");
    assert.equal(await bcrypt.compare("initial123", withSecret.password), true);
  });
});
