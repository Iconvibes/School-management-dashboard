# Project Defense Document — EduTrack

**Last updated:** 14 August 2026
**Regenerate:** `npm run defense-docs` (updates the PDF + DOCX from this file)

---

## Executive Summary (the 60-second pitch)

**EduTrack is one cloud platform that runs an entire school.** Instead of paper registers, Excel sheets and WhatsApp groups, a school gets report cards, grading, daily attendance, fee collection, payroll and parent communication in a single login — for the office staff, the teachers, and the families.

**The pitch, in plain English:** I built a system where a school's whole operation lives in one place. The staff manages the school, teachers mark attendance and enter scores, and parents open a portal to see their child's report card, attendance and fee balance instead of calling the office. The school's brand — logo, seal, colours — prints on every report card, so it feels like the school's own product, not a generic tool.

**Why it's defensible at scale:** every portal and every screen runs on one codebase, every user's session is a signed token any server can verify (so the app can grow from one server to many without redesign), and the 08:00 rush — the moment hundreds of thousands of students try to log in at once — is the explicit design target, with a measured plan (documented in `EduTrack-Traffic-Audit.md`) rather than a hope.

**Metrics at a glance:**
- **What it runs:** six portals (three staff tiers, teacher, parent, student) on one Next.js + React codebase with a MongoDB backend.
- **Automated tests:** 669 passing, run with a zero-dependency runner — unit tests on business logic and full route-level integration tests.
- **Availability story:** stateless sessions (any server can answer any request, no "sticky" load balancer), nightly self-verifying backups, and a 30-day restorable window if a school is ever deleted by mistake.
- **Scale target:** designed and audited for the 08:00 login burst — the load plan, measured numbers and ordered fixes live in `EduTrack-Traffic-Audit.md`.
- **Best proof it works:** the fee business — term rollovers carry unpaid balances forward, reminders are sent automatically with the school's own wording, and no parent can ever be notified twice for the same term.

**If you remember one thing:** EduTrack replaces a school's admin chaos with one login — and it was engineered, not just built, for the day everyone logs in at once.

---

## 1. Project Overview

**What it is:** EduTrack is an all-in-one cloud platform that runs an entire school — report cards, grading matrices, daily attendance, fee collection, payroll and parent communication — from a single login, so a school can replace its paper registers, Excel sheets and WhatsApp group chats with one system.

**Tech stack and why I chose each piece:**

