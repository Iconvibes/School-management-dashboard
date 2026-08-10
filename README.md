# 🎓 Edutrack

A multi-tenant cloud school management system built with **Next.js (App Router)**, **pure JavaScript**, **Tailwind CSS**, **Lucide React**, **MongoDB / Mongoose**, and **JWT** authentication.

Every school gets a fully isolated tenant: students, teachers, scores and payroll can never cross school boundaries.

## ✨ Features

- **Automated Report Cards** — A4-printable PDF report cards (jsPDF + html2canvas) with school branding and signature blocks.
- **Multi-Class Arms Engine** — model any stream (SS1 Science, SS1 Arts, JSS…), each with its own grading matrix.
- **Teacher Payroll Tracking** — one-click Paid / Pending toggles from the admin portal.
- **Instant Grading Matrix** — enter CA (out of 40) and Exam (out of 60); totals and letter grades compute live.
- **Role-Based Portals** — dedicated dashboards for Super Admin/Bursar/Registrar (shared console), Teacher, Student and Parent.
- **Multi-Tenant Isolation** — every query is scoped by `schoolId` and verified server-side.

## 🚀 Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo mode (no database needed)

If `MONGODB_URI` is **not** set, the app runs in demo mode with in-memory storage.

**Production ships a clean slate.** The demo school (and its demo accounts below) is only
seeded when `SEED_DEMO_SCHOOL` is enabled — off by default when `NODE_ENV=production`.
On a production boot there are **no pre-existing schools**: the first person to register
becomes the first school's admin. In dev/test the demo seed is on by default:

| Portal       | Email                  | Password    |
| ------------ | ---------------------- | ----------- |
| Super Admin  | `admin@edutrack.app`   | `admin123`  |
| Teacher      | `a.okafor@edutrack.app`| `teacher123`|
| Student      | `k.adebayo@edutrack.app`| `student123`|

Set `SEED_DEMO_SCHOOL=0` to disable the demo seed even in dev; `SEED_DEMO_SCHOOL=1` to
force it even in production.

### Connect MongoDB

```bash
cp .env.example .env.local
# edit .env.local
```

```env
MONGODB_URI=mongodb://127.0.0.1:27017/edutrack
JWT_SECRET=a-long-random-string
```

## 🧱 Architecture

```
src/
  app/                 # Pages (App Router) + API routes
    api/
      auth/            # register, login, logout, me
      school/          # tenant settings & onboarding
      users/           # student/teacher management, payroll & fee toggles
      scores/          # batch grading + student report data
      admin/stats/     # dashboard metrics
    admin/dashboard/   # Super Admin portal
    teacher/dashboard/ # Grading matrix
    student/dashboard/ # Report card + PDF export
  components/          # Logo, Sidebar, MetricCard, Modal, ReportCard
  lib/                 # db, auth (JWT), grading, store (Mongo ⇄ demo)
  models/              # School, User, Score (Mongoose)
```

## 🔐 Security & Authorization

