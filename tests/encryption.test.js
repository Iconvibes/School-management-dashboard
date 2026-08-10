/**
 * Encryption-at-rest integration tests (demo-store parity).
 *
 * The demo store keeps plaintext in MEMORY (fast, debuggable) but its on-disk
 * snapshot — the analogue of the Mongo store's documents — must hold
 * CIPHERTEXT: emails and phones as `enc:v1:` envelopes, plus `idx:v1:` blind
 * indexes for equality lookups. These tests drive the real store through its
 * persistence hooks and assert on the raw snapshot bytes:
 *
 *   1. no plaintext PII anywhere in the file
 *   2. lookups (findUserByEmailInSchool / findUserByEmail) still work after a
 *      restart — the login path runs on blind indexes, not plaintext
 *   3. a legacy plaintext snapshot (written pre-encryption) loads and upgrades
 *   4. leads and notification recipient emails are encrypted too
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";
import {
  blindEmailIndex,
  blindPhoneIndex,
  decryptField,
  isEncrypted,
} from "../src/lib/field-crypto.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-enc-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

function rawSnapshot() {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

describe("snapshot holds ciphertext (demo-store parity)", () => {
  it("never writes a plaintext email or phone to disk", async () => {
    const school = await seededSchool();
    await demoStore.createUser({
      schoolId: school.id,
      name: "Cipher Student",
      email: "cipher@edutrack.app",
      password: "keepme123",
      role: "STUDENT",
      phone: "0803 111 2222",
    });
    demoStore.__persistNow();

    const raw = fs.readFileSync(file, "utf8");
    assert.ok(!raw.includes("cipher@edutrack.app"), "plaintext email leaked into the snapshot");
    assert.ok(!raw.includes("0803 111 2222"), "plaintext phone leaked into the snapshot");
    // Even the seeded demo emails must be encrypted at rest.
    assert.ok(!raw.includes("admin@edutrack.app"), "seeded email leaked into the snapshot");
    assert.ok(!raw.includes("k.adebayo@edutrack.app"), "seeded student email leaked");
  });

  it("stores every user email as an encrypted envelope with a blind index", async () => {
    const school = await seededSchool();
    await demoStore.createUser({
      schoolId: school.id,
      name: "Cipher Student",
      email: "cipher@edutrack.app",
      password: "keepme123",
      role: "STUDENT",
      phone: "0803 111 2222",
    });
    demoStore.__persistNow();

    const snap = rawSnapshot();
    const stored = snap.users.find((u) => u.name === "Cipher Student");
    assert.ok(stored, "user is in the snapshot");
    assert.ok(isEncrypted(stored.email), "email is an enc:v1 envelope");
    assert.equal(stored.emailIdx, blindEmailIndex("cipher@edutrack.app"));
    assert.ok(isEncrypted(stored.phone), "phone is an enc:v1 envelope");
  });

  it("a created account + phone survive a restart and still resolve by email (login parity)", async () => {
    const school = await seededSchool();
    await demoStore.createUser({
      schoolId: school.id,
      name: "Survivor Cipher",
      email: "survivor.cipher@edutrack.app",
      password: "keepme123",
      role: "STUDENT",
      phone: "0803 999 0000",
    });
    demoStore.__persistNow();

    demoStore.__reloadDemoStore();

    // The login lookup path (blind index) must still find the user.
    const found = await demoStore.findUserByEmailInSchool(
      school.id,
      "survivor.cipher@edutrack.app"
    );
    assert.ok(found, "login lookup failed after decrypt-on-restore");
    assert.equal(found.email, "survivor.cipher@edutrack.app");
    assert.equal(found.phone, "0803 999 0000");
    assert.notEqual(found.password, "keepme123");
  });

  it("blind indexes are stable across a restart (dedupe still works)", async () => {
    const school = await seededSchool();
    const first = await demoStore.createUser({
      schoolId: school.id,
      name: "Dedupe Student",
      email: "dedupe@edutrack.app",
      password: "keepme123",
      role: "STUDENT",
    });
    demoStore.__persistNow();
    demoStore.__reloadDemoStore();

    // Duplicate-email check used by the users POST route.
    const dup = await demoStore.findUserByEmailInSchool(school.id, "Dedupe@Edutrack.APP");
    assert.ok(dup, "case-insensitive dedupe broke across the restart");
    assert.equal(dup.id, first.id);
  });

  it("a phone change recomputes the blind index from the PLAINTEXT (regression)", async () => {
    const school = await seededSchool();
    const created = await demoStore.createUser({
      schoolId: school.id,
      name: "Phone Updater",
      email: "phone.up@edutrack.app",
      password: "keepme123",
      role: "STUDENT",
      phone: "0803 111 2222",
    });
    // Update the phone — the snapshot must hold the NEW phone's ciphertext
    // and the index must match the NEW phone (never the old envelope).
    await demoStore.updateUser(created.id, { phone: "0803 999 8888" });
    demoStore.__persistNow();

    const snap = rawSnapshot();
    const stored = snap.users.find((u) => u.id === created.id);
    assert.equal(decryptField(stored.phone), "0803 999 8888");
    assert.equal(stored.phoneIdx, blindPhoneIndex("0803 999 8888"));
    assert.notEqual(stored.phoneIdx, blindPhoneIndex("0803 111 2222"));

    // And the in-memory read returns the updated plaintext.
    demoStore.__reloadDemoStore();
    const reloaded = await demoStore.findUserById(created.id);
    assert.equal(reloaded.phone, "0803 999 8888");
  });
});

describe("legacy plaintext snapshot migration", () => {
  it("loads a pre-encryption snapshot and upgrades it on the next save", async () => {
    const school = await seededSchool();
    // __resetDemoStore deletes the snapshot, so dirty the store and flush to
    // produce a baseline file — then rewrite it in the OLD format: plaintext
    // emails, no blind indexes.
    await demoStore.createUser({
      schoolId: school.id,
      name: "Migration Seed",
      email: "migration.seed@edutrack.app",
      password: "seed123",
      role: "STUDENT",
    });
    demoStore.__persistNow();
    const legacy = rawSnapshot();
    for (const u of legacy.users) {
      delete u.emailIdx;
      delete u.phoneIdx;
    }
    fs.writeFileSync(file, JSON.stringify(legacy));

    demoStore.__reloadDemoStore();

    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    assert.ok(admin, "legacy plaintext user must still be found after migration");
    assert.equal(admin.email, "admin@edutrack.app");

    // Trigger a save — the next snapshot must be encrypted.
    await demoStore.createUser({
      schoolId: school.id,
      name: "Post Migration",
      email: "post.migration@edutrack.app",
      password: "migrate123",
      role: "STUDENT",
    });
    demoStore.__persistNow();
    const raw = fs.readFileSync(file, "utf8");
    assert.ok(!raw.includes("admin@edutrack.app"), "legacy email was not re-encrypted");
    assert.ok(raw.includes("enc:v1:"), "snapshot is not encrypted after migration");
  });
});

describe("leads and notification recipients are encrypted at rest", () => {
  it("lead emails/phones are ciphertext in the snapshot and decrypt on read", async () => {
    await demoStore.createLead({
      kind: "newsletter",
      email: "reader@blog.app",
    });
    await demoStore.createLead({
      kind: "demo",
      name: "Demo School",
      school: "Sunrise Academy",
      email: "contact@sunrise.app",
      phone: "0900 123 4567",
    });
    demoStore.__persistNow();

    const raw = fs.readFileSync(file, "utf8");
    assert.ok(!raw.includes("reader@blog.app"), "newsletter email leaked");
    assert.ok(!raw.includes("contact@sunrise.app"), "demo-lead email leaked");
    assert.ok(!raw.includes("0900 123 4567"), "lead phone leaked");

    // Read path still returns plaintext (admin console shows leads).
    const leads = await demoStore.listLeads();
    assert.ok(leads.some((l) => l.email === "reader@blog.app"));
    assert.ok(leads.some((l) => l.phone === "0900 123 4567"));

    // Dedupe still works via the blind index.
    const dup = await demoStore.createLead({ kind: "newsletter", email: "Reader@Blog.app" });
    assert.equal(dup, null, "case-insensitive lead dedupe broke");
  });

  it("notification recipient emails are encrypted in the snapshot and decrypted for the inbox", async () => {
    const school = await seededSchool();
    const [admin] = await demoStore.listUsers({ schoolId: school.id, role: "SUPER_ADMIN" });
    const [student] = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    const note = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_reminder",
      to: [student.email],
      subject: "Fee reminder",
      preview: "Your balance is due",
      body: "Please pay up.",
    });
    demoStore.__persistNow();

    const raw = fs.readFileSync(file, "utf8");
    assert.ok(!raw.includes(student.email), "recipient email leaked into the snapshot");

    demoStore.__reloadDemoStore();
    const inbox = await demoStore.listNotifications(school.id, admin.id);
    const restored = inbox.find((n) => n.id === note.id);
    assert.ok(restored, "notification survived the restart");
    assert.deepEqual(restored.to, [student.email], "recipient email not decrypted for the inbox");
  });
});
