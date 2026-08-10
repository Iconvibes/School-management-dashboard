/**
 * Backup / disaster-recovery tooling tests.
 *
 * Drives the REAL engines in scripts/backup-utils.mjs (imported directly —
 * no spawning, except where a behavior genuinely needs a separate process)
 * against a demo-store snapshot built through the store's own test hooks:
 *
 *   backupDemo    — snapshot → self-verifying single-file backup
 *   verifyBackup  — checksum / PII-at-rest / key-fingerprint gate (read-only)
 *   restoreDemo   — full verification → DATA_ENC_KEY gate → safety copy →
 *                   write the live store file
 *
 * Covers: a backup → verify → restore round-trip that survives a simulated
 * restart; checksum tamper detection; plaintext-PII refusal (with --force
 * escape hatch); DATA_ENC_KEY mismatch refusal across processes (the key is
 * derived at module load, so the mismatch can only be simulated in a child);
 * missing-file errors; the mongo argv builders; and one end-to-end pass
 * through the real CLI scripts (backup → restore → verify) the way cron and
 * an operator would drive them.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as demoStore from "../src/lib/demo-store.js";
import { dataKeyFingerprint } from "../src/lib/field-crypto.js";
import {
  backupDemo,
  buildMongoDumpArgs,
  buildMongoRestoreArgs,
  checkRestoreKeys,
  dbNameFromUri,
  restoreDemo,
  verifyBackup,
} from "../scripts/backup-utils.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UTILS_URL = pathToFileURL(path.join(PROJECT_ROOT, "scripts", "backup-utils.mjs")).href;

const tmpFile = (prefix = "edutrack-backup-test") =>
  path.join(os.tmpdir(), `${prefix}-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;
let outFile;
const createdFiles = [];

beforeEach(() => {
  file = tmpFile();
  outFile = tmpFile("edutrack-backup-out");
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
});

afterEach(() => {
  for (const f of [file, outFile, `${file}.tmp`, `${outFile}.tmp`, ...createdFiles]) {
    try {
      fs.rmSync(f, { force: true });
    } catch {}
  }
  createdFiles.length = 0;
});

async function seededSchool() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return demoStore.getSchoolById(match.id);
}

describe("backup round-trip", () => {
  it("backup → verify → restore survives a simulated restart", async () => {
    const school = await seededSchool();
    await demoStore.createUser({
      schoolId: school.id,
      name: "Backup Kid",
      email: "backup.kid@edutrack.app",
      password: "keepme123",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });
    await demoStore.createLead({
      kind: "newsletter",
      name: "Lead Backup",
      email: "lead-backup@example.com",
    });
    const admin = (await demoStore.listUsers({ schoolId: school.id, role: "SUPER_ADMIN" }))[0];
    await demoStore.createNotification({
      schoolId: school.id,
      kind: "info",
      to: ["backup.kid@edutrack.app"],
      subject: "Hi",
      preview: "p",
      body: "b",
    });
    demoStore.__persistNow();
    assert.ok(fs.existsSync(file), "live snapshot exists before backup");

    const result = backupDemo({ outFile, src: file });
    assert.ok(fs.existsSync(outFile), "backup file was written");
    assert.equal(result.manifest.mode, "demo");
    assert.equal(result.manifest.meta.users, 37, "36 seeded (1 admin + 2 staff + 16 teachers + 16 students + 1 parent) + 1 created");
    assert.equal(result.manifest.meta.students, 17, "16 seeded students + the new one");
    assert.equal(result.manifest.meta.leads, 1);
    assert.equal(result.manifest.meta.notifications, 1);
    assert.ok(result.manifest.piiAtRest.ok, "snapshot is fully encrypted at rest");
    assert.ok(result.manifest.keyFingerprints.dataKey, "manifest records the data key");
    assert.ok(result.manifest.keyFingerprints.jwt, "manifest records the jwt secret");

    // The backup artifact itself must hold ciphertext, never readable PII.
    const raw = fs.readFileSync(outFile, "utf8");
    for (const secret of ["backup.kid@edutrack.app", "lead-backup@example.com"]) {
      assert.ok(!raw.includes(secret), `plaintext ${secret} never touches the backup file`);
    }

    // Read-only verification passes.
    const verified = verifyBackup(outFile);
    assert.equal(verified.ok, true, JSON.stringify(verified.errors));

    // Wipe the live state, then restore over it.
    demoStore.__resetDemoStore();
    restoreDemo({ backupFile: outFile, liveFile: file });
    demoStore.__setDemoStoreFile(file);
    demoStore.__reloadDemoStore();

    const kid = await demoStore.findUserByEmail("backup.kid@edutrack.app");
    assert.ok(kid, "restored user resolves via blind index");
    assert.equal(kid.name, "Backup Kid");
    assert.ok(kid.password !== "keepme123", "password hash restored, not plaintext");

    const leads = await demoStore.listLeads("newsletter");
    assert.ok(leads.some((l) => l.email === "lead-backup@example.com"), "lead restored");
    const inbox = await demoStore.listNotifications(school.id, admin.id);
    assert.ok(inbox.some((n) => n.subject === "Hi"), "notification restored");

    // A further mutation after restore still persists fine (file re-writable).
    await demoStore.createUser({
      schoolId: school.id,
      name: "Post Restore",
      email: "post.restore@edutrack.app",
      password: "post123",
      role: "STUDENT",
    });
    demoStore.__persistNow();
    demoStore.__reloadDemoStore();
    assert.ok(await demoStore.findUserByEmail("post.restore@edutrack.app"), "post-restore writes survive");
  });

  it("tampering with the payload is detected and blocks restore", async () => {
    const school = await seededSchool();
    await demoStore.createUser({
      schoolId: school.id,
      name: "Tamper Target",
      email: "tamper@edutrack.app",
      password: "tamper123",
      role: "STUDENT",
    });
    demoStore.__persistNow();
    backupDemo({ outFile, src: file });

    // Flip one character inside the first encrypted envelope.
    const parsed = JSON.parse(fs.readFileSync(outFile, "utf8"));
    parsed.payload.users[0].email = parsed.payload.users[0].email + "x";
    fs.writeFileSync(outFile, JSON.stringify(parsed));

    const verified = verifyBackup(outFile);
    assert.equal(verified.ok, false);
    assert.ok(verified.errors.some((e) => /checksum/i.test(e)), `expected checksum error, got: ${verified.errors.join("; ")}`);

    assert.throws(
      () => restoreDemo({ backupFile: outFile, liveFile: file }),
      /verification|checksum/i,
      "restore refuses a tampered artifact even before touching keys"
    );
  });

  it("a plaintext-PII snapshot is refused, unless --force is explicit", async () => {
    // Hand-build a legacy-format snapshot with a READABLE email — the exact
    // thing encryption at rest exists to prevent ever shipping.
    const fake = {
      version: 1,
      seq: 999,
      receiptSeq: 999,
      schools: [{ id: "sch_x", name: "Legacy", onboardingComplete: true }],
      users: [
        {
          id: "usr_x",
          name: "Plaintext Person",
          email: "plain@legacy.app",
          emailIdx: "",
          phone: "",
          phoneIdx: "",
          password: "$2a$04$abc",
          role: "STUDENT",
          schoolId: "sch_x",
          assignedClass: "SS1 Science",
          payrollStatus: "PAID",
          feePaid: false,
          parentId: null,
          address: "",
          mfaSecret: "",
          createdAt: new Date().toISOString(),
        },
      ],
      scores: [],
      feeStructures: [],
      feePayments: [],
      attendance: [],
      leads: [],
      notifications: [],
      feeAudit: [],
      roleAudit: [],
      digestPrefs: [],
      digests: [],
    };
    fs.writeFileSync(file, JSON.stringify(fake));

    assert.throws(
      () => backupDemo({ outFile, src: file }),
      /PII-at-rest/i,
      "backup refuses to ship readable PII"
    );

    const forced = backupDemo({ outFile, src: file, force: true });
    assert.equal(forced.manifest.piiAtRest.ok, false, "--force records the violation");

    const verified = verifyBackup(outFile);
    assert.equal(verified.ok, false, "verify flags the plaintext payload");
    assert.ok(verified.errors.some((e) => /plain|not encrypted/i.test(e)));

    assert.throws(
      () => restoreDemo({ backupFile: outFile, liveFile: file }),
      /PII|not encrypted|verification/i,
      "restore refuses plaintext PII"
    );
  });
});

describe("key fingerprints (DATA_ENC_KEY / JWT_SECRET)", () => {
  it("matches when the environment has the same data key", () => {
    // Same-process sanity: current fingerprint matches itself.
    const manifest = { keyFingerprints: { dataKey: dataKeyFingerprint(), jwt: "key:v1:0000000000000000" } };
    const warnings = checkRestoreKeys(manifest, { force: false });
    assert.ok(Array.isArray(warnings), "no throw on a matching key");
    assert.ok(warnings.some((w) => /JWT_SECRET/i.test(w)), "jwt mismatch is only a warning");
  });

  it("restore refuses a mismatched DATA_ENC_KEY; --force bypasses only that gate", async () => {
    // The encryption key is derived at module load, so the mismatch can only
    // be simulated in a child process with a different DATA_ENC_KEY. The
    // child drives restoreDemo — the REAL restore path (verify → key gate →
    // safety copy → write) — not just the key-check helper, so a regression
    // where --force is unreachable would fail here.
    const school = await seededSchool();
    await demoStore.createUser({
      schoolId: school.id,
      name: "Key Gate Kid",
      email: "key.gate@edutrack.app",
      password: "kg123",
      role: "STUDENT",
    });
    demoStore.__persistNow();
    backupDemo({ outFile, src: file });

    const liveForce = tmpFile("edutrack-live-force");
    const liveSame = tmpFile("edutrack-live-same");
    createdFiles.push(liveForce, liveSame);

    const script = [
      `import { pathToFileURL } from "node:url";`,
      `const mod = await import(${JSON.stringify(UTILS_URL)});`,
      `const out = {};`,
      `try { mod.restoreDemo({ backupFile: ${JSON.stringify(outFile)}, liveFile: ${JSON.stringify(liveForce)} }); out.noForce = "accepted"; } catch (e) { out.noForce = /DATA_ENC_KEY/.test(e.message) ? "refused-key" : "refused-other:" + e.message; }`,
      `try { mod.restoreDemo({ backupFile: ${JSON.stringify(outFile)}, liveFile: ${JSON.stringify(liveForce)}, force: true }); out.force = "restored"; } catch (e) { out.force = "refused:" + e.message; }`,
      `try { mod.restoreDemo({ backupFile: ${JSON.stringify(outFile)}, liveFile: ${JSON.stringify(liveSame)} }); out.sameKey = "restored"; } catch (e) { out.sameKey = "refused:" + e.message; }`,
      `console.log(JSON.stringify(out));`,
    ].join("\n");

    const otherKey = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      env: { ...process.env, DATA_ENC_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
    });
    assert.equal(otherKey.status, 0, otherKey.stderr);
    const other = JSON.parse(otherKey.stdout.trim().split("\n").pop());
    assert.equal(other.noForce, "refused-key", "mismatched key blocks the real restore path");
    assert.equal(other.force, "restored", "--force bypasses the key gate (and only it)");
    assert.ok(fs.existsSync(liveForce), "the forced restore still wrote the live file");

    const sameKey = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      env: { ...process.env }, // no DATA_ENC_KEY → dev fallback, same as the parent
    });
    assert.equal(sameKey.status, 0, sameKey.stderr);
    const same = JSON.parse(sameKey.stdout.trim().split("\n").pop());
    assert.equal(same.sameKey, "restored", "same-key restore goes through without --force");

    // The same-key child restored onto liveSame — the parent (dev key) reads
    // it back through the store's normal reload path.
    demoStore.__setDemoStoreFile(liveSame);
    demoStore.__reloadDemoStore();
    const kid = await demoStore.findUserByEmail("key.gate@edutrack.app");
    assert.ok(kid, "restored account resolves via blind index");
    assert.equal(kid.name, "Key Gate Kid");
  });
});

describe("error handling", () => {
  it("missing backup files fail cleanly", async () => {
    const school = await seededSchool();
    await demoStore.createUser({
      schoolId: school.id,
      name: "Lonely",
      email: "lonely@edutrack.app",
      password: "lonely123",
      role: "STUDENT",
    });
    demoStore.__persistNow();

    const missing = tmpFile("edutrack-never-exists");
    const verified = verifyBackup(missing);
    assert.equal(verified.ok, false);
    assert.ok(verified.errors.length > 0);
    assert.throws(() => restoreDemo({ backupFile: missing, liveFile: file }));
    assert.throws(() => backupDemo({ outFile, src: missing }), /Cannot read demo store/);
  });

  it("an unrecognised artifact format is rejected", () => {
    fs.writeFileSync(outFile, JSON.stringify({ schema: "something-else", version: 1, payload: {} }));
    const verified = verifyBackup(outFile);
    assert.equal(verified.ok, false);
    assert.ok(verified.errors.some((e) => /Unrecognised backup format/i.test(e)));
  });
});

describe("mongo-mode plumbing (pure helpers — no mongod needed)", () => {
  it("parses the database out of common URI shapes", () => {
    assert.equal(dbNameFromUri("mongodb://127.0.0.1:27017/edutrack"), "edutrack");
    assert.equal(dbNameFromUri("mongodb+srv://u:p@cluster.example.net/app?retryWrites=true&w=majority"), "app");
    assert.equal(dbNameFromUri("mongodb://localhost"), "");
  });

  it("builds well-formed mongodump / mongorestore argv", () => {
    assert.deepEqual(buildMongoDumpArgs("mongodb://h/db", "/tmp/a.gz"), [
      "--uri", "mongodb://h/db", "--archive", "/tmp/a.gz", "--gzip",
    ]);
    assert.deepEqual(buildMongoRestoreArgs("mongodb://h/db", "/tmp/a.gz"), [
      "--uri", "mongodb://h/db", "--archive", "/tmp/a.gz", "--gzip", "--drop",
    ]);
  });
});

describe("CLI end-to-end (the npm scripts, driven like an operator would)", () => {
  it("backup → restore → verify through the real scripts", async () => {
    const school = await seededSchool();
    await demoStore.createUser({
      schoolId: school.id,
      name: "Cli Kid",
      email: "cli.kid@edutrack.app",
      password: "cli123",
      role: "STUDENT",
    });
    demoStore.__persistNow();

    const env = { ...process.env, DEMO_STORE_FILE: file };
    const run = (script, args) =>
      spawnSync(process.execPath, [script, ...args], { cwd: PROJECT_ROOT, env, encoding: "utf8" });

    const backup = run("scripts/backup.mjs", ["--demo", "--out", outFile]);
    assert.equal(backup.status, 0, backup.stdout + backup.stderr);
    assert.ok(fs.existsSync(outFile));

    // Corrupt the live store, then restore the backup over it.
    fs.writeFileSync(file, "{ not json at all");
    const restore = run("scripts/restore.mjs", [outFile, "--live", file]);
    assert.equal(restore.status, 0, restore.stdout + restore.stderr);
    assert.match(restore.stdout, /pre-restore/, "a safety copy of the old state was kept");

    const verify = run("scripts/verify-backup.mjs", [outFile]);
    assert.equal(verify.status, 0, verify.stdout + verify.stderr);

    demoStore.__setDemoStoreFile(file);
    demoStore.__reloadDemoStore();
    const kid = await demoStore.findUserByEmail("cli.kid@edutrack.app");
    assert.ok(kid, "the CLI round-trip preserved the account");
    assert.equal(kid.name, "Cli Kid");
  });
});
