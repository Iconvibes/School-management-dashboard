/**
 * Edutrack restore CLI.
 *
 * Demo mode:
 *   node scripts/restore.mjs backups/edutrack-backup-20260808.json [--live .demo-data/store.json]
 * Mongo mode:
 *   node scripts/restore.mjs backups/edutrack-backup-20260808/ [--uri mongodb://...]
 *
 * Safety first:
 *   1. The artifact is fully verified (format, checksum, PII-at-rest) —
 *      verification failures ALWAYS abort, even with --force.
 *   2. The DATA_ENC_KEY fingerprint must match the backup's, or the restored
 *      emails/phones would be undecryptable garbage. --force bypasses ONLY
 *      this gate (never integrity errors).
 *   3. A .pre-restore-<timestamp> safety copy of the current state is kept.
 *
 * After a demo restore: STOP the app first (its in-memory state would
 * otherwise overwrite the restored snapshot on the next write), restore, then
 * restart. Full playbook: docs/disaster-recovery.md.
 */
import fs from "node:fs";
import { restoreDemo, restoreMongo } from "./backup-utils.mjs";

function usage() {
  console.error(`Usage: node scripts/restore.mjs <backup-file-or-directory> [--live <file>|--uri <uri>] [--force]`);
}

function parseArgs(argv) {
  const first = argv[2];
  if (first === "--help" || first === "-h") return { help: true };
  const args = { target: first };
  if (!args.target) return null; // missing required positional
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--live") args.live = argv[++i];
    else if (a === "--uri") args.uri = argv[++i];
    else if (a === "--help" || a === "-h") return { help: true };
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

try {
  const args = parseArgs(process.argv);
  if (args?.help) {
    usage();
    process.exit(0);
  }
  if (!args) {
    usage();
    process.exit(1);
  }
  const isDir = fs.statSync(args.target).isDirectory();

  if (isDir) {
    const result = restoreMongo({
      backupDir: args.target,
      uri: args.uri || process.env.MONGODB_URI,
      force: args.force,
    });
    console.log(`Mongo restore complete: ${result.uri}`);
    console.log("The database now matches the backup. Verify with node scripts/verify-backup.mjs and a smoke test.");
  } else {
    const result = restoreDemo({
      backupFile: args.target,
      liveFile: args.live,
      force: args.force,
    });
    console.log(`Demo restore complete: ${result.liveFile}`);
    console.log(`  users: ${result.manifest.meta.users} (${result.manifest.meta.students} students)`);
    console.log("NEXT: restart the app (it loads the snapshot at boot). Its in-memory state would otherwise overwrite the restore.");
  }
} catch (e) {
  console.error(`restore failed: ${e.message}`);
  process.exit(1);
}
