/**
 * Shared core for the backup / disaster-recovery tooling — the engines behind
 * scripts/backup.mjs, scripts/restore.mjs and scripts/verify-backup.mjs.
 *
 * Backups are SELF-VERIFYING artifacts:
 *
 *   DEMO mode (no MONGODB_URI) — a single JSON file:
 *     { schema: "edutrack-backup", version: 1, mode: "demo", createdAt, label,
 *       checksum, meta, keyFingerprints, piiAtRest, payload }
 *   MONGO mode — a directory:
 *     <dir>/manifest.json      (same manifest, mode: "mongo",
 *                               archive: "store.archive.gz")
 *     <dir>/store.archive.gz   (mongodump --archive --gzip output)
 *
 * Integrity chain: `checksum` is SHA-256 over the exact payload bytes (demo)
 * or the archive file (mongo), so tampering, truncation or bit-rot is caught
 * BEFORE a restore. `keyFingerprints` records which DATA_ENC_KEY / JWT_SECRET
 * produced the backup so a restore can refuse (or warn) when the current
 * environment cannot make sense of the data:
 *
 *   - DATA_ENC_KEY mismatch is FATAL: the payload's enc:v1 envelopes would
 *     decrypt to garbage, i.e. silent data loss. Refused unless --force.
 *   - JWT_SECRET mismatch is a WARNING: data survives, sessions just stop
 *     verifying (users re-login; restore the escrowed secret to avoid even
 *     that).
 *
 * `piiAtRest` records whether every PII field in the payload is an `enc:v1:`
 * envelope — backing up a legacy plaintext snapshot is refused, because a
 * backup that ships readable emails defeats encryption at rest. The demo
 * store re-encrypts legacy snapshots on its next save, so the fix is simply
 * to boot the server once and back up again (or --force).
 *
 * The module is pure Node (no Next, no path aliases) so the scripts run
 * standalone under plain `node` and are unit-testable under `node --test`
 * via relative imports.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dataKeyFingerprint, isEncrypted } from "../src/lib/field-crypto.js";

const SCHEMA = "edutrack-backup";
const VERSION = 1;

// Keep in sync with src/lib/token.js — the fallback used when JWT_SECRET is
// unset (dev/demo). Fingerprints let a restore detect that the current
// process signs sessions with a different secret than the backup era.
const JWT_SECRET_FALLBACK = "edutrack-dev-secret-change-in-prod";

// ---------------------------------------------------------------------------
// Fingerprints & hashing

/** Fingerprint a secret's raw material: preimage-safe identity, KMS-style. */
export function fingerprintSecret(raw) {
  return "key:v1:" + createHash("sha256").update(String(raw)).digest("hex").slice(0, 16);
}

/** Which DATA_ENC_KEY (derived master) the CURRENT process would decrypt with. */
export function dataKeyNow() {
  return dataKeyFingerprint();
}

/** Which JWT_SECRET the CURRENT process signs sessions with. */
export function jwtSecretNow() {
  return fingerprintSecret(process.env.JWT_SECRET || JWT_SECRET_FALLBACK);
}

/** Both fingerprints, for manifest recording / restore pre-checks. */
export function keyFingerprints() {
  return { dataKey: dataKeyNow(), jwt: jwtSecretNow() };
}

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/** Atomic write (temp + rename) — a crash mid-write never leaves a torn file. */
export function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------
// Payload analysis (demo snapshots)

/** Where the demo store's live snapshot lives (parity with src/lib/demo-store.js). */
export function demoStoreFile() {
  return process.env.DEMO_STORE_FILE || path.join(process.cwd(), ".demo-data", "store.json");
}

/**
 * Scan a demo snapshot payload for PII-at-rest violations.
 *  - leaks:     PII fields that are plaintext (not enc:v1: envelopes)
 *  - integrity: blind indexes missing or not idx:v1: (lookups would fail)
 * A payload that is fully encrypted passes. Legacy plaintext snapshots fail.
 */
export function piiAtRestReport(payload) {
  const leaks = [];
  const integrity = [];
  const checkEnc = (label, value) => {
    if (typeof value === "string" && value !== "" && !isEncrypted(value)) {
      leaks.push(`${label} is not encrypted at rest`);
    }
  };
  const checkIdx = (label, value) => {
    if (typeof value === "string" && value !== "" && !value.startsWith("idx:v1:")) {
      integrity.push(`${label} blind index missing or malformed`);
    }
  };
  (payload?.users || []).forEach((u) => {
    checkEnc(`user ${u.id} email`, u.email);
    checkEnc(`user ${u.id} phone`, u.phone);
    checkIdx(`user ${u.id} emailIdx`, u.emailIdx);
    checkIdx(`user ${u.id} phoneIdx`, u.phoneIdx);
  });
  (payload?.leads || []).forEach((l) => {
    checkEnc(`lead ${l.id} email`, l.email);
    checkEnc(`lead ${l.id} phone`, l.phone);
    checkIdx(`lead ${l.id} emailIdx`, l.emailIdx);
  });
  (payload?.notifications || []).forEach((n) => {
    (n.to || []).forEach((t, i) => checkEnc(`notification ${n.id} to[${i}]`, t));
  });
  return { ok: leaks.length === 0 && integrity.length === 0, leaks, integrity };
}