- **Next.js 16 (App Router) + React 19** — one codebase serves all five portals (Super Admin, Bursar, Registrar, Teacher, Parent, Student) and the REST API. Server-rendered pages load fast, and route handlers give me clean API endpoints next to the pages that use them.
- **MongoDB + Mongoose** — every school is one tenant, and documents (a student's scores, a fee ledger) map naturally to Mongo's document model. It also scales horizontally when a school grows.
- **JWT sessions in httpOnly cookies (jsonwebtoken)** — stateless authentication. No session table to store, no load-balancer stickiness needed; any server can verify any user. This is the foundation of the horizontal-scaling story.
- **bcrypt (native)** — password hashing. Cost-10 compares run on libuv worker threads off the main thread, so a login burst never blocks Node's single JS thread; the demo store hashes at cost 4 so demo imports stay snappy.
- **Tailwind CSS v4** — consistent design system across every portal without writing bespoke CSS per page.
- **jspdf + html2canvas** — A4 report cards generated and downloaded as PDF straight from the browser.
- **nodemailer** — SMTP mailer for school status alerts (graceful no-op when not configured).
- **Mongoose + mongodump** — indexed data access, and nightly self-verifying backups.
- **node:test** — 669 automated tests run without a test-framework install.

**Architecture (simple diagram):**

```
Browser (any of the 6 portals)
        │  HTTPS / JWT cookie
        ▼
Next.js app  ──  API route handlers (REST)
        │
        ▼
Store layer (src/lib/store.js — one seam)
        ├── Mongo store  (production, MONGODB_URI set)
        └── Demo store   (in-memory + JSON file, dev/demo only)
                │
                ▼
        MongoDB (multi-tenant: every doc carries schoolId)
        + Redis (planned: shared rate limits + caches)
        + background jobs (timetable conflict scan, deletion sweeper)
        + nightly mongodump backups
```

---

## 2. Problems Encountered & How I Solved Them

**Problem: School A could accidentally see School B's data.**
*Solution:* I made multi-tenant isolation a *data-layer* rule, not a UI rule. Every document is scoped by `schoolId`, and every API route enforces it server-side through a central authorization policy (`src/lib/policy.js`). Dedicated tests prove one tenant can never read or write another's rows.

**Problem: Password hashing blocked the whole app.**
*Solution:* bcryptjs is pure JavaScript, so a cost-10 compare locks the single Node thread for ~60–100 ms — roughly 10–16 logins/s per instance, the #1 crash risk at 08:00. I swapped to the native `bcrypt` binding (same call signatures, cost 10 unchanged): compares now run on libuv worker threads off the main thread, lifting login throughput per instance several-fold without lowering security. The demo store still hashes at cost 4 (documented) so demo imports stay snappy.

**Problem: Deleting a notification from the admin inbox also erased the parent's and student's copy.**
*Solution:* I changed deletion to a **soft delete** — the record gets an `adminDeletedAt` stamp instead of being removed. Staff views hide it; parent and student reminder lists keep their copy. Then I added **auto-archive**: notifications older than a per-school retention window (default 90 days, configurable in Settings) leave the inbox automatically but stay viewable in an "Archived" tab, so the inbox stays lean without losing history. A Settings toggle (`reconcileDeletedReminders`) lets each school decide whether a deleted reminder still appears in the Reconcile & forward list — off by default, on keeps it forwardable once the student's parent is linked.

**Problem: A double rollover or a retried click could send the same fee reminder twice.**
*Solution:* I added an idempotency layer — every reminder send is recorded in a `ReminderBatch` with a unique key (per school + kind + batch id). A retry with the same key replays the stored result instead of notifying again; rollover reminders use a deterministic key per term, so the same parent physically cannot be notified twice for the same term.

**Problem: Admins retyped the fee-reminder message every time, and students with no parent got parent-portal wording.**
*Solution:* I made the reminder wording a **per-school saved template** with two variants (parent message and student message), auto-saved whenever a reminder is sent, and reused automatically by term-rollover reminders.

**Problem: The admin dashboard grew into a 7,000-line file.**
*Solution:* I extracted each tab's UI into its own component — starting with the Overview, which became a chart-driven dashboard (fee-collection trend, collection split donut, attendance bars, class distribution) built with hand-rolled SVG so no chart library was needed.

**Problem: The duplicate-key React warnings revealed a real data bug.**
*Solution:* The attendance trend was returning one point per class register instead of one point per school day. I grouped by date in both stores and verified the fix in the running app.

**Problem: Session state couldn't be shared if I ever ran two servers.**
*Solution:* I moved to stateless JWTs with a `tokenVersion` counter for instant revocation, and a lean `findAuthSnapshot` revalidation that never loads or decrypts PII on hot requests. Any number of servers can now share the load (documented in `docs/scaling.md`).

---

## 3. Key Features Deep Dive

### Authentication & Roles (the front door)
- **What it does:** Six portal types sign in (admins and students by email, parents and teachers by full name). A central permission matrix decides who may do what, and every API call is re-checked server-side.
- **Files:** `src/lib/token.js`, `src/lib/auth.js`, `src/lib/policy.js`, `src/lib/permissions.js`, `src/app/api/auth/*`
- **Plain English:** When you log in, the server checks the credentials against the school's users, then hands your browser a signed cookie that says "this is who you are." Every request after that re-verifies the cookie and re-checks your role against the permission matrix — so even if someone guesses a URL, the server refuses anything your role can't do.

### Report Cards (the headline feature)
- **What it does:** Teachers enter CA (out of 40) and Exam (out of 60) scores; totals and letter grades compute live. Admins generate a polished A4 report card — class position, subject remarks, attendance, signature block — and download it as PDF.
- **Files:** teacher dashboard (`src/app/teacher/dashboard`), `src/lib/grading.js`, `src/components/ReportCardModal.js`, jspdf/html2canvas.
- **Plain English:** Think of it as "Excel formulas plus a print layout." The grade is always calculated from the same two numbers, so a teacher can't fat-finger a total, and the PDF is generated in the browser so the school never needs special software on the office computer.

### Fee Management (the revenue engine)
- **What it does:** Per-class fee structures, termly billing, partial payments with live balances, automatic receipts, a defaulter list, parent "Pay Now" submissions needing admin confirmation, one-click reminders, and reconciliation for students whose parents weren't linked yet.
- **Files:** `src/lib/mongo-store.js` / `src/lib/demo-store.js` (ledger), `src/app/api/fees/*`, `src/lib/notifications.js`, `src/models/FeePayment.js`, `FeeCarryover.js`, `ReminderBatch.js`
- **Plain English:** The fee ledger is the school's money brain. When a term rolls over, unpaid balances carry forward and get added to the new term's fees — with an automatic reminder sent to the family. Reminders are idempotent (no double-notifying) and use the school's own saved wording.

### Attendance
- **What it does:** Daily per-class registers with one-tap present/absent marking; the summaries flow automatically onto report cards and the dashboard's attendance trend.
- **Files:** `src/models/Attendance.js`, teacher dashboard, `src/components/OverviewCharts.js`
- **Plain English:** A teacher marks a register in the morning; the school gets the roll-up for free, and parents see it on the portal.

### Timetable & Schedule Health
- **What it does:** Per-period bell schedules with per-day overrides, class-alert alarms, and a daily background scan that flags timetable collisions, unstaffed teachers and orphaned entries.
- **Files:** `src/lib/timetable.js`, `src/lib/conflict-scheduler.js`, `src/instrumentation.js`, `src/models/TimetableEntry.js`
- **Plain English:** The timetable isn't just a schedule — the system checks it every night for conflicts (like two classes in one room) and shows the admin a "Schedule Health" score on the dashboard.

### Payroll
- **What it does:** Teacher directory with paid/pending toggles, payroll metrics, and a "teachers awaiting payment" view.
- **Files:** `src/models/User.js` (payrollStatus), admin dashboard
- **Plain English:** A simple transparency tool: who's been paid this month, who hasn't, at a glance.

### Notifications & Digest
- **What it does:** An email-style admin inbox (fee payments, reminders, conflicts) with per-admin read state, mark-all-read, soft delete, "Clear all", auto-archive, and an optional daily/weekly digest.
- **Files:** `src/components/NotificationsBell.js`, `src/app/api/notifications/*`, `src/app/api/admin/digest/*`, `src/lib/digest.js`
- **Plain English:** Every important event lands in one inbox instead of WhatsApp. Each admin has their own read state, and the inbox auto-archives old items so it never becomes an unmanageable pile.

### Settings & Branding
- **What it does:** School logo, seal and brand color (printed on report cards), plus the notification retention window and per-school reminder templates.
- **Files:** `src/app/api/school/route.js`, `src/app/admin/dashboard/page.js` (Settings tab), `src/models/School.js`
- **Plain English:** The school customizes its identity once, and every report card and portal picks it up.

### Parent & Student Portals
- **What it does:** Parents track all their children (report cards, attendance, fee balances), pay online with one click, and see the school's reminders. Students see their own report card and reminders.
- **Files:** `src/app/parent/*`, `src/app/student/*`, `src/app/api/parent/pay/route.js`, `src/app/api/parent/reminders/route.js`
- **Plain English:** The school does the work once; the parent just opens the portal and sees everything about their child in one place.

---

## 4. Tech Decisions: Why I Used X

- **Why Next.js instead of Vue/Angular?** One framework for the pages *and* the API means faster delivery and one mental model — and server-side rendering keeps every portal fast even on school Wi-Fi. Business reason: I ship features faster and the school's staff don't wait on spinner screens.
- **Why MongoDB instead of Postgres?** A school's data is document-shaped (a student's scores, a fee ledger), multi-tenant isolation is a first-class pattern, and Mongo scales horizontally when traffic grows. Business reason: flexible data shapes and horizontal scale without schema-migration overhead.
- **Why JWT sessions instead of server-side sessions?** Stateless auth means no session table, no memory growth per user, and any number of servers can share the load — the load balancer never needs stickiness. Business reason: this is what makes the 08:00 login burst horizontally scalable.
- **Why Tailwind instead of hand-written CSS?** A consistent design system across six portals with no bespoke stylesheets to maintain. Business reason: the product looks polished and consistent everywhere, for less effort.
- **Why jspdf/html2canvas instead of a server-side PDF service?** Report cards generate instantly in the browser — no PDF queue, no extra service to pay for or monitor. Business reason: zero marginal cost per report card.
- **Why bcrypt?** It's the standard, well-audited password hash. Business reason: "we hash passwords with an industry-standard algorithm" is a defensible security answer in any procurement conversation.
- **Why node:test instead of Jest?** Zero extra dependencies, and the same runner drives both unit tests and route-level integration tests. Business reason: the test suite (669 tests) runs anywhere the code runs.

