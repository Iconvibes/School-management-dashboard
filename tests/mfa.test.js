/**
 * MFA tests — the store and token machinery behind the two-step login.
 *
 * The store must treat mfaSecret exactly like the password: available only
 * through the auth-shape lookups (findUserByEmailInSchool /
 * findUserByIdWithSecret), stripped from every public shape, and settable
 * only through the dedicated setMfaSecret op.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import * as demoStore from "../src/lib/demo-store.js";
import { jsonError, setMfaCookie, clearMfaCookie } from "../src/lib/auth.js";
import { signMfaToken, verifyMfaToken } from "../src/lib/token.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-mfa-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function seededUser(role) {
  const schoolId = await seededSchoolId();
  const [user] = await demoStore.listUsers({ schoolId, role });
  return user;
}

describe("mfaSecret storage", () => {
  it("seeded staff accounts start with MFA disabled and no secret in the public shape", async () => {
    const admin = await demoStore.findUserById((await seededUser("SUPER_ADMIN")).id);
    assert.equal(admin.mfaEnabled, false);
    assert.equal("mfaSecret" in admin, false);
    assert.equal("password" in admin, false);
  });

  it("setMfaSecret persists and flips mfaEnabled, keeping the secret out of public shapes", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const saved = await demoStore.setMfaSecret(admin.id, "JBSWY3DPEHPK3PXP");
    assert.equal(saved.mfaEnabled, true);
    assert.equal("mfaSecret" in saved, false);

    const byId = await demoStore.findUserById(admin.id);
    assert.equal(byId.mfaEnabled, true);
    assert.equal("mfaSecret" in byId, false);

    // The auth-shape lookup (what login / MFA verify use) DOES expose it.
    const byEmail = await demoStore.findUserByEmailInSchool(admin.schoolId, admin.email);
    assert.equal(byEmail.mfaSecret, "JBSWY3DPEHPK3PXP");
    const byIdWithSecret = await demoStore.findUserByIdWithSecret(admin.id);
    assert.equal(byIdWithSecret.mfaSecret, "JBSWY3DPEHPK3PXP");
  });

  it("setMfaSecret survives a simulated restart (persistence)", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    await demoStore.setMfaSecret(admin.id, "JBSWY3DPEHPK3PXP");
    await demoStore.__persistNow();

    demoStore.__reloadDemoStore();

    const restored = await demoStore.findUserById(admin.id);
    assert.equal(restored.mfaEnabled, true);
    const authShape = await demoStore.findUserByIdWithSecret(admin.id);
    assert.equal(authShape.mfaSecret, "JBSWY3DPEHPK3PXP");
  });

  it("updateUser and updateRole cannot touch mfaSecret (dedicated op only)", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    await demoStore.setMfaSecret(admin.id, "JBSWY3DPEHPK3PXP");

    const updated = await demoStore.updateUser(admin.id, { name: "Renamed", mfaSecret: "HACKED" });
    assert.equal(updated.mfaEnabled, true); // untouched
    const byId = await demoStore.findUserById(admin.id);
    assert.equal(byId.mfaEnabled, true);
    const authShape = await demoStore.findUserByIdWithSecret(admin.id);
    assert.equal(authShape.mfaSecret, "JBSWY3DPEHPK3PXP"); // still the original

    await demoStore.updateRole(admin.id, "BURSAR");
    const afterRole = await demoStore.findUserById(admin.id);
    assert.equal(afterRole.mfaEnabled, true);
  });
});

describe("MFA pending ticket", () => {
  it("signs and verifies with a purpose and attempt counter", () => {
    const token = signMfaToken({ userId: "usr_1", purpose: "challenge", attempts: 2 });
    const decoded = verifyMfaToken(token);
    assert.equal(decoded.userId, "usr_1");
    assert.equal(decoded.purpose, "challenge");
    assert.equal(decoded.attempts, 2);
  });

  it("returns null for garbage tokens", () => {
    assert.equal(verifyMfaToken("not-a-token"), null);
    assert.equal(verifyMfaToken(""), null);
    assert.equal(verifyMfaToken(null), null);
  });

  it("expires after 10 minutes — not the session's 7 days", () => {
    const token = signMfaToken({ userId: "usr_1", purpose: "challenge", attempts: 0 });
    assert.ok(verifyMfaToken(token));

    // Decode the exp claim directly (jsonwebtoken decode does not verify): a
    // long-lived pending ticket would defeat the purpose of a second step.
    const payload = jwt.decode(token, { json: true });
    assert.equal(payload.exp - payload.iat, 10 * 60);
  });
});

describe("jsonError cookie compatibility (regression)", () => {
  // The wrong-code path in /api/auth/mfa/verify and /confirm returns jsonError
  // and hands it to setMfaCookie/clearMfaCookie — which need res.cookies. A
  // plain Response lacks .cookies, so jsonError must return a NextResponse.
  // Caught live during E2E: every wrong code 500'd until jsonError was fixed.
  it("setMfaCookie and clearMfaCookie accept jsonError's response", () => {
    const err = jsonError("Incorrect code. 4 attempts left.", 401);
    assert.equal(err.status, 401);
    assert.doesNotThrow(() =>
      setMfaCookie(err, signMfaToken({ userId: "usr_1", purpose: "challenge", attempts: 1 }))
    );
    assert.doesNotThrow(() => clearMfaCookie(err));
  });
});