/** Coarse record counts for the manifest's `meta`. */
export function metaOf(payload) {
  const users = payload?.users || [];
  const count = (role) => users.filter((u) => u.role === role).length;
  return {
    schools: (payload?.schools || []).length,
    users: users.length,
    students: count("STUDENT"),
    teachers: count("TEACHER"),
    staff: count("SUPER_ADMIN") + count("BURSAR") + count("REGISTRAR"),
    parents: count("PARENT"),
    scores: (payload?.scores || []).length,
    feePayments: (payload?.feePayments || []).length,
    attendance: (payload?.attendance || []).length,
    leads: (payload?.leads || []).length,
    notifications: (payload?.notifications || []).length,
    feeAudit: (payload?.feeAudit || []).length,
    roleAudit: (payload?.roleAudit || []).length,
  };
}

// ---------------------------------------------------------------------------
// Manifest

export function createManifest({ mode, checksum, meta, keyFp, pii, label, archive }) {
  const manifest = {
    schema: SCHEMA,
    version: VERSION,
    mode,
    createdAt: new Date().toISOString(),
    label: label || "",
    checksum,
    meta,
    keyFingerprints: keyFp,
    piiAtRest: { ok: pii.ok, leaks: pii.leaks, integrity: pii.integrity },
  };
  if (archive) manifest.archive = archive;
  return manifest;
}

// ---------------------------------------------------------------------------
// Loading & verification (shared by verify-backup and restore)

/**
 * Load a backup artifact (single-file demo backup OR mongo backup directory)
 * and return { kind, path, manifest, payload?, archivePath? }. Throws on
 * missing files or a malformed/unrecognised manifest.
 */
export function loadBackup(backupPath) {
  const stat = fs.statSync(backupPath); // throws when missing
  if (stat.isDirectory()) {
    const manifestFile = path.join(backupPath, "manifest.json");
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    } catch (e) {
      throw new Error(`Cannot read manifest ${manifestFile}: ${e.message}`);
    }
    if (manifest.schema !== SCHEMA || manifest.version !== VERSION) {
      throw new Error(`Unrecognised backup format in ${manifestFile} (schema=${manifest.schema}, version=${manifest.version})`);
    }
    const archivePath = path.join(backupPath, manifest.archive || "store.archive.gz");
    return { kind: "mongo", path: backupPath, manifest, archivePath };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  } catch (e) {
    throw new Error(`Cannot read backup file ${backupPath}: ${e.message}`);
  }
  if (parsed.schema !== SCHEMA || parsed.version !== VERSION) {
    throw new Error(`Unrecognised backup format in ${backupPath} (schema=${parsed.schema}, version=${parsed.version})`);
  }
  const { payload, ...manifest } = parsed;
  return { kind: "demo", path: backupPath, manifest, payload };
}

/**
 * Full artifact verification — the exact checks restore runs before touching
 * anything, exposed so verify-backup.mjs can run them read-only. Returns
 * { ok, errors, keyErrors, warnings, loaded }.
 *
 *   errors     — integrity failures (format, checksum, PII-at-rest): NEVER
 *                bypassable; a restore aborts on these, even with --force.
 *   keyErrors  — DATA_ENC_KEY mismatch: this environment cannot decrypt the
 *                artifact's ciphertext. Fatal for verify; restore --force
 *                bypasses ONLY these (never integrity errors).
 *   warnings   — JWT_SECRET mismatch: data survives, sessions just drop.
 */
