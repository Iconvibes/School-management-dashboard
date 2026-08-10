# 💾 Backup & Disaster Recovery Runbook

*Last reviewed: with the encryption-at-rest phase. Applies to the `backup` /
`restore` / `verify-backup` npm scripts and the self-verifying artifacts they
produce.*

This runbook exists for one reason: **a backup you cannot restore is not a
backup.** Every artifact the tooling writes carries an integrity chain
(checksum), a PII-at-rest check and the fingerprints of the keys that produced
it, so a restore *refuses* — loudly, before touching anything — when the
artifact is corrupt, ships readable PII, or was encrypted with a key you no
longer have.

---

## 1. What is backed up

| Mode | Trigger | Artifact |
| ---- | ------- | -------- |
| **Demo** (no `MONGODB_URI`) | `npm run backup` | Single JSON file — the full store snapshot (schools, users, scores, fees, attendance, leads, notifications, audit trails) with **PII encrypted at rest** (`enc:v1:` envelopes + `idx:v1:` blind indexes) |
| **Mongo** (`MONGODB_URI` set) | `npm run backup` | A directory — `store.archive.gz` (`mongodump --archive --gzip`, byte-identical to what `verify` checks) plus `manifest.json` |

Both artifacts embed a **manifest**: format schema/version, creation time,
record counts, the SHA-256 checksum of the payload/archive, a
**PII-at-rest verdict**, and the **fingerprints** of the `DATA_ENC_KEY` and
`JWT_SECRET` that produced them.

The two encrypted-store surfaces are identical in shape: the demo snapshot
holds ciphertext exactly like Mongo documents (`tests/encryption.test.js`
proves it), so one DR story covers both.

---

## 2. Backup cadence & retention

**Demo mode** (a demo/self-hosted instance):

```bash
# daily, 02:10 server time
10 2 * * * cd /path/to/edutrack && npm run backup -- --label daily >> /var/log/edutrack-backup.log 2>&1 && npm run verify-backup -- backups/$(ls -t backups | head -1) >> /var/log/edutrack-backup.log 2>&1
```

**Mongo mode** (production):

```bash
# daily, 02:10; keep 14 daily + 8 weekly + 6 monthly (see retention below)
10 2 * * * cd /path/to/edutrack && npm run backup -- --mongo --label daily >> /var/log/edutrack-backup.log 2>&1 && npm run verify-backup -- backups/$(ls -t backups | head -1) >> /var/log/edutrack-backup.log 2>&1
```

Rules that matter:

- **Verify after every backup.** The `verify-backup` step above runs *right
  after* the backup for a reason — a backup that fails verification is useless
  and should page you, not silently pile up.
- **Off-site copies.** Cron writing to the same disk that dies is not DR.
  Ship each verified artifact to object storage (S3/R2/GCS) or another
  machine nightly — `rclone copy backups/ remote:edutrack-backups/` is a
  solid baseline. Encryption-at-rest means shipping the artifact off-box is
  safe by design: the payload itself contains no readable PII.
- **Retention.** Keep enough to recover from anything: daily × 14, weekly × 8
  (2 months), monthly × 6 (6 months). The recovery-point you can actually
  meet is the *oldest* artifact you kept — schedule retention accordingly.
- **Monthly restore drill.** Pick a recent backup, restore it into a scratch
  environment (staging DB / temp `DEMO_STORE_FILE`), boot the app, log in.
  This is the single best investment in DR you can make — it exercises the
  tools, the keys, and the operator's muscle memory. The restores the test
  suite performs (`tests/backup.test.js`) cover the mechanics; the drill
  covers *your* environment.
- **`.gitignore`d.** `backups/` is ignored — backups must never end up in git.

---

## 3. Key escrow (read this before you ever need it)

Two secrets decide whether a restored backup is usable. Losing either makes a
recovery story much worse — the first makes it *impossible*.

### `DATA_ENC_KEY` — the encryption master key ⚠️ critical

