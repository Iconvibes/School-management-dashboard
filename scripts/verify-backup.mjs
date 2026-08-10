/**
 * Edutrack backup verification CLI — READ-ONLY.
 *
 * Checks a backup artifact (single-file demo backup or mongo backup
 * directory) without touching anything:
 *   - manifest format (schema/version)
 *   - payload checksum (tamper / truncation / bit-rot detection)
 *   - PII-at-rest (no plaintext emails/phones in a demo payload)
 *   - key fingerprints (DATA_ENC_KEY fatal; JWT_SECRET warning)
 *   - record counts
 *
 * Usage:
 *   node scripts/verify-backup.mjs backups/edutrack-backup-20260808.json
 *   node scripts/verify-backup.mjs backups/edutrack-backup-20260808/
 *
 * Exits 0 when the artifact is restorable, 1 otherwise. Intended to be run
 * from cron right after every backup (and periodically on stored backups).
 */
import { verifyBackup } from "./backup-utils.mjs";

function usage() {
  console.error(`Usage: node scripts/verify-backup.mjs <backup-file-or-directory>`);
}

const target = process.argv[2];
if (!target) {
  usage();
  process.exit(1);
}

const { ok, errors, keyErrors, warnings, loaded } = verifyBackup(target);
const manifest = loaded?.manifest;

console.log(`Verifying backup: ${target}`);
if (manifest) {
  console.log(`  format:      ${manifest.mode} backup (created ${manifest.createdAt})${manifest.label ? ` — ${manifest.label}` : ""}`);
  console.log(`  checksum:    ${manifest.checksum}`);
  console.log(`  records:     ${JSON.stringify(manifest.meta)}`);
  console.log(`  keys:        dataKey=${manifest.keyFingerprints?.dataKey} jwt=${manifest.keyFingerprints?.jwt}`);
  if (manifest.mode === "demo") {
    console.log(`  PII at rest: ${manifest.piiAtRest?.ok ? "clean (all PII encrypted)" : "NOT CLEAN"}`);
  }
}
warnings.forEach((w) => console.log(`  WARN  ${w}`));
errors.forEach((e) => console.log(`  FAIL  ${e}`));
keyErrors.forEach((e) => console.log(`  FAIL  ${e}`));

if (!ok) {
  console.log("\nRESULT: NOT RESTORABLE");
  process.exit(1);
}
console.log("\nRESULT: OK — backup is restorable");