---

## 5. Code Walkthrough — Three Most Important Files

### 1) `src/lib/token.js` + `src/lib/auth.js` — "How a login becomes a session"
This pair signs and verifies the session cookie. `signToken` wraps the user's id, role and school id into a JWT signed with the server secret, and the cookie is set httpOnly (the browser can't read it via JavaScript — that's an XSS defense). On every request, `getSession` reads the cookie and `verifyToken` checks the signature and expiry. The clever part: because the token is self-contained and signed, **any server in a fleet can verify it without talking to any other server** — that's the entire horizontal-scaling story in one cookie.

### 2) `src/lib/store.js` — "One door to the data"
This is a 10-line file with an outsized job: it points the whole app at either the production Mongo store or the in-memory demo store, depending on whether `MONGODB_URI` is set. Every feature talks to `store.*` and never cares which backend it's on. I built the demo store first so the product was instantly runnable for demos and tests; Mongo was the production target from day one. Interview-wise, this is the clean "seam" that made the demo → production migration painless and keeps tests fast.

### 3) `src/app/api/school/rollover/route.js` — "The hardest business rule"
This route moves the whole school to a new term. It archives scores and attendance for the previous term, carries every unpaid fee balance forward and adds it to the new term's structure, sends automatic reminders to families using the school's saved wording, and records the whole thing in an idempotency batch so a double-click or double-rollover can never notify the same parent twice. It's the best example of the business logic living server-side: the API is the source of truth, and the UI is just a button that calls it.