export function verifyBackup(backupPath) {
  const errors = [];
  const keyErrors = [];
  const warnings = [];
  let loaded;
  try {
    loaded = loadBackup(backupPath);
  } catch (e) {
    return { ok: false, errors: [e.message], keyErrors, warnings, loaded: null };
  }
  const { kind, manifest } = loaded;

  // 1. Checksum — has the artifact been corrupted / truncated / bit-rotted?
  //    (Catches accidental damage and tampering WITHOUT manifest recomputation
  //    — a malicious rewrite of the whole artifact can always recompute its
  //    own checksum, which is inherent to single-file self-verifying backups;
  //    the threat model here is corruption, not an attacker with write access.)
  if (kind === "demo") {
    const actual = sha256(JSON.stringify(loaded.payload));
    if (actual !== manifest.checksum) {
      errors.push("Checksum mismatch — the backup payload does not match its manifest (tampered or corrupted)");
    }
  } else {
    try {
      const bytes = fs.readFileSync(loaded.archivePath);
      const actual = sha256(bytes);
      if (actual !== manifest.checksum) {
        errors.push("Checksum mismatch — the mongo archive does not match its manifest (tampered or corrupted)");
      }
    } catch (e) {
      errors.push(`Archive file missing or unreadable: ${loaded.archivePath}`);
    }
  }

  // 2. PII at rest (demo payloads) — no readable emails/phones may ship.
  if (kind === "demo") {
    const pii = piiAtRestReport(loaded.payload);
    if (!pii.ok) {
      [...pii.leaks, ...pii.integrity].forEach((issue) => errors.push(issue));
    }
  }

  // 3. Key fingerprints — can THIS environment restore the data meaningfully?
  const now = keyFingerprints();
  if (manifest.keyFingerprints?.dataKey && manifest.keyFingerprints.dataKey !== now.dataKey) {
    keyErrors.push(
      "DATA_ENC_KEY mismatch — this backup's ciphertext was written with a different key and would decrypt to garbage here. Set DATA_ENC_KEY to the escrowed value (docs/disaster-recovery.md) and re-run."
    );
  }
  if (manifest.keyFingerprints?.jwt && manifest.keyFingerprints.jwt !== now.jwt) {
    warnings.push(
      "JWT_SECRET differs from the backup era — sessions issued before the restore will not verify (users simply log in again). If the secret was lost, restore it from escrow."
    );
  }

  return {
    ok: errors.length === 0 && keyErrors.length === 0,
    errors,
    keyErrors,
    warnings,
    loaded,
  };
}

/**
 * Restore-time key gate (separate from verify so --force can bypass ONLY the
 * DATA_ENC_KEY mismatch, never integrity errors). Throws when the dataKey
 * differs and force is off; returns warnings otherwise.
 */
export function checkRestoreKeys(manifest, { force = false } = {}) {
  const now = keyFingerprints();
  const expected = manifest.keyFingerprints || {};
  const warnings = [];
  if (expected.dataKey && expected.dataKey !== now.dataKey) {
    if (force) {
      warnings.push(
        "DATA_ENC_KEY mismatch overridden with --force — restored emails/phones will be undecryptable. You almost certainly want the escrowed key instead."
      );
    } else {
      throw new Error(
        "DATA_ENC_KEY mismatch: this backup's ciphertext was encrypted with a different key. Set DATA_ENC_KEY to the escrowed value (docs/disaster-recovery.md) and retry, or pass --force to restore anyway (emails/phones will be garbage)."
      );
    }
  }
  if (expected.jwt && expected.jwt !== now.jwt) {
    warnings.push(
      "JWT_SECRET differs from the backup era — sessions issued before the restore will not verify (users re-login). Restore the escrowed secret to avoid even that."
    );
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Demo-mode operations

/** Copy the demo snapshot into a self-verifying single-file backup. */
export function backupDemo({ outFile, src, label = "", force = false }) {
  const srcFile = src || demoStoreFile();
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(srcFile, "utf8"));
  } catch (e) {
    throw new Error(`Cannot read demo store ${srcFile}: ${e.message} (start the app once so it can write its snapshot)`);
  }
  const pii = piiAtRestReport(payload);
  if (!pii.ok && !force) {
    const issues = [...pii.leaks, ...pii.integrity];
    throw new Error(
      `PII-at-rest check failed — the snapshot contains readable PII (${issues.join("; ")}). Boot the app once so it re-encrypts, then back up again; or pass --force to back up anyway (NOT recommended).`
    );
  }
  const checksum = sha256(JSON.stringify(payload));
  const manifest = createManifest({
    mode: "demo",
    checksum,
    meta: metaOf(payload),
    keyFp: keyFingerprints(),
    pii,
    label,
  });
  writeAtomic(outFile, JSON.stringify({ ...manifest, payload }));
  return { outFile, manifest };
}

/**
 * Restore a single-file demo backup onto the live store snapshot. Verifies
 * integrity + PII-at-rest first, gates on DATA_ENC_KEY (unless force), keeps
 * a `.pre-restore-<ts>` safety copy of the current live file, then writes the
 * payload. The running app must be restarted afterwards (it loads the
 * snapshot at boot) — see docs/disaster-recovery.md.
 */