Every email and phone in the database/snapshot is an AES-256-GCM `enc:v1:`
envelope keyed from this value. The manifest records a **non-secret
fingerprint** of the key, and `restore` refuses when the current
`DATA_ENC_KEY` doesn't match the backup's — because restoring with the wrong
key produces *working-looking* data whose emails are garbage (silent data
loss, worse than an error).

- Generate: `openssl rand -hex 32` → a 64-char hex string.
- **Escrow it NOW, before you need it:** password manager (shared vault with
  ≥2 owners), an HSM/KMS secret store, or a sealed envelope in a safe — pick
  at least two independent locations. If you only have one copy and it dies
  with the server, the data is gone.
- Never commit it, never log it, never paste it into chat.
- **Verify your escrow works:** the restore-time fingerprint check is exactly
  this test. Once a month, run
  `node scripts/verify-backup.mjs backups/<latest>` with the *escrowed* value
  in `.env.local` — a clean "RESULT: OK" proves the escrowed copy is the right
  key.
- Note: the hex and base64 spellings of the *same* 32 bytes fingerprint
  identically, so re-formatting the escrowed value can't silently break restores.

### `JWT_SECRET` — session signing secret ⚠️ important

Sessions are JWTs signed with this. A restore
doesn't need it to recover data, but the *users* need it: if the restored
environment signs with a different secret, every existing session stops
verifying and everyone is logged out (an operational incident, not data loss).

- Escrow the exact value verbatim — whitespace counts.
- On restore, the manifest's JWT fingerprint mismatch is reported as a
  **warning** (never a blocker): data is intact, users just re-login.

### If a key is lost

- `DATA_ENC_KEY` lost: there is no `--force` path that saves the PII — `--force`
  restores ciphertext you cannot decrypt. Fall back to the most recent backup
  whose fingerprint matches an escrowed key; if none, you are looking at
  re-collecting contact data. This is the scenario the escrow discipline
  above exists to prevent.
- `JWT_SECRET` lost: generate a fresh one (`openssl rand -base64 32`). All
  sessions drop; users re-login. Escrow the new value immediately.

---

## 4. Restore playbook

### Before any restore (both modes)

1. **Know which artifact**: the newest backup that passed `verify-backup` and
   whose `DATA_ENC_KEY` fingerprint matches your escrowed key.
2. **Confirm the environment matches the artifact's era** — same
   `DATA_ENC_KEY` (mandatory), same `JWT_SECRET` (strongly recommended).
3. **Read the manifest first**: `node scripts/verify-backup.mjs <backup>` —
   it prints the record counts and the fingerprints. It is read-only; run it
   as many times as you like.

### Demo mode (no database)

```bash
# 1. STOP the app first — the running process holds state in memory and its
#    next debounced write would overwrite the restored file.
#    (e.g. stop the dev server / service)
# 2. Restore (writes a .pre-restore-<ts> safety copy automatically)
npm run restore -- backups/edutrack-backup-20260808.json
#    (the safety copy keeps the exact previous bytes — if that was a legacy
#    plaintext snapshot, the copy holds plaintext; treat it as sensitive and
#    delete it once the restore is verified)
# 3. Start the app again — it loads the restored snapshot at boot.
# 4. Smoke test: log in as an admin, check a roster / fee ledger entry.
```

`restore` refuses (exit 1, no changes) when: the manifest is unrecognised, the
checksum doesn't match (tamper/corruption), the payload ships plaintext PII,
or the current `DATA_ENC_KEY` fingerprint differs. **`--force` bypasses only
the key gate** — integrity and PII errors always abort, and even then `--force`
is a confession that the result will be garbage; use the escrowed key instead.

### Mongo mode (production)

```bash
# Requires the MongoDB Database Tools (mongodump/mongorestore) on PATH,
# version-matched to the server. Verify first (read-only):
node scripts/verify-backup.mjs backups/edutrack-backup-20260808/

# Full restore (replaces the target database's collections — --drop semantics):
npm run restore -- backups/edutrack-backup-20260808/ --uri "$MONGODB_URI"
```

