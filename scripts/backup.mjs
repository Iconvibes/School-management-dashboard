/**
 * Edutrack backup CLI.
 *
 * Demo mode (default when MONGODB_URI is unset):
 *   node scripts/backup.mjs --demo --out backups/edutrack-backup-20260808.json
 * Mongo mode:
 *   node scripts/backup.mjs --mongo --dir backups/edutrack-backup-20260808 --uri mongodb://...
 *
 * Flags:
 *   --demo | --mongo   force a mode (default: mongo when MONGODB_URI is set)
 *   --out <file>       demo-mode destination (default: backups/edutrack-backup-<ts>.json)
 *   --dir <dir>        mongo-mode destination directory (default: backups/<ts>)
 *   --label <text>     human-readable note stored in the manifest
 *   --force            back up anyway when the PII-at-rest check fails
 *   --uri <uri>        override MONGODB_URI (mongo mode)
 *
 * See docs/disaster-recovery.md for cadence, retention and off-site copies.
 */
import path from "node:path";
import {
  backupDemo,
  backupMongo,
  demoStoreFile,
} from "./backup-utils.mjs";

const ts = () =>
  new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);

function usage() {
  console.error(`Usage:
  node scripts/backup.mjs [--demo|--mongo] [--out <file>|--dir <dir>] [--label <text>] [--force] [--uri <uri>]

Demo mode (no MONGODB_URI): writes a single self-verifying JSON backup.
Mongo mode:                 runs mongodump --archive --gzip plus a manifest.
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--demo") args.demo = true;
    else if (a === "--mongo") args.mongo = true;
    else if (a === "--force") args.force = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--dir") args.dir = argv[++i];
    else if (a === "--label") args.label = argv[++i];
    else if (a === "--uri") args.uri = argv[++i];
    else if (a === "--help" || a === "-h") return null;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

try {
  const args = parseArgs(process.argv);
  if (!args) {
    usage();
    process.exit(0);
  }
  const mongoMode = args.mongo || (!args.demo && !!process.env.MONGODB_URI);

  if (mongoMode) {
    const dir = args.dir || path.join("backups", ts());
    const result = backupMongo({
      dir,
      uri: args.uri || process.env.MONGODB_URI,
      label: args.label,
      force: args.force,
    });
    console.log(`Mongo backup written: ${result.dir}`);
    console.log(`  manifest:  ${path.join(result.dir, "manifest.json")}`);
    console.log(`  database:  ${result.manifest.meta.database}`);
  } else {
    const out = args.out || path.join("backups", `edutrack-backup-${ts()}.json`);
    const result = backupDemo({
      outFile: out,
      src: demoStoreFile(),
      label: args.label,
      force: args.force,
    });
    console.log(`Demo backup written: ${result.outFile}`);
    console.log(`  users: ${result.manifest.meta.users} (${result.manifest.meta.students} students, ${result.manifest.meta.teachers} teachers)`);
    console.log(`  checksum: ${result.manifest.checksum}`);
    console.log(`  PII at rest: ${result.manifest.piiAtRest.ok ? "clean" : "NOT CLEAN (--force was used)"}`);
    console.log(`\nVerify it with: node scripts/verify-backup.mjs ${result.outFile}`);
  }
} catch (e) {
  console.error(`backup failed: ${e.message}`);
  process.exit(1);
}