EduTrack is multi-tenant (each school's scores, fees and payroll are isolated) and
role-based (six roles: `SUPER_ADMIN`, `BURSAR`, `REGISTRAR`, `TEACHER`, `PARENT`,
`STUDENT`). Authorization is enforced by **three independent layers** — a request
must pass all of them before a user sees anything. Each layer is deliberately
weak alone and strong together.

### The three-layer authorization model

| Layer | Where | What it checks | Why it's not enough alone |
| ----- | ----- | -------------- | ------------------------- |
| **1. Proxy render guard** | `src/proxy.js` | JWT signature + expiry, and the token's role claim against the portal's allowed roles | Optimistic — never touches the database, so a stale role claim still renders |
| **2. API revalidation** | `src/lib/policy.js` + `src/lib/permissions.js` | Re-fetches the acting user from the store on **every** request; token role/schoolId must match the live record | Authoritative, but fires per request — a page's HTML would already be sent |
| **3. Client me-gate** | each dashboard page | Re-checks `/api/auth/me` on mount and bounces mismatches to `/login` | Runs in the browser only — never a security boundary on its own |

**Layer 1 — Proxy render guard** (`src/proxy.js`). The Next 16 `proxy`
(middleware's successor) locks the four role portals to their roles at the
routing layer, so the wrong role can never even *receive* the wrong portal's
HTML:

| Portal      | Roles                              | Home              |
| ----------- | ---------------------------------- | ----------------- |
| `/admin/*`  | `SUPER_ADMIN`, `BURSAR`, `REGISTRAR` | `/admin/dashboard` |
| `/teacher/*`| `TEACHER`                          | `/teacher/dashboard` |
| `/student/*`| `STUDENT`                          | `/student/dashboard` |
| `/parent/*` | `PARENT`                           | `/parent/dashboard` |

It verifies only the JWT (signature + expiry) — per the Next docs, a proxy must
not do slow work, so it never queries the database. A missing/invalid token or
wrong-role session is redirected to `/login?next=<original path>`, so the auth
flow can drop the user back where they were headed. The auth pages are guarded
here too: an authenticated visitor to `/login` or `/register` is sent to their
role home or a validated `?next=` deep link (open-redirect protected in
`src/lib/portal-guard.js` `sanitizeNext`), and `/onboarding` (the founding
SUPER_ADMIN's first-run wizard) is restricted to that role — the page itself
re-checks `school.onboardingComplete` against the store and skips to
`/admin/dashboard` once the wizard is done. A demoted user's old token still
passes this layer **by design** — layer 2 is the real boundary.

**Layer 2 — API revalidation** (`src/lib/policy.js`) — the authoritative
boundary. Every route gate goes through `requireAuth([...roles])` or
`requirePermission([...roles], "action")` and re-reads the user from the store:

- **The JWT is only a ticket; the database is the truth.** A deleted account,
  a demotion, or a school move invalidates the session on the *next* request
  (401, `"Session no longer valid"`) — not at the 7-day token expiry.
- **The permission matrix** (`src/lib/permissions.js`): `ROLE_PERMISSIONS` maps
  every role to the actions it may perform (e.g. `fees.record`, `scores.enter`,
  `school.edit`), and `can(role, action)` reads it. Every multi-role gate is a
  `requirePermission` call; single-role self-service routes use
  `requireAuth([ROLE])`.
- **Row-level scope guards** sit *after* the gate and scope a session to its
  records: `requireClassScope` (a teacher only their own class arm),
  `requireOwnChild` (a parent only their linked children), `assertSameTenant`
  (a target user must belong to the caller's school).
- **Tenant isolation**: `schoolId` always comes from the session, never the
  client; bulk payloads validate every row against it.

**Layer 3 — Client me-gate.** Each dashboard calls `/api/auth/me` on mount.
`me` itself runs `requireAuth`, so a stale or deleted session 401s; the
page then double-checks the returned role matches its portal and
`router.replace("/login")`s on any mismatch. This is what turns a demotion
into a visible sign-out, not just a 401 deep in some API call.

### Adding a new role

The checklist below mirrors the header comment in `src/lib/permissions.js` — a
new role needs all of these or the app will misbehave somewhere:

1. **`src/models/User.js`** — add the role to the schema `enum` (Mongo mode).
2. **`src/lib/permissions.js`** — add it to `ROLES`; give it a
   `ROLE_PERMISSIONS` entry (the actions it may perform); add it to
   `STAFF_ROLES` if it opens the shared admin console **and** to `MFA_ROLES`
   if it is a staff role. The `MFA_ROLES` membership is security-relevant:
   the login route issues a session only after a TOTP second factor for
   members, and role management (`MANAGED_ROLES` in `src/lib/roles.js`,
   which derives from `MFA_ROLES`) can only re-roll them. A staff role with
   its own portal but no console (like TEACHER) goes in `MFA_ROLES` but
   **not** `STAFF_ROLES` — both lists are needed, and forgetting the MFA one
   silently skips the second factor for the new role.
3. **`src/lib/portal-guard.js`** — add a `ROLE_HOME` entry (post-login
   landing). Add a `PORTAL_GUARDS` entry only if the role gets its own portal
   (see below).
4. **`src/app/login/page.js`** — add it to the `ROLES` list (label + icon, the
   portal tab selector) and to `DEMO_CREDENTIALS` if the demo should ship a
   sample account.
5. **`src/lib/demo-store.js`** — seed a sample account when demo mode should
   exercise the role.
6. **`src/components/Sidebar.js`** — the staff branch is `can()`-driven, so a
   staff role's nav appears automatically from its actions; a role with its own
   portal needs a fixed home entry.
7. **`src/app/admin/dashboard/page.js` + `src/lib/roles.js`** — add a
   `ROLE_LABEL` entry in the dashboard if the role renders the admin console,
   and an entry in `ROLE_LABELS` (`src/lib/roles.js`) — the Roles & Access
   tab and the role-audit trail labels read that map.
8. **Tests** — extend `tests/permissions.test.js` (matrix), and
   `tests/portal-guard.test.js` (`ROLE_HOME`, portal × role combinations) and
   `tests/policy.test.js` if the role touches a gated route. If the role is
   staff, `tests/roles.test.js` pins `MANAGED_ROLES` — update its expectation.

The login API route needs **no changes** — it reads `resolvePostLoginRedirect`
(and `ROLE_HOME`) from `portal-guard.js`; the register route returns no role
home of its own (the register page sends the founding admin through
`/mfa/setup` first, then `/onboarding` — both client-side).

> **Why `ROLE_HOME` is load-bearing:** `resolvePostLoginRedirect` falls back to
> `ROLE_HOME[role] || "/"`, so a role without an entry doesn't crash — it
> silently dumps the user on the marketing home page after login. That's the
> confusing symptom this checklist exists to prevent.

### Adding a new portal (a role with its own dashboard)

A portal is a URL prefix locked to one or more roles by the proxy, plus a
page that re-checks its own role client-side:

1. **`src/lib/portal-guard.js`** — add `{ prefix: "/yourportal", roles: [...] }`
   to `PORTAL_GUARDS` and a matching `ROLE_HOME` entry.
2. **`src/proxy.js`** — add the prefix to `config.matcher`.
3. **`src/app/<portal>/dashboard/page.js`** — create the page with the layer-3
   me-gate: fetch `/api/auth/me`, verify the role, `router.replace("/login")`
   on mismatch.
4. **`src/components/Sidebar.js`** — route the role's nav to the new home.
5. **Tests** — extend `tests/portal-guard.test.js` so every portal × role
   combination (allowed and denied) is locked in, plus `ROLE_HOME` coverage.

### Cross-cutting security invariants

- HTTP-only JWT session cookies; the token is never exposed to JS.
- Passwords are bcrypt-hashed; hashes are stripped from every store return and
  API response (demo store parity is tested).
- **PII is encrypted at rest.** User and lead emails/phones are stored as
  AES-256-GCM `enc:v1:` envelopes (`src/lib/field-crypto.js`), keyed from the
  `DATA_ENC_KEY` env var (two HKDF-derived subkeys: AES + blind-index HMAC).
  Equality lookups (login, dedupe) run on deterministic `idx:v1:` HMAC blind
  indexes — never on the ciphertext — and the indexes never leave the server.
  Both stores encrypt: the demo store's on-disk snapshot holds ciphertext
  exactly like Mongo documents (verified by `tests/encryption.test.js`), so a
  leaked database or snapshot yields no readable emails or phones. Legacy
  plaintext rows pass through until rewritten.
- `role` is not updatable through the generic user PATCH route; the only way to
  change a role is the dedicated, SUPER_ADMIN-gated `PATCH /api/users/[id]/role`,
  which always writes an entry to the `RoleAudit` trail and takes effect on the
  target's next request (layer 2).
- Cross-tenant writes are rejected server-side against the session's
  `schoolId`; every `schoolId` in a bulk payload is validated.
- Login, registration, demo access and lead submissions are IP rate-limited.
- **Backups are encrypted, self-verifying and restorable.** Every artifact
  carries a SHA-256 checksum, a PII-at-rest verdict and the fingerprints of
  the `DATA_ENC_KEY` / `JWT_SECRET` that produced it; a restore refuses
  corrupt, plaintext-PII or wrong-key artifacts and keeps a safety copy. The
  full runbook — cadence, RPO/RTO targets, restore drills, the four recovery
  scenarios, and escrowing `DATA_ENC_KEY`/`JWT_SECRET` — lives in
  [`docs/disaster-recovery.md`](docs/disaster-recovery.md).
- The proxy and portal-guard are covered by `tests/portal-guard.test.js`;
  session revalidation by `tests/policy.test.js`; the matrix by
  `tests/permissions.test.js`; role changes by `tests/roles.test.js`.

## 💾 Backup & Disaster Recovery

Backups are self-verifying artifacts: every one carries a SHA-256 checksum, a
PII-at-rest verdict (no readable emails/phones — encryption at rest applies to
backups too) and the fingerprints of the `DATA_ENC_KEY` / `JWT_SECRET` that
produced it, so a restore **refuses** corrupt, plaintext-PII, or wrong-key
artifacts before touching anything.

```bash
npm run backup            # demo snapshot or mongodump archive + manifest
npm run verify-backup -- <backup>   # read-only integrity check (cron after every backup)
npm run restore -- <backup>         # verified restore, keeps a .pre-restore-<ts> copy
```

Backups land in `backups/` (gitignored). See
[`docs/disaster-recovery.md`](docs/disaster-recovery.md) for cadence,
retention, the restore playbooks (demo + Mongo), and the **key escrow**
requirements for `DATA_ENC_KEY` and `JWT_SECRET` — losing the encryption key
before escrowing it is unrecoverable. Restore round-trips, tamper detection
and plaintext-PII rejection are locked in by `tests/backup.test.js`.

## ⚡ Scaling

Built for the 10,000-concurrent-user target: every hot lookup is indexed,
stats are `countDocuments`-based, sessions are stateless JWTs (re-validated
against the store via a lean `findAuthSnapshot` — no per-request PII decrypt),
ranking loads are arm-scoped, and the roster API pages. A single production
instance sustains **~1,000 req/s** (measured); stateless instances scale
horizontally behind a load balancer with zero shared session state.

```bash
npm run load-test -- --base http://localhost:3210 --users 200 --requests 100 --endpoint me
npm run ensure-indexes        # explicit index build for production deploys
```

See [`docs/scaling.md`](docs/scaling.md) for the measured baseline, the
remaining ceilings (demo store, per-instance rate limiter, 30s notification
polling, one-school roster size) and the exact steps to cross each one.