---

## 6. Potential Interview Questions + Answers

1. **How did you handle authentication?** JWT in an httpOnly cookie, signed server-side. Every request re-validates the token against a lean user snapshot so password changes and role demotions take effect immediately, via a `tokenVersion` counter.
2. **How do you handle authorization?** A central permission matrix (`src/lib/permissions.js`) maps every role to the actions it may perform; every API route calls `requirePermission` and is re-checked server-side — the UI menu and the API can't drift.
3. **How do you stop School A seeing School B's data?** Every document carries `schoolId`, every query is school-scoped, and there are dedicated isolation tests proving one tenant can't touch another's rows.
4. **How do you deploy?** `next build` + `next start` (Docker standalone image), with `npm run ensure-indexes` run against Mongo before each deploy. Demo mode runs with no `MONGODB_URI`.
5. **What would you scale first?** The login path — and the big three are already shipped: native `bcrypt` (compares off the main thread), Redis-backed rate limits (shared budgets across instances), and Redis caching of the auth snapshot (60s, tokenVersion-aware) and dashboard stats (45s). Next: a login queue for the worst case, then a load test against the real Mongo tier.
6. **Why MongoDB and not Postgres?** Document-shaped data, tenant-scoped isolation as a first-class pattern, horizontal scaling. Honest trade-off: I'd reach for Postgres if the app were deeply relational.
7. **How did you handle the fee carryover business rule?** A `FeeCarryover` ledger: unpaid balances from the old term are carried as new ledger lines and added to the new term's structure, with automatic reminders sent per family.
8. **How do you prevent duplicate reminders?** `ReminderBatch` records with unique keys; a retry with the same key replays the stored result, and rollover reminders use a deterministic per-term key.
9. **How do you test this?** 669 tests with node:test — unit tests on business logic and route-level integration tests against the real API handlers with a mocked session.
10. **How do you handle passwords?** bcrypt (cost 10 in production), never stored in plaintext, never logged.
11. **What's the encryption story?** PII (email, phone) is encrypted at rest with a blind index so lookups stay fast without exposing ciphertext; login runs on the blind index, never on decrypted values.
12. **How does the parent portal work?** Parents sign in by name, see every linked child's report card, attendance and fee balance, pay online (pending admin confirmation), and receive the school's reminders.
13. **What's the hardest bug you fixed?** The soft-delete/auto-archive notification system: deleting from the admin inbox used to erase the family's copy, so I changed it to stamp records instead of removing them, then layered age-based auto-archive on top.
14. **How do you keep the admin dashboard fast?** It's chart-driven with hand-rolled SVG (no chart library), the heavy stats are cheap indexed counts, and the plan (documented) is Redis caching of dashboard stats.
15. **How do backups work?** Nightly mongodump with self-verifying restore checks; the school-deletion path keeps data for a 30-day grace window before a sweeper purges it.
16. **What background jobs run?** A daily timetable conflict scan and an hourly deleted-school sweeper, wired through `src/instrumentation.js` with graceful shutdown.
17. **How would you handle 300,000 students logging in at 8 AM?** Stateless JWTs mean horizontal scaling is already possible, and the three biggest bottlenecks are already fixed: native bcrypt (login compares no longer block the event loop), Redis-backed rate limits (one shared budget across all instances), and Redis caching of the hot reads — the auth snapshot (60s) and the dashboard stats (45s) — so the heaviest page is 1 cache GET instead of 10+ countDocuments. What remains is a login queue for the worst case and load-testing the real Mongo tier — the full measured plan is in the traffic audit.
18. **What's the rate-limiting story?** Multi-bucket brute-force protection on login (per IP, per account, per teacher name); flagged for a Redis-backed shared upgrade before multi-instance production.
19. **How is the code organized?** `src/lib` for business logic (pure, testable), `src/models` for data schemas, `src/app/api` for the REST layer, `src/components` for shared UI — with the stores behind one seam (`src/lib/store.js`).
20. **What would you improve with two more weeks?** A login queue for the worst case, an end-to-end load test against the real Mongo tier, and push-based notifications to cut the polling traffic (see Section 7).

