/**
 * Reset the demo store to its pristine seeded state.
 *
 * Wipes every test-run artifact from the persisted demo store — extra
 * "Zara Okafor <stamp>" students created by the E2E flows spec, test fee
 * payments/scores, second-tenant registrations — so the next server boot
 * seeds the demo school exactly as a first boot would.
 *
 * How it works: the demo store persists to .demo-data/store.json and seeds
 * itself at boot when SEED_DEMO_SCHOOL=1 AND no store file exists. So a
 * reset = back up the old file + remove it; boot then rebuilds pristine.
 * (Resetting via __resetDemoStore alone deletes the file too but leaves the
 * process holding a non-dirty in-memory state — same outcome, verified here
 * against the real seed for a sanity count.)
 *
 * Usage:
 *   npm run reset-demo
 *
 * Safety rails:
 *   - Refuses to run while a server is listening on :3000 (its in-memory
 *     state would resurrect the junk on the next debounced persist).
 *   - Refuses to run when MONGODB_URI is set: this only resets the demo
 *     store, never a real database.
 *   - Verifies SEED_DEMO_SCHOOL=1 is configured — without it the next boot
 *     would come up with NO school at all (clean-slate production default).
 *   - Moves the old store to store.json.bak, so the wipe is reversible.
 */

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- Guard 1: MONGODB_URI means "real database", out of scope -------------
if (process.env.MONGODB_URI) {
  console.error(
    "✗ MONGODB_URI is set — this script only resets the DEMO store, never a real database."
  );
  console.error("  Unset it (or use scripts/backup.mjs + a Mongo drop) instead.");
  process.exit(1);
}

// --- Guard 2: refuse while the server is running ---------------------------
function probePort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1", timeout: 500 });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

if (await probePort(3000)) {
  console.error(
    "✗ A server is listening on port 3000 — stop it first (its in-memory\n" +
      "  store state would resurrect the wiped data on the next persist)."
  );
  console.error("  PowerShell: Stop-Process -Id <pid> -Force   (pid via Get-NetTCPConnection)");
  process.exit(1);
}

// --- Guard 3: the next boot MUST be able to reseed --------------------------
const envLocal = path.join(root, ".env.local");
const envText = fs.existsSync(envLocal) ? fs.readFileSync(envLocal, "utf8") : "";
const seedOn = /^\s*SEED_DEMO_SCHOOL\s*=\s*(1|true|yes)\s*$/m.test(envText);
if (!seedOn) {
  console.error(
    "✗ SEED_DEMO_SCHOOL=1 not found in .env.local — the next boot would start\n" +
      "  with NO demo school (that flag is deliberately off by default)."
  );
  console.error("  Add 'SEED_DEMO_SCHOOL=1' to .env.local and re-run this script.");
  process.exit(1);
}

const storeFile =
  process.env.DEMO_STORE_FILE || path.join(root, ".demo-data", "store.json");

// --- Back up, then remove the persisted state ------------------------------
if (fs.existsSync(storeFile)) {
  const bak = `${storeFile}.bak`;
  fs.copyFileSync(storeFile, bak);
  fs.rmSync(storeFile, { force: true });
  fs.rmSync(`${storeFile}.tmp`, { force: true });
  console.log(`• previous store backed up to ${path.relative(root, bak)}`);
} else {
  console.log("• no persisted store found — nothing to back up");
}

// --- Sanity: prove the seed builds the pristine dataset ---------------------
process.env.SEED_DEMO_SCHOOL = "1";
process.env.DEMO_STORE_FILE = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "edutrack-reset-")),
  "verify.json"
);

const { __resetDemoStore, searchSchools, listUsers } = await import(
  "../src/lib/demo-store.js"
);
__resetDemoStore(); // in-memory only: file is a throwaway temp path

const schools = await searchSchools("");
const users = await listUsers({ schoolId: schools[0]?.id });
console.log(
  `✓ seed verified: ${schools.length} school(s) — ${schools.map((s) => s.name).join(", ")} — ${users.length} users`
);

const junk = users.filter(
  (u) => /Zara Okafor \w+/.test(u.name) || /Isolation Academy/.test(u.name)
);
if (junk.length) {
  console.error(`✗ UNEXPECTED: ${junk.length} test artifacts in the fresh seed`);
  junk.forEach((u) => console.error("   -", u.name));
  process.exit(1);
}

console.log("\nDone. Start the dev server and it boots with pristine demo data:");
console.log("  npm run dev");
process.exit(0);
