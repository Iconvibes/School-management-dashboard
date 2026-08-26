# 🎓 Edutrack

A multi-tenant cloud school management system built with **Next.js (App Router)**, **pure JavaScript**, **Tailwind CSS**, **Lucide React**, **MongoDB / Mongoose**, and **JWT** authentication.

Every school gets a fully isolated tenant: students, teachers, scores and payroll can never cross school boundaries.

## ✨ Features

- **Automated Report Cards** — A4-printable PDF report cards (jsPDF + html2canvas) with school branding and signature blocks.
- **Multi-Class Arms Engine** — model any stream (SS1 Science, SS1 Arts, JSS…), each with its own grading matrix.
- **Instant Grading Matrix** — enter CA (out of 40) and Exam (out of 60); totals and letter grades compute live.
- **Attendance Tracking** — daily class registers with one-tap marking; attendance summaries flow onto every report card.
- **Fee Management** — structures per class arm, termly billing, partial payments with live balances, auto-receipts, defaulter lists, and online Pay Now for parents.
- **Teacher Payroll Tracking** — one-click Paid / Pending toggles from the admin portal.
- **Parent Portal** — parents track report cards, attendance and fee balances for all their linked children, with one-click Pay Now and receipts.
- **Messaging** — in-app direct messages between parents, students, and staff with read receipts and conversation threads.
- **Push Notifications** — web push subscriptions for fee reminders, report card alerts, and class announcements.
- **Timetable Builder** — weekly schedule editor with conflict detection, bell-schedule editor, and printable teacher timetables.
- **Scheme of Work** — teachers create and share termly schemes of work per subject and class arm.
- **Alumni Tracking** — track graduates, university placements, and career outcomes.
- **Teacher Performance** — analytics dashboards for teacher engagement and effectiveness.
- **Multi-Branch Support** — school chains can manage multiple campuses from one tenant.
- **GDPR & Privacy Compliance** — data export (DSAR), erasure requests with admin approval workflow, data access audit log, and consent tracking. Full privacy policy page at `/privacy`.
- **Role-Based Portals** — dedicated dashboards for Super Admin/Bursar/Registrar (shared console), Teacher, Student and Parent.
- **Error Boundaries** — each dashboard tab and modal is individually wrapped in React ErrorBoundary components, so a crash in one section shows a friendly fallback without white-screening the entire portal.
- **Multi-Tenant Isolation** — every query is scoped by `schoolId` and verified server-side.
- **Installable PWA** — install on Android phones and Windows PCs like a native app.
- **Platform Admin Portal** — a separate, fully isolated control panel at `/platform/` for the EduTrack platform owner to monitor all schools, manage subscriptions, impersonate school admins, and view cross-tenant analytics.
- **School Impersonation** — platform admins can impersonate any school admin to troubleshoot issues directly, with session timeout, countdown banner, and full audit logging.
- **Billing Enforcement** — subscription lifecycle management: trials, active, expired, frozen. Expired schools are blocked from non-admin logins. Billing banners warn of expiring trials.
- **Cross-Tenant Audit Log** — every admin action across all schools is tracked: impersonation events, status changes, billing events. Filterable, searchable, exportable as CSV/PDF.
- **Platform Alerts** — real-time notifications when schools sign up, change subscription, freeze, or have errors. Severity-based (critical/warning/info) with read/unread state.
- **Webhook Integrations** — send platform events to Slack, Discord, or custom endpoints. Auto-fires on school signups, subscription changes, impersonation, and alerts.
- **Revenue Forecast** — weighted moving average + linear trend analysis projects next quarter revenue with confidence bands. Per-school and platform-wide views.
- **School Comparison** — overlay two schools enrollment or revenue trends side-by-side for competitive analysis.
- **Enrollment Drill-Down** — click any month on the enrollment chart to see exactly which students/teachers joined that month.
- **Responsive Digest Email** — polished HTML email template with mobile-first design, dark mode support, Outlook compatibility, and auto-send scheduling.

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
| Platform Admin | `platform@edutrack.app` | `platform123` |
| Teacher      | `a.okafor@edutrack.app`| `teacher123`|
| Student      | `k.adebayo@edutrack.app`| `student123`|
| Parent       | linked via admin dashboard | student's name as password |

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

## 🚀 Deployment

**Production refuses to boot without three secrets** (fail-fast checks in
`src/instrumentation.js` — a misconfigured boot dies loudly instead of
running degraded):