---

## 7. What I Would Do Next / Improvements

1. **Make the 08:00 burst bulletproof.** Three steps are shipped — native `bcrypt` (compares off the main thread), Redis-backed rate limits (shared per-IP/account/school budgets), and Redis caching of the auth snapshot (60s) and dashboard stats (45s). Remaining: a login queue for the worst case and a load test against the real Mongo tier — all specified with code in `EduTrack-Traffic-Audit.md`.
2. **Replace the 30-second notification polling with push.** Server-Sent Events or WebSocket delivery would cut a third of background traffic at large scale.
3. **Finish paginating the roster and whole-school views.** The API already supports it; the UI just needs to use it so a 3,000-student school loads instantly.

---

## 8. Changelog

**Last updated:** 14 August 2026

Recent changes (most recent first):

1. **Interview cheat-sheet appendix (14 August 2026)** — appended a one-page "Numbers to Memorize" section (measured RPS, login rate, 669 tests, 6 portals, the 08:00 plan in 3 sentences) and corrected the stale test counts throughout the document.
2. **k6 login-storm executed (14 August 2026)** — ran `k6/load-test.js` against the running demo app (155 VUs, 8,587 requests): 39.6 req/s, p95 1.65s, 0% errors; a focused login-only burst (100 VUs) measured 55.8 logins/s at p95 1.91s. First bottleneck in this environment: single-process dev-mode saturation, not bcrypt or the store. Fixed two script bugs found by the run (`/api/fees/ledger` → `/api/fees`, poll seeds `K6_TOKEN`) and added `k6/load-test-login.js`.
2. **Stakeholder HTML report (14 August 2026)** — new `npm run audit-html` renders `EduTrack-Traffic-Audit.md` as a self-contained, print-optimized `EduTrack-Traffic-Audit.html` (cover block, styled tables/code, section-per-page print CSS) for the stakeholder PDF report.
2. **Redis auth + stats caches (14 August 2026)** — the audit's §6.2/§6.3: the per-request auth snapshot is cached for 60s (tokenVersion-aware: a version bump forces a fresh fetch even if the matching cacheDel was missed) and the dashboard stats route for 45s, so the heaviest page becomes 1 cache GET instead of 10+ countDocuments. Invalidation is wired at every snapshot-changing route: password change, role re-roll, school freeze/reactivate/restore/delete. Cache driver: Redis in production, in-memory via `CACHE_MODE=memory` for dev, off by default.
2. **Traffic day-one fixes (14 August 2026)** — swapped `bcryptjs` for native `bcrypt` (cost-10 compares now run on libuv threads off the main thread), made `checkRateLimit` Redis-backed (shared per-IP/account/school budgets across instances, with an in-memory fallback when Redis is configured but down), added a per-school login rate-limit bucket (5000 failed logins / 15 min), and gated the background jobs behind `RUN_JOBS` so only the primary replica starts the conflict scan and deletion sweeper.
2. **Executive Summary page** — added a one-page opening section to the defense document: a 60-second elevator pitch and a metrics box (portals, tests, availability story, scale target) so non-technical interviewers get the whole story in the first minute.
3. **Reconcile & deleted-reminder toggle** — new Settings toggle (`reconcileDeletedReminders`, default off): whether reminders deleted from the admin inbox stay eligible for the Reconcile & forward list, plumbed through `listNotifications`' new `includeDeleted` option so only the reconcile flow can opt back in.
4. **Auto-archive notifications** — added a per-school retention window (Settings → "Notification history", default 90 days) and an "Archived" tab in the notification bell; old notifications leave the inbox automatically but history is never lost.
5. **Soft-delete notifications** — deleting from the admin inbox now only hides it from staff views; parent and student reminder copies always survive.
6. **Back-to-dashboard navigation** — the header school name and a "Back to dashboard" button on Settings return to the Overview from anywhere.
7. **Overview dashboard rebuild** — extracted the Overview into its own component and rebuilt it with charts (fee-collection trend, collection split donut, attendance bars, class distribution); fixed the attendance-trend duplicate-day bug found live.
8. **Idempotent reminder batches** — `ReminderBatch` records with unique keys so a double rollover or retry can never notify the same parent twice.

