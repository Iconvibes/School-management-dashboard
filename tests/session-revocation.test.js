/**
 * Session revocation on password change (tokenVersion).
 *
 * Sessions are stateless JWTs: a token stays signature-valid until its 7-day
 * expiry, so a password change must invalidate every previously issued token.
 * The User record carries a tokenVersion counter; tokens are signed with the
 * version at login, and requireAuth rejects any session whose version differs
 * from the live record. Existing deployed tokens (no version claim) must stay
 * valid while the account is at version 0 — nothing breaks for them.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";

// policy.js binds its store from MONGODB_URI at module-evaluation time — force
// demo mode exactly like tests/policy.test.js.
const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { isDenied, requireAuth } = await import("../src/lib/policy.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-session-revocation-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function seededAdmin() {
  const [match] = await demoStore.searchSchools("Greenfield");
  const [admin] = await demoStore.listUsers({ schoolId: match.id, role: "SUPER_ADMIN" });
  return admin;
}

describe("requireAuth — tokenVersion re-validation", () => {
  it("401 when the token's version is older than the live account (password changed)", async () => {
    const admin = await seededAdmin();
    const session = { userId: admin.id, role: "SUPER_ADMIN", schoolId: admin.schoolId, tokenVersion: 0 };

    // The account's password was changed, bumping the version.
    await demoStore.updateUser(admin.id, { tokenVersion: 1 });

    const out = await requireAuth(["SUPER_ADMIN"], session);

    assert.equal(isDenied(out), true);
    assert.equal(out.status, 401);
    assert.equal((await out.json()).error, "Session no longer valid. Please sign in again.");
  });

  it("honors a session whose version matches the live account (fresh login after the change)", async () => {
    const admin = await seededAdmin();
    await demoStore.updateUser(admin.id, { tokenVersion: 1 });
    const session = { userId: admin.id, role: "SUPER_ADMIN", schoolId: admin.schoolId, tokenVersion: 1 };

    const out = await requireAuth(["SUPER_ADMIN"], session);

    assert.equal(isDenied(out), false);
    assert.equal(out.role, "SUPER_ADMIN");
  });

  it("rejects a token that over-claims a version (equality both ways)", async () => {
    const admin = await seededAdmin();
    // Fresh account at version 0; a token claiming version 1 never existed.
    const session = { userId: admin.id, role: "SUPER_ADMIN", schoolId: admin.schoolId, tokenVersion: 1 };

    const out = await requireAuth(["SUPER_ADMIN"], session);

    assert.equal(isDenied(out), true);
    assert.equal(out.status, 401);
  });

  it("a SECOND password change revokes tokens issued after the FIRST (counter advances)", async () => {
    const admin = await seededAdmin();
    // Change #1 → account at version 1; a fresh login after it stamps 1.
    await demoStore.updateUser(admin.id, { tokenVersion: 1 });
    const afterFirstChange = {
      userId: admin.id,
      role: "SUPER_ADMIN",
      schoolId: admin.schoolId,
      tokenVersion: 1,
    };
    assert.equal(isDenied(await requireAuth(["SUPER_ADMIN"], afterFirstChange)), false);

    // Change #2 → account at version 2; the version-1 token must now die.
    await demoStore.updateUser(admin.id, { tokenVersion: 2 });
    const out = await requireAuth(["SUPER_ADMIN"], afterFirstChange);

    assert.equal(isDenied(out), true);
    assert.equal(out.status, 401);
    // A fresh login after the second change works.
    const afterSecondChange = {
      userId: admin.id,
      role: "SUPER_ADMIN",
      schoolId: admin.schoolId,
      tokenVersion: 2,
    };
    assert.equal(isDenied(await requireAuth(["SUPER_ADMIN"], afterSecondChange)), false);
  });

  it("legacy tokens with NO version claim stay valid while the account is at version 0", async () => {
    const admin = await seededAdmin();
    // Tokens issued before this feature: no tokenVersion claim at all.
    const session = { userId: admin.id, role: "SUPER_ADMIN", schoolId: admin.schoolId };

    const out = await requireAuth(["SUPER_ADMIN"], session);

    assert.equal(isDenied(out), false);
    assert.equal(out.role, "SUPER_ADMIN");
  });
});

describe("demo store — tokenVersion persistence", () => {
  it("updateUser persists a tokenVersion bump and findAuthSnapshot exposes it", async () => {
    const admin = await seededAdmin();

    // Fresh accounts start at version 0 (normalized when absent).
    assert.equal((await demoStore.findAuthSnapshot(admin.id)).tokenVersion, 0);

    await demoStore.updateUser(admin.id, { tokenVersion: 3 });
    assert.equal((await demoStore.findAuthSnapshot(admin.id)).tokenVersion, 3);
  });

  it("the auth snapshot normalizes a missing tokenVersion to 0 for legacy rows", async () => {
    const admin = await seededAdmin();
    const snap = await demoStore.findAuthSnapshot(admin.id);
    assert.equal(snap.tokenVersion, 0);
  });
});