export function restoreDemo({ backupFile, liveFile, force = false }) {
  const verified = verifyBackup(backupFile);
  // Integrity failures (format/checksum/PII) always abort — even with --force.
  // Only the DATA_ENC_KEY mismatch is bypassable, via checkRestoreKeys below.
  if (verified.errors.length > 0) {
    throw new Error(`Backup failed verification — refusing to restore:\n  - ${verified.errors.join("\n  - ")}`);
  }
  checkRestoreKeys(verified.loaded.manifest, { force });

  const target = liveFile || demoStoreFile();
  if (fs.existsSync(target)) {
    const safety = `${target}.pre-restore-${Date.now()}`;
    fs.copyFileSync(target, safety);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // NOTE: the safety copy keeps the EXACT previous bytes — if the live file
    // was a legacy plaintext snapshot, the copy holds plaintext. Treat it as
    // sensitive and delete it once the restore is verified.
    console.log(`Safety copy of current state: ${safety}`);
  }
  writeAtomic(target, JSON.stringify(verified.loaded.payload));
  return { liveFile: target, manifest: verified.loaded.manifest };
}

// ---------------------------------------------------------------------------
// Mongo-mode operations
//
// Requires the MongoDB Database Tools (mongodump / mongorestore) on PATH, at
// a version matching the server (per MongoDB's own compatibility guidance).
// The archive is created with --gzip, so it needs mongodump >= 4.2.

/** Parse the database name out of a mongodb:// URI ("" when absent). */
export function dbNameFromUri(uri) {
  const m = /^mongodb(\+srv)?:\/\/[^/]*\/([^?]*)/.exec(uri || "");
  return m?.[2] || "";
}

/** mongodump argv for a URI → gzip archive at `archive`. */
export function buildMongoDumpArgs(uri, archive) {
  return ["--uri", uri, "--archive", archive, "--gzip"];
}

/** mongorestore argv for a gzip archive → URI (--drop replaces collections). */
export function buildMongoRestoreArgs(uri, archive) {
  return ["--uri", uri, "--archive", archive, "--gzip", "--drop"];
}

/** True when the mongodb tools are installed and callable. */
export function mongoToolsAvailable(tool = "mongodump") {
  try {
    const res = spawnSync(tool, ["--version"], { stdio: "ignore", timeout: 15000 });
    return res.status === 0;
  } catch {
    return false;
  }
}

/** Run mongodump into a self-verifying backup directory. */
export function backupMongo({ dir, uri, label = "", force = false }) {
  if (!uri) throw new Error("MONGODB_URI is not set (or pass --uri)");
  if (!mongoToolsAvailable("mongodump")) {
    throw new Error("mongodump not found on PATH — install the MongoDB Database Tools (https://www.mongodb.com/docs/database-tools/)");
  }
  const archive = path.join(dir, "store.archive.gz");
  fs.mkdirSync(dir, { recursive: true });
  const res = spawnSync("mongodump", buildMongoDumpArgs(uri, archive), {
    stdio: "inherit",
    timeout: 30 * 60 * 1000,
  });
  if (res.status !== 0) {
    throw new Error(`mongodump failed (exit ${res.status}) — archive not created`);
  }
  const checksum = sha256(fs.readFileSync(archive));
  const pii = { ok: true, leaks: [], integrity: [] };
  const manifest = createManifest({
    mode: "mongo",
    checksum,
    meta: { database: dbNameFromUri(uri) || "unknown" },
    keyFp: keyFingerprints(),
    pii,
    label,
    archive: "store.archive.gz",
  });
  writeAtomic(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return { dir, manifest };
}

/** Restore a mongo backup directory onto a live MongoDB (--drop replaces). */
export function restoreMongo({ backupDir, uri, force = false }) {
  const verified = verifyBackup(backupDir);
  // Same gate split as restoreDemo: integrity errors abort unconditionally;
  // the DATA_ENC_KEY mismatch is bypassable only via checkRestoreKeys + force.
  if (verified.errors.length > 0) {
    throw new Error(`Backup failed verification — refusing to restore:\n  - ${verified.errors.join("\n  - ")}`);
  }
  checkRestoreKeys(verified.loaded.manifest, { force });
  if (!uri) throw new Error("MONGODB_URI is not set (or pass --uri)");
  if (!mongoToolsAvailable("mongorestore")) {
    throw new Error("mongorestore not found on PATH — install the MongoDB Database Tools (https://www.mongodb.com/docs/database-tools/)");
  }
  const res = spawnSync("mongorestore", buildMongoRestoreArgs(uri, verified.loaded.archivePath), {
    stdio: "inherit",
    timeout: 60 * 60 * 1000,
  });
  if (res.status !== 0) {
    throw new Error(`mongorestore failed (exit ${res.status}) — the database may be partially restored; re-run after fixing the cause`);
  }
  return { uri, manifest: verified.loaded.manifest };
}