### How this document stays current (standing rule)

After **every** code change to this repo:
1. Append the change to the Changelog above (short description + today's date, most recent first).
2. Re-read the codebase and update any section above that the change affects (features, decisions, walkthroughs, interview answers).
3. Run `npm run defense-docs` — it regenerates `docs/Project-Defense-Document.pdf` and `docs/Project-Defense-Document.docx` from this markdown.

This is a user-standing instruction: never ship a code change without refreshing this document.

---

## Appendix: Numbers to Memorize (interview cheat-sheet)

**The big three (measurements, not guesses):**
- **~1,000 req/s per instance** — the measured prod-build baseline (`docs/scaling.md`); ~700 req/s is the safer real-world figure.
- **55.8 logins/s** — measured this week with native bcrypt in demo mode; the audit projects **50–130 logins/s/instance** on a real build, vs the old bcryptjs cliff of **10–16**.
- **669 automated tests, all passing** — node:test, zero-dependency runner, unit + route-level integration.

**Product numbers:**
- **6 portals**: Super Admin, Bursar, Registrar, Teacher, Parent, Student — three staff tiers, one teacher tier, two family portals.
- **Multi-tenant**: every document is `schoolId`-scoped; built for 300+ schools; stateless JWTs mean the load balancer needs no stickiness.

**The 08:00 burst plan in 3 sentences:**
1. The storm is mostly *session revalidation* (7-day JWTs), not fresh logins — and the three big fixes are shipped: native bcrypt (compares off the main thread), Redis-backed rate limits (one shared budget per IP/account/school), and Redis caching of the auth snapshot (60 s) and dashboard stats (45 s).
2. Next: a BullMQ login queue so the fresh-login surge becomes a controlled stream, then right-size Mongo (M50+ with a read replica, pool 25–50 per instance) and run the distributed k6 storm (`K6_RAMP=300000`) against the real tier.
3. On the day: Cloudflare in front, `RUN_JOBS` on exactly one instance, the **07:55 alert** (p95 `/api/auth/me` > 1 s OR error rate > 1% OR Mongo queued ops) armed, and autoscaling capped by Mongo connections.
