/**
 * Duplicate-parent-name guard.
 *
 * A parent's full name is now a login identifier within a school (name-based
 * login). Two parents with the same name in one school would make that
 * login ambiguous — findParentByNameInSchool returns one match and the other
 * parent would be shadowed. So creating a parent whose exact name already
 * exists in the school must be rejected instead of silently creating a
 * second account. These tests drive the REAL /api/users POST route with a
 * real signed session against the REAL demo store.
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
const { POST } = await import("../src/app/api/users/route.js");
const { PATCH } = await import("../src/app/api/users/[id]/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-parent-dup-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

function createParent(schoolId, name) {
  return POST(
    new Request("http://localhost/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, role: "PARENT" }),
    })
  );
}

async function createParentAs(schoolId, token, name) {
  const res = await POST(
    new Request("http://localhost/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, role: "PARENT" }),
    })
  );
  __setSessionToken(token);
  return res;
}

function renameUser(token, id, name) {
  return PATCH(
    new Request(`http://localhost/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    { params: { id } }
  );
}

describe("PATCH /api/users — parent renames are duplicate-guarded too", () => {
  it("rejects renaming a parent to another parent's name in the school", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);
    const created = await createParentAs(schoolId, token, "Mrs. Bisi Okafor");
    const parentId = (await created.json()).user.id;

    __setSessionToken(token);
    const res = await renameUser(token, parentId, "Mrs. Folake Adebayo"); // seeded parent's name
    const data = await res.json();

    assert.equal(res.status, 409);
    assert.match(data.error, /already exists/i);
  });

  it("allows renaming a parent to a brand-new name", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);
    const created = await createParentAs(schoolId, token, "Mrs. Bisi Okafor");
    const parentId = (await created.json()).user.id;

    __setSessionToken(token);
    const res = await renameUser(token, parentId, "Mrs. Bisi Adeyemi");
    assert.equal(res.status, 200);
  });

  it("allows a rename to the parent's own current name (self-match excluded)", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);
    const created = await createParentAs(schoolId, token, "Mrs. Bisi Okafor");
    const parentId = (await created.json()).user.id;

    __setSessionToken(token);
    const res = await renameUser(token, parentId, "Mrs. Bisi Okafor");
    assert.equal(res.status, 200);
  });

  it("allows renaming a STUDENT to a parent's name (role-filtered)", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);
    const student = await demoStore.createUser({
      schoolId,
      name: "Test Student",
      email: "student.test@test.app",
      password: "x12345",
      role: "STUDENT",
      assignedClass: "JSS1",
    });

    __setSessionToken(token);
    const res = await renameUser(token, student.id, "Mrs. Folake Adebayo");
    assert.equal(res.status, 200);
  });

  it("allows a rename to a parent name used in ANOTHER school (tenant-scoped)", async () => {
    const other = await demoStore.createSchoolAndAdmin({
      schoolName: "Third Academy",
      adminName: "Ms. Boss",
      email: "boss@third.app",
      password: "boss12345",
    });
    const otherToken = signToken({
      userId: other.user.id,
      role: other.user.role,
      schoolId: other.school.id,
    });
    __setSessionToken(otherToken);
    const created = await createParentAs(other.school.id, otherToken, "Mrs. Folake Adebayo");
    const otherParentId = (await created.json()).user.id;

    // Rename THAT parent to yet another name, then back to Folake's name in
    // the FIRST school — must be allowed (different tenants).
    __setSessionToken(otherToken);
    const res = await renameUser(otherToken, otherParentId, "Mrs. Folake Adebayo");
    assert.equal(res.status, 200);
  });
});

describe("POST /api/users — duplicate parent names are rejected", () => {
  it("rejects a parent whose exact name already exists in the school", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);

    // "Mrs. Folake Adebayo" is the seeded parent.
    const res = await createParent(schoolId, "Mrs. Folake Adebayo");
    const data = await res.json();

    assert.equal(res.status, 409);
    assert.match(data.error, /already exists/i);
  });

  it("matches case- and whitespace-insensitively", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);

    const res = await createParent(schoolId, "  mrs. FOLAKE adebayo ");
    assert.equal(res.status, 409);
  });

  it("creates a parent with a different name", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);

    const res = await createParent(schoolId, "Mrs. Bisi Okafor");
    const data = await res.json();

    assert.equal(res.status, 201);
    assert.equal(data.user.role, "PARENT");
  });

  it("allows the same parent name in a DIFFERENT school (tenant-scoped)", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);

    // A second tenant with its own admin — same parent name, different school.
    const other = await demoStore.createSchoolAndAdmin({
      schoolName: "Second Academy",
      adminName: "Ms. Boss",
      email: "boss@second.app",
      password: "boss12345",
    });
    const otherToken = signToken({
      userId: other.user.id,
      role: other.user.role,
      schoolId: other.school.id,
    });
    __setSessionToken(otherToken);

    const res = await createParent(other.school.id, "Mrs. Folake Adebayo");
    assert.equal(res.status, 201);
    assert.notEqual(schoolId, other.school.id);
  });

  it("allows a STUDENT to share a parent's name (only PARENT accounts count)", async () => {
    const { schoolId, token } = await adminToken();
    __setSessionToken(token);

    const res = await createParent(schoolId, "Mrs. Folake Adebayo"); // blocked as PARENT
    assert.equal(res.status, 409);

    // Same name as a STUDENT is fine — the guard is role-filtered.
    const studentRes = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Mrs. Folake Adebayo",
          email: "student.folake@test.app",
          role: "STUDENT",
          assignedClass: "JSS1",
        }),
      })
    );
    assert.equal(studentRes.status, 201);
  });
});
