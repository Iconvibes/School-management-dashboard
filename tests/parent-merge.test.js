/**
 * Merge duplicate parent accounts.
 *
 * Pre-guard data can contain two parents that should be one (same person,
 * two accounts, children split between them). The merge picks a canonical
 * (kept) account, re-links EVERY child of the removed account onto it, and
 * deletes the removed account — so no child is orphaned and the kept parent
 * can still sign in with any re-linked child's name. These tests drive the
 * REAL merge route with a real signed session against the REAL demo store.
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
import { matchesChildName } from "../src/lib/passwords.js";

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
const { POST } = await import("../src/app/api/users/merge-parents/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-parent-merge-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function adminToken() {
  const [school] = await demoStore.searchSchools("Greenfield");
  const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
  return { schoolId: school.id, token: signToken({ userId: admin.id, role: admin.role, schoolId: school.id }) };
}

function merge(keepId, removeId) {
  return POST(
    new Request("http://localhost/api/users/merge-parents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keepId, removeId }),
    })
  );
}

async function makeParent(schoolId, name) {
  return demoStore.createUser({ schoolId, name, email: "", password: "x12345", role: "PARENT" });
}

async function makeStudent(schoolId, name, parentId) {
  // createUser has no parentId field (parity with the app: a student is
  // created, then linked via updateUser — which is also where the parent's
  // child-name password sync lives).
  const student = await demoStore.createUser({
    schoolId,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]/g, "")}@test.app`,
    password: "x12345",
    role: "STUDENT",
    assignedClass: "JSS1",
  });
  return parentId ? demoStore.updateUser(student.id, { parentId }) : student;
}

describe("POST /api/users/merge-parents", () => {
  it("re-links every child of the removed parent and deletes it", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);

    const keep = await makeParent(schoolId, "Mrs. Keep Parent");
    const remove = await makeParent(schoolId, "Mrs. Remove Parent");
    const child1 = await makeStudent(schoolId, "Ada Keep", keep.id);
    const child2 = await makeStudent(schoolId, "Bola Remove", remove.id);
    const child3 = await makeStudent(schoolId, "Chidi Remove", remove.id);

    const res = await merge(keep.id, remove.id);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.merged.studentsRelinked, 2);

    // The removed account is gone; the kept one remains with all children.
    assert.equal(await demoStore.findUserById(remove.id), null);
    assert.ok(await demoStore.findUserById(keep.id));
    const students = await demoStore.listUsers({ schoolId, role: "STUDENT" });
    const b = students.find((s) => s.name === "Bola Remove");
    const c = students.find((s) => s.name === "Chidi Remove");
    assert.equal(b.parentId, keep.id);
    assert.equal(c.parentId, keep.id);
    assert.equal(students.find((s) => s.name === "Ada Keep").parentId, keep.id);
  });

  it("the kept parent can still sign in with ANY re-linked child's name", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);

    const keep = await makeParent(schoolId, "Mrs. Keep Parent");
    const remove = await makeParent(schoolId, "Mrs. Remove Parent");
    await makeStudent(schoolId, "Bola Remove", remove.id);

    const res = await merge(keep.id, remove.id);
    assert.equal(res.status, 200);

    // Same path the login route uses: getChildren + matchesChildName.
    const children = await demoStore.getChildren(keep.id);
    assert.equal(children.length, 1);
    assert.equal(matchesChildName("Bola Remove", children), true);
  });

  it("rejects a merge where either account is not a parent", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);

    const keep = await makeParent(schoolId, "Mrs. Keep Parent");
    const student = await makeStudent(schoolId, "Not A Parent", null);

    const res = await merge(keep.id, student.id);
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /parents/i);

    const res2 = await merge(student.id, keep.id);
    assert.equal(res2.status, 400);
  });

  it("rejects a merge across schools (tenant isolation)", async () => {
    const { token } = await adminToken();
    const other = await demoStore.createSchoolAndAdmin({
      schoolName: "Merge Academy",
      adminName: "Ms. Boss",
      email: "boss@merge.app",
      password: "boss12345",
    });
    const otherParent = await makeParent(other.school.id, "Mrs. Other Parent");
    const [school] = await demoStore.searchSchools("Greenfield");
    const keep = await makeParent(school.id, "Mrs. Keep Parent");

    __setSessionToken(token);
    const res = await merge(keep.id, otherParent.id);
    assert.ok(res.status === 400 || res.status === 403, `got ${res.status}`);
  });

  it("rejects merging an account into itself", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);
    const keep = await makeParent(schoolId, "Mrs. Keep Parent");

    const res = await merge(keep.id, keep.id);
    assert.equal(res.status, 400);
  });

  it("404 when either account does not exist", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);
    const keep = await makeParent(schoolId, "Mrs. Keep Parent");

    const res = await merge(keep.id, "usr_nonexistent");
    assert.equal(res.status, 404);
  });
});