| Env var | Why it's mandatory in production |
| ------- | -------------------------------- |
| `MONGODB_URI` | the tenant database (absent = demo mode) |
| `JWT_SECRET` | session signing — the dev fallback is forgeable |
| `REDIS_URL` | shared rate-limit buckets + auth/dashboard/timetable caches (a multi-instance deploy with per-process buckets would multiply an attacker's budget by the server count) |
| `DATA_ENC_KEY` | seeds the AES-256-GCM key encrypting emails/phones — without it the app silently falls back to a **known dev key** (a leaked DB would decrypt PII). Generate with `openssl rand -base64 32` and **escrow it** (`docs/disaster-recovery.md`) |

Optional but recommended:

- `RUN_JOBS=primary` on exactly ONE instance, `none` on every replica — the
  background jobs (conflict scan, deletion sweeper) must never run twice.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` — Cloudflare
  Turnstile bot protection on login + register (skipped entirely when unset).
- `MONGODB_POOL_SIZE` (25–50 for N instances), `UV_THREADPOOL_SIZE=8`.
- `CACHE_MODE=memory` — dev only, to demo the Redis caches without Redis.

Deploy steps (one-time per environment):

```bash
npm ci && npm run build
npm run ensure-indexes      # explicit index build — never autoIndex in prod
npm start                   # health: GET /api/health and GET /api/health/db
```

The container definitions live in `deploy/Dockerfile` and
`deploy/docker-compose.yml`. Security headers (CSP, HSTS, X-Frame-Options,
nosniff, Referrer-Policy, Permissions-Policy) are stamped on every response
by `src/proxy.js` automatically.

## 🧱 Architecture

```
src/
  app/                     # Pages (App Router) + API routes
    api/
      auth/                # register, login, logout, me
      admin/               # stats, erasure requests, data access log, digests
      school/              # tenant settings, status, onboarding, reminder templates
      users/               # student/teacher/staff management, roles, payroll
      scores/              # batch grading + student report data
      fees/                # structures, payments, ledger, reminders, reconcile
      attendance/          # daily registers + summaries
      messages/            # in-app direct messaging
      notifications/       # notification CRUD + read state
      push/                # web push subscriptions
      timetable/           # schedule CRUD + health/conflict scan
      reports/             # report card generation
      resources/           # class resources
      scheme/              # scheme of work
      alumni/              # alumni management
      platform/            # platform admin: alerts, audit, schools, webhooks, digest, compare
      cron/                # scheduled tasks (digest auto-send)
      me/                  # GDPR data export + erasure request (per-user)
    admin/dashboard/       # Super Admin / Bursar / Registrar portal (~998 lines, thin layout shell)
    platform/              # Platform Admin portal (separate from school admin)
      dashboard/           # Overview: school stats, revenue, enrollment, alerts
      schools/             # School directory + drill-down per tenant
      audit/               # Cross-tenant audit log
      alerts/              # Platform alert center
      compare/             # School comparison mode
      settings/            # Digest preferences, webhook config
    teacher/dashboard/     # Grading matrix + attendance
    student/dashboard/     # Report card + timetable + fee status
    parent/dashboard/      # Children's reports, fees, messaging
    privacy/               # GDPR privacy policy page
    onboarding/            # 6-step first-run wizard (arms, session, teachers, fees, branding)
    login/ register/       # Auth pages with role selector

  models/                  # 27 Mongoose schemas
    School, User, Score, Attendance, FeeStructure, FeePayment,
    FeeCarryover, FeeAudit, TimetableEntry, TermArchive, ConflictScan,
    Notification, NotificationPreference, Message, PushSubscription,
    DigestPref, Digest, ReminderBatch, RoleAudit, SchemeOfWork,
    ClassResource, ClassAlertPref, Alumni, Branch, Lead,
    ErasureRequest, DataAccessLog,
    PlatformAlert, AuditLog, ImpersonationSession

  modules/                 # Domain modules (shared in-memory arrays for demo store)
    school/ users/ scores/ fees/ attendance/ communications/
    timetable/ grading/ resources/ alumni/ compliance/
    platform/            # platform alerts, audit logs, impersonation, webhooks, digest

  components/
    ErrorBoundary.js        # React error boundary (class component)
    admin/                 # Admin dashboard components
      AdminLayout.js        # Shared layout for standalone admin pages (import, quick-add, placeholders)
      AdminShell.js         # Admin shell with sidebar + topbar
      OverviewTab.js        # Dashboard overview (charts, metrics, quick actions)
      useAdminActions.js    # Custom hook — all 30+ action functions (CRUD, fee, timetable, bell schedule)
      tabConfig.js          # Tab visibility + ordering logic
      ScheduleHealthCard.js # Timetable integrity scan card
      modals/               # 12 extracted modals (AddUser, FeePayment, TermRollover, etc.)
      TeachersTab, StudentsTab, FeesTab, ReportsTab,
      TimetableTab, ClassesTab, RolesTab, LoginsTab, ArchivesTab,
      SettingsTab, SchemeOfWorkTab, RiskAlerts, TeacherPerformance,
      AlumniTab, EngagementTab, BranchesTab, ComplianceTab
    ExportMyDataButton.js  # GDPR data export (DSAR)
    RequestErasureButton.js # GDPR right to erasure
    ReportCardModal, PrintableTimetable, MessagingPanel, ...

  lib/                     # Core libraries
    store.js               # Unified data-access layer (demo ⇄ Mongo)
    demo-store.js          # In-memory store (thin facade over modules/)
    mongo-store.js         # Mongoose-backed store
    db.js                  # MongoDB connection + instrumentation
    auth.js / token.js     # JWT signing, verification, session management
    policy.js              # requireAuth, requirePermission, scope guards
    permissions.js         # Role → action matrix, can()
    portal-guard.js        # Role → portal mapping, ROLE_HOME
    field-crypto.js        # AES-256-GCM PII encryption + blind indexes
    mailer.js              # SMTP email delivery (optional)
    grading.ts             # Grading scales, position ranking, remarks (TypeScript)
    ranking.ts             # Class ranking + arm aggregation (TypeScript)
    konig.js               # König's edge-coloring timetable generator
    timetable.js           # Period/break/bell schedule helpers
    validation.js          # Zod schemas for API input validation
    log.js                 # Structured logger (isDev-gated console replacement)
    platform-digest.js    # Platform digest email builder (responsive HTML template)
    relative-time.js      # Human-readable time formatting ("2 minutes ago")
    billing.js            # Subscription status checks, grace period logic
```

## 🔐 Security & Authorization

EduTrack is multi-tenant (each school's scores, fees and payroll are isolated) and
role-based (seven roles: `PLATFORM_ADMIN`, `SUPER_ADMIN`, `BURSAR`, `REGISTRAR`, `TEACHER`, `PARENT`,
`STUDENT`). Authorization is enforced by **three independent layers** — a request
must pass all of them before a user sees anything. Each layer is deliberately
weak alone and strong together.

### The three-layer authorization model

| Layer | Where | What it checks | Why it's not enough alone |
| ----- | ----- | -------------- | ------------------------- |
| **1. Proxy render guard** | `src/proxy.js` | JWT signature + expiry, and the token's role claim against the portal's allowed roles | Optimistic — never touches the database, so a stale role claim still renders |
| **2. API revalidation** | `src/lib/policy.js` + `src/lib/permissions.js` | Re-fetches the acting user from the store on **every** request; token role/schoolId must match the live record | Authoritative, but fires per request — a page's HTML would already be sent |
| **3. Client me-gate** | each dashboard page | Re-checks `/api/auth/me` on mount and bounces mismatches to `/login` | Runs in the browser only — never a security boundary on its own |

**Layer 1 — Proxy render guard** (`src/proxy.js`). The platform admin portal (`/platform/*`) uses a completely separate login at `/platform/login` — it is not visible on the school login page and shares no UI with school portals. The Next 16 `proxy`
(middleware's successor) locks the four role portals to their roles at the
routing layer, so the wrong role can never even *receive* the wrong portal's
HTML:

| Portal      | Roles                              | Home              |
| ----------- | ---------------------------------- | ----------------- |
| `/platform/*` | `PLATFORM_ADMIN`                    | `/platform/dashboard` |
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
  a demotion, a school move, or a **password change** invalidates the session
  on the *next* request (401, `"Session no longer valid"`) — not at the 7-day
  token expiry. Password changes bump a `tokenVersion` counter on the account
  that is stamped into every token at sign-in, so a stolen pre-change token
  dies on its very next use.
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
   `STAFF_ROLES` if it opens the shared admin console. A staff role (any
   role with consequential power in a school) also goes into `MANAGED_ROLES`
   in `src/lib/roles.js` — role management can only re-roll accounts on that
   list, and a staff role left off it can never be promoted or demoted
   through the Roles & Access tab.
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
(and `ROLE_HOME`) from `portal-guard.js`; the register route issues the
founding admin's session directly and the register page sends them to
`/onboarding` (client-side).

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

## 🔒 GDPR & Privacy Compliance

EduTrack implements GDPR Articles 5, 6, 15, 17, 30 and NDPR compliance:

- **Data Export (DSAR)** — any authenticated user can download all their personal data as a structured JSON file via "Export My Data" (`GET /api/me/export`). Students get scores, attendance, and fees; parents get their children's data; teachers get timetable and schemes of work.
- **Right to Erasure** — users submit deletion requests via `POST /api/me/erasure-request`. Requests go through a PENDING → APPROVED → EXECUTED lifecycle with admin review. Execution cascade-deletes the user's scores, attendance, fee payments, carryovers, and timetable entries.
- **Data Access Audit Log** — every data access event is recorded (who, what, when) in `DataAccessLog` for GDPR Article 30 compliance. The admin can view and filter the log via the Compliance tab.
- **Consent Tracking** — consent is recorded at school registration and can be withdrawn. All consent events are logged in the audit trail.
- **Privacy Policy** — a comprehensive 14-section privacy policy page at `/privacy` covering data collection, legal bases, retention, security, children's data, cookies, and user rights.

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