Notes:

- `mongorestore --drop` drops and recreates each collection from the archive,
  giving a true point-in-time restore. Point it at a *fresh* database or be
  sure that's the intent — anything in the target DB not in the backup is
  gone.
- For a live production DB prefer **restoring to a staging URI first**, smoke
  test, then swap connection strings — avoids a long read-only window on prod.
- The app reads users from the DB on every request (authorization revalidates
  against the store), so a Mongo restore takes effect immediately on the next
  request. No restart strictly needed; a deploy/restart is still a clean way
  to force fresh state.

---

## 5. RPO / RTO (be honest about your numbers)

| Metric | Demo | Mongo (daily backup) |
| ------ | ---- | -------------------- |
| **RPO** (max data loss) | Time since the last backup — with the daily cron, ≤ 24h | ≤ 24h; tighten to hourly (`mongodump` is cheap on small DBs) if 24h is too much |
| **RTO** (time to recovery) | ~minutes: restore + restart (small file, no tooling) | 15–60 min: restore into fresh DB + swap URI + smoke test |
| Unrecoverable | Nothing, if the keys are escrowed and off-site copies exist | Same |

The weakest links are almost never the tooling — they are **un-escrowed
keys** and **backups sitting on the same disk as the database**. Fix those two
and the numbers above hold.

---

## 6. The four recovery scenarios

| Scenario | Play |
| -------- | ---- |
| **Ransomware / compromised host** | Disconnect the host. Restore the *latest verified* backup **off-site copy** into a fresh environment with escrowed keys. Treat the old environment as hostile: rotate `JWT_SECRET` (log everyone out), rotate `DATA_ENC_KEY`? — *no*: `DATA_ENC_KEY` must stay the same or backups become unreadable; instead rotate it at the *next* clean full backup and delete old artifacts. Investigate the breach before reconnecting anything. |
| **Accidental deletion of a school/students** | Restore the whole artifact to a staging environment, export the missing rows, re-import. The audit trails (`feeAudit`, `roleAudit`) in the same artifact help you reconstruct what happened. |
| **Bad deploy / schema-mutating change** | Restore the pre-change backup into staging, compare, then roll forward carefully. If the app itself was changed, roll back the code first — restore the data, not the code. |
| **Disk failure** | Restore from the off-site copy onto the replacement disk; the on-disk `backups/` folder is gone too, which is exactly why step 2 (off-site) is non-negotiable. |

A lost `DATA_ENC_KEY` is deliberately **not** a fifth scenario — there is no
recovery play for it, only prevention: the key must be escrowed *before* it is
needed (§3).

---

## 7. The integrity chain (why you can trust an artifact)

Every restore is gated by three independent checks, in order:

1. **Checksum** — SHA-256 of the exact payload/archive bytes vs the manifest.
   Catches tampering, truncation and bit-rot. (Tested: `tests/backup.test.js`
   "tampering … is detected and blocks restore".) Honest limits: the checksum
   lives *inside* the artifact, so it stops accidental damage and tampering
   that doesn't recompute the manifest — not a malicious actor with write
   access to the backup, who can recompute the whole file. Protect artifacts
   from such actors with storage-level controls (object-storage ACLs, versioning).
2. **PII at rest** — every email/phone in a demo payload must be an `enc:v1:`
   envelope with its `idx:v1:` blind index; readable PII is refused at backup
   time (unless `--force`) and at restore time. (Tested: "a plaintext-PII
   snapshot is refused".)
3. **Key fingerprints** — the current `DATA_ENC_KEY` must match the artifact's
   or restore refuses; `JWT_SECRET` mismatch warns. (Tested across processes:
   "refuses on DATA_ENC_KEY mismatch".)

The restore → restart → login round-trip is locked in CI end-to-end
(`tests/backup.test.js` "CLI end-to-end"), so a change to the tooling cannot
silently break recoverability.
