# 📚 Edutrack — Codebase Navigation Guide

This guide is written for **you** — so you can find, understand, and safely edit anything in this codebase yourself. It maps every folder, explains the patterns the app uses, and gives you a "how do I change X?" cookbook for the most common edits.

> **Golden rules before you edit anything:**
> 1. **Primarily JavaScript** — files are `.js` / `.jsx`. TypeScript is available (`tsconfig.json`) and new library modules in `src/lib/` should be written as `.ts` with full type annotations (see `grading.ts`, `ranking.ts` for the pattern).
> 2. **The two stores must stay identical.** The app has TWO data layers (`demo-store.js` and `mongo-store.js`) with the *exact same function names and signatures*. If you change a function in one, change it in the other — or you'll get confusing "works in demo but not with a real database" bugs.
> 3. **Roles are UPPERCASE** — `SUPER_ADMIN`, `TEACHER`, `STUDENT`, `PARENT`. The API normalizes input but always stores/compares uppercase.
> 4. **Every query is scoped by `schoolId`** — multi-tenant isolation is the product's #1 promise. Never write a query that ignores it. In Mongo mode this is now ENFORCED: `src/lib/tenant-scope.js` (applied globally from `src/lib/db.js`) makes any unscoped query on a tenant model throw; by-_id / site-wide reads must call `bypassTenantScope(query)`.
> 5. Run `npm run build` and `npm run lint` after changes (see [Validation](#-validation) at the end).
> 6. **Security headers live in `src/proxy.js`** — a per-request nonce CSP in production (no `'unsafe-inline'` in `script-src`), stamped on every response AND forwarded on the request so Next 16 can nonce its inline flight scripts. The root layout (`src/app/layout.js`) forces dynamic rendering — that's required for per-request nonces. Don't add a CSP in `next.config.mjs`; the proxy is the single source.

---

## 🗺️ Big Picture

Edutrack is a **Next.js 16 (App Router)** app in pure JavaScript. It has two very different halves:

| Half | Where | Purpose |
|---|---|---|
| **Marketing site** | `src/app/page.js`, `features`, `solutions`, `pricing`, `trust`, `blog`, `contact`, `download`, `register` | The public website you pitch schools with |
| **App portals** | `login`, `onboarding`, `admin/dashboard`, `teacher/dashboard`, `student/dashboard`, `parent/dashboard` | The actual product: role-based dashboards |
| **API** | `src/app/api/**` | All data flows through these route handlers |
| **Data layer** | `src/lib/` | The stores (demo ⇄ Mongo), auth, grading logic |
| **Models** | `src/models/` | Mongoose schemas (used only in Mongo mode) |

**How a request flows:** Browser → Page/Component (`fetch("/api/...")`) → API route (`src/app/api/.../route.js`) → `store` (`src/lib/store.js`) → demo or Mongo.

The app runs in **two modes** decided by one thing — whether `MONGODB_URI` is set:

- **No `MONGODB_URI`** → **demo mode**: an in-memory store seeded with a fake school ("Greenfield International School") covering the real Nigerian secondary structure — JSS1–JSS3 as PLAIN classes (streaming starts at SSS) plus SS1–SS3 × Science/Arts/Commercial (12 class arms in total) — 16 subject-specialist teachers (one English and one Mathematics teacher span ALL 12 classes), 16 students, scores, attendance, fee structures, a parent, payment history and a generated collision-free weekly timetable. Data resets whenever the server restarts.
- **`MONGODB_URI` set** (in `.env.local`) → **Mongo mode**: real Mongoose persistence, true multi-tenant.

You do **not** need a database to develop — just run it and use the demo accounts.

---

## 📁 Top-Level Files

| File | What it is |
|---|---|
| `package.json` | Dependencies + scripts (`dev`, `build`, `start`, `lint`). No TypeScript anywhere. |
| `next.config.mjs` | Next.js config — currently empty defaults. |
| `jsconfig.json` | Path alias: `@/*` → `src/*` (so imports like `@/lib/auth` work). |
| `postcss.config.mjs`, `eslint.config.mjs` | Tailwind v4 + ESLint (flat config) wiring. |
| `.env.example` | Template for environment variables (see [Environment](#-environment-variables)). |
| `.gitignore`, `AGENTS.md`, `CLAUDE.md` | Housekeeping / agent instructions. |

---

## 🧱 The `src/` Tree (what lives where)

```
src/
├── app/                      # Pages + API routes (App Router)
│   ├── layout.js             # Root layout: fonts, metadata, PWA manifest link
│   ├── globals.css           # Tailwind v4 + custom animations/keyframes
│   ├── page.js               # Marketing homepage (hero, modules, install section)
│   ├── api/                  # ALL backend endpoints (see API map)
│   ├── admin/dashboard/      # Super Admin portal (~998 lines, thin layout shell)
│   ├── teacher/dashboard/    # Grading matrix + attendance + report cards
│   ├── student/dashboard/    # "My Report Card" + PDF export
│   ├── parent/dashboard/     # "My Children" + pay fees
│   ├── login/ register/ onboarding/   # Auth flows
│   └── features/ solutions/ pricing/ trust/ blog/ contact/ download/  # Marketing
├── components/               # Shared React components
│   └── marketing/            # Marketing-site components (SiteNav, Reveal, etc.)
├── lib/                      # THE data layer + business logic
├── models/                   # Mongoose schemas (Mongo mode only)
└── public/                   # (repo root) PWA files: manifest, sw.js, icons
```

---

## 🗄️ The Data Layer — `src/lib/` (most important folder to understand)

### `store.js` — the switchboard
```js
export const store = isDemoMode() ? demoStore : mongoStore;
```
Every API route does `import { store } from "@/lib/store"` and calls functions on it. **You never import `demo-store` or `mongo-store` directly in routes.**

### `demo-store.js` — the in-memory database
- Runs `seed()` once at module load: builds `schools`, `users`, `scores`, `attendance`, `feeStructures`, `feePayments`, `leads` arrays.
- All functions filter by `schoolId` (tenant isolation).
- Passwords are bcrypt-hashed (`hash()`), mirroring Mongo.
- **Heads-up:** because the data lives in module-level arrays, editing this file and letting the dev server hot-reload re-runs the module → **data resets**. That's normal.

### `mongo-store.js` — the real database
- Same function names/signatures as `demo-store.js`, but uses Mongoose models.
- Passwords hashed with bcrypt; `User.toJSON` strips the hash (see `src/models/User.js`).

### The function contract (both stores, 27 functions each)
| Group | Functions |
|---|---|
| Auth/school | `createSchoolAndAdmin`, `findUserByEmail`, `findUserByEmailInSchool`, `searchSchools`, `findUserById`, `getSchoolById`, `updateSchool` |
| Users | `listUsers({schoolId, role, classArm})`, `createUser`, `updateUser`, `deleteUser`, `getChildren(parentId)` |
| Scores | `saveScores`, `getScoresByClassSubject`, `getScoresByStudent`, `getScoresBySchool` |
| Dashboard | `getDashboardStats(schoolId)` |
| Fees | `getFeeStructures`, `saveFeeStructure`, `getFeeLedger` (amount = structure + carried balance), `recordFeePayment({...status="CONFIRMED"})`, `confirmFeePayment` |
| Attendance | `getAttendance`, `saveAttendance`, `getStudentAttendanceSummary` |
| Leads | `createLead`, `listLeads` |

> **Payment statuses:** parent-portal payments are created `PENDING` and only count toward balances after an admin confirms (`confirmFeePayment`). Admin-recorded walk-in payments default to `CONFIRMED`. Keep this behavior in both stores.

### `db.js`
- `isDemoMode()` → true when `MONGODB_URI` is missing.
- `connectDB()` → cached Mongoose connection (used inside mongo-store functions).

### `shutdown.js` + `instrumentation.js`
- `src/instrumentation.js` — Next 16 boot hook: requires `REDIS_URL` + `DATA_ENC_KEY` in production (fail-fast), gates the background jobs (conflict scanner, deletion sweeper) behind `RUN_JOBS !== "none"`, and wires graceful shutdown.
- `src/lib/shutdown.js` — the SIGTERM cleanup (`wireShutdown()`), in its OWN module on purpose: Next's dev Edge-compatibility check on `instrumentation.js` would warn on a bare `process.on` there (it flooded the dev log under load — 83k lines). instrumentation imports this only in its Node branch, so the Edge bundle never sees it.

### `auth.js` — JWT sessions
- Cookie: `edutrack_token` (httpOnly, 7-day expiry).
- `getSession()` — read + verify the cookie (use in every API route / server component).
- `signToken` / `verifyToken` / `setAuthCookie` / `clearAuthCookie` / `jsonError(message, status)`.
- The JWT payload contains: `userId`, `schoolId`, `role`, `name`, `email`.
- **`jsonError()` is the standard error helper** — every route returns `jsonError("message", 400)` etc.

### `grading.ts` — business rules (edit these to change grading)
| What | Where |
|---|---|
| CA max (40) / Exam max (60) | `MAX_CA`, `MAX_EXAM` |
| Subject list | `DEFAULT_SUBJECTS` (also overridable via `EDUTRACK_SUBJECTS` env) |
| Letter grades | `computeGrade(total)` — A≥70, B≥60, C≥50, D≥40, F below |
| Academic standings | `standingFromAverage(avg)` — Distinction/Very Good/Good/Credit/Needs Support |
| Remarks | `subjectRemark(grade)`, `standingRemark(label)` |
| Ordinals | `ordinal(n)` → "1st", "2nd"… (already returns number + suffix) |
| UI badge colors | `gradeBadgeClasses(grade)` |

### `blog-posts.js`
- Hardcoded blog article data used by `/blog`. Edit the array here to change articles.

---

## 🏷️ Mongoose Models — `src/models/`

Used only in Mongo mode. Each is a schema + `toJSON` transformer that strips sensitive fields (like `password`).

| Model | Key fields |
|---|---|
| `School.js` | `name`, `activeArms[]`, `currentSession`, `currentTerm`, `brandColor`, `logo` |
| `User.js` | `schoolId`, `name`, `email`, `password(hash)`, `role`, `assignedClass`, `phone`, `payrollStatus`, `feePaid`, `parentId` |
| `Score.js` | `schoolId`, `studentId`, `classArm`, `subject`, `caScore`, `examScore`, `totalScore`, `grade`, `session`, `term` |
| `Attendance.js` | `schoolId`, `classArm`, `date`, `records[]` (per student: status) |
| `FeeStructure.js` | `schoolId`, `classArm`, `amount`, `session`, `term` |
| `FeePayment.js` | `schoolId`, `studentId`, `amount`, `method`, `note`, `receiptNo`, `status` (`PENDING`/`CONFIRMED`), `session`, `term` |
| `TermArchive.js` | rolled-over term snapshots: `schoolId`, `session`, `term`, `kind` (`score`/`attendance`/`student`), `classArm` + per-kind payload rows (the `student` roster rows snapshot each enrolled student's name so archived report cards survive deletions) |
| `ReminderBatch.js` | idempotency records for reminder sends: `schoolId`, `kind` (`manual`/`rollover`), `key`, `studentIds[]`, `result` — unique `(schoolId, kind, key)` so a retried send or double rollover replays the stored result instead of notifying twice |
| `Lead.js` | contact/demo form submissions |

**Adding a field to a model?** You must also: (1) add it to `demo-store.js`'s seed/objects, (2) add it to `mongo-store.js`'s queries/creates, (3) surface it in the API route + UI. All four layers.

---

## 📊 Data Shapes — example records in both stores

The two stores use **identical field names** so API routes never care which is active. The differences are mechanical:

| | Demo store | Mongo (what the API returns) |
|---|---|---|
| Primary key | string id, e.g. `"usr_102"` | `_id` (ObjectId) serialized to string `id` |
| Timestamps | `createdAt` only | `createdAt` + `updatedAt` (`__v` stripped) |
| `password` | stored hashed; the **route** strips it from responses | hashed by a pre-save hook; **`toJSON` strips it automatically** |
| Type checks | none (plain JS objects) | Mongoose `enum`/`min`/`max`/`unique` indexes enforced |

### `School`

Demo (from `seed()`):
```js
{
  id: "sch_101",
  name: "Greenfield International School",
  logoUrl: "",
  brandColor: "#2563EB",
  activeArms: ["JSS1", "JSS2", "JSS3", "SS1 Science", "SS1 Arts", "SS1 Commercial", "SS2 Science", "SS2 Arts", "SS2 Commercial", "SS3 Science", "SS3 Arts", "SS3 Commercial"],
  currentSession: "2025/2026",
  currentTerm: "First Term",
  createdAt: "2026-08-05T…Z",
}
```
Mongo: same fields, plus `updatedAt`. Set via onboarding (`PATCH /api/school`); read by every dashboard through `session.school`.

### `User` (the one record type for ALL roles)

One array/collection holds admin, teachers, students and parents — the `role` field decides everything.

Demo (a teacher, from `seed()` — the admin is `usr_102`, teachers start at `usr_103`):
```js
{
  id: "usr_103",
  name: "Mrs. Adaeze Okafor",
  email: "a.okafor@edutrack.app",
  password: "$2b$10$…",            // bcrypt hash — never returned by the API
  role: "TEACHER",                 // SUPER_ADMIN | TEACHER | STUDENT | PARENT
  schoolId: "sch_101",             // ← tenant boundary, every query filters on this
  assignedClass: "SS1 Science",    // teachers + students; "" when unassigned
  payrollStatus: "PAID",           // PAID | PENDING (teachers only)
  feePaid: false,                  // students: fully paid this term?
  parentId: null,                  // students: links to their PARENT's id
  phone: "",
  address: "",
  createdAt: "2026-08-05T…Z",
}
```
Mongo differences: `_id` ObjectId; `password` auto-hashed on save and removed by `toJSON`; compound unique index `{ schoolId, email }` (same email allowed in *different* schools); `parentId` is a `ref: "User"` ObjectId.

Demo parent with phone/address populated: `p.adebayo@edutrack.app` (Mrs. Folake Adebayo, `phone: "0803 123 4567"`) links students `k.adebayo` and `c.obi` via their `parentId`.

### `Score`

Demo (example record — first seeded score is `scr_214`, for Kunle `usr_109`):
```js
{
  id: "scr_214",
  studentId: "usr_109",            // which student
  schoolId: "sch_101",
  subject: "Mathematics",
  classArm: "SS1 Science",
  caScore: 34,                     // out of 40
  examScore: 52,                   // out of 60
  totalScore: 86,                  // ca + exam
  grade: "A",                      // computed from totalScore
  createdAt: "2026-08-05T…Z",
}
```
Mongo: `totalScore` + `grade` are **auto-computed in a pre-validate hook** — you only ever supply `caScore`/`examScore`. Unique per `{ studentId, subject, classArm }`. The grade bands live in `src/lib/grading.ts` (`computeGrade`).

### `FeePayment`

Demo (example record — second seeded payment, for Chidinma `usr_110`):
```js
{
  id: "fpay_108",
  schoolId: "sch_101",
  studentId: "usr_110",
  amount: 185000,
  method: "TRANSFER",              // CASH | TRANSFER | CARD | POS | USSD | OTHER
  receiptNo: "RCT-1002",           // auto-increments from RCT-1001
  session: "2025/2026",
  term: "First Term",
  note: "Full term fee",
  createdAt: "2026-08-05T…Z",
}
```
Mongo adds: `status` enum `PENDING`/`CONFIRMED` (default `CONFIRMED`) + `updatedAt`; unique `{ schoolId, receiptNo }`.

> **Status subtlety (both stores):** seed payments have **no `status` field** and the ledger treats anything that isn't `"PENDING"` as confirmed — so legacy/seed payments count immediately. Only parent-portal payments are created `PENDING` (awaiting admin confirmation) and skip the balance until confirmed. New payments in the demo store DO carry `status` (added in `recordFeePayment`).

### Compact reference — the other three

| Record | Demo shape | Mongo extras |
|---|---|---|
| `FeeStructure` | `{ id, schoolId, classArm, amount, session, term, createdAt }` | unique `{ schoolId, classArm, session, term }`; `updatedAt` |
| `Attendance` | `{ id, schoolId, classArm, date (YYYY-MM-DD), session, term, records: [{ studentId, present: bool }], createdAt }` | one register per `{ schoolId, classArm, date }` (unique) |
| `Lead` | `{ id, kind ("demo"\|"newsletter"), name, school, email, phone, size, interest, message, ip, userAgent, createdAt }` | **not tenant-scoped** — belongs to the platform; unique `{ kind, email }` |

---

## 🔌 API Routes — `src/app/api/**`

Every endpoint is a `route.js` file inside a folder. The folder path = the URL. Standard pattern inside every route:

```js
// src/app/api/<thing>/route.js
import { store } from "@/lib/store";
import { getSession, jsonError } from "@/lib/auth";

export async function GET(request) { ... }
export async function POST(request) { ... }   // add PATCH / PUT / DELETE as needed
```

Every route: (1) reads the session, (2) rejects unauthenticated with 401, (3) checks role with 403, (4) always filters by `session.schoolId`.

### Complete endpoint map

| Method(s) | URL | Purpose | Roles |
|---|---|---|---|
| POST | `/api/auth/register` | Create school + super admin | public |
| POST | `/api/auth/login` | Sign in (any role, any school) | public |
| POST | `/api/auth/logout` | Clear cookie | any |
| GET | `/api/auth/me` | Current session + school data | any |
| POST | `/api/auth/demo` | One-click demo login | public |
| PATCH | `/api/school` | Onboarding: save class arms, session, branding | SUPER_ADMIN |
| GET | `/api/schools?search=` | Find schools at login ("Change school") | public |
| GET | `/api/users` | List users (filter by role/classArm) | SUPER_ADMIN |
| POST | `/api/users` | Create user (STUDENT/TEACHER/PARENT) | SUPER_ADMIN, TEACHER (students only, own class) |
| PATCH | `/api/users/[id]` | Update user (incl. payroll, feePaid, link parent) | SUPER_ADMIN |
| DELETE | `/api/users/[id]` | Remove a user | SUPER_ADMIN |
| POST | `/api/scores` | Batch-save grading matrix | SUPER_ADMIN, TEACHER (own class only) |
| GET | `/api/scores?classArm=&subject=` | Fetch a matrix | SUPER_ADMIN, TEACHER |
| GET | `/api/scores/student` | Student's own scores + summary + fee + attendance | STUDENT |
| GET/POST | `/api/attendance` | Read/save daily register | TEACHER, SUPER_ADMIN |
| GET | `/api/reports` | Ranked students for report-cards tab | SUPER_ADMIN, TEACHER |
| GET | `/api/reports/[studentId]` | Full data for one report card | SUPER_ADMIN, TEACHER, PARENT (own child) |
| GET | `/api/fees` | Fee ledger + totals + pending payments | SUPER_ADMIN |
| GET/POST | `/api/fees/structures` | Fee structures per class arm | SUPER_ADMIN |
| POST | `/api/fees/reminders` | Send fee reminders (optional `message`/`messageStudent`; non-blank wording auto-saved as the school's templates; optional `batchId` makes the send idempotent — a retried key replays the recorded result, never re-notifying) | SUPER_ADMIN, BURSAR |
| GET/PUT | `/api/school/reminder-templates` | Read/save the school's { parent, student } reminder wording | SUPER_ADMIN, BURSAR |
| — | `ReminderBatch` (model) | Idempotency records for reminder sends: unique (schoolId, kind, key) — `manual` keys are client batchIds, `rollover` keys are deterministic `rollover:<schoolId>:<session>:<term>`. Rollover automatic reminders replay an existing batch instead of re-notifying. | — |
| GET | `/api/fees/payments` | Payment history | SUPER_ADMIN |
| PATCH | `/api/fees/payments?id=` | **Confirm** a pending parent payment | SUPER_ADMIN |
| GET | `/api/notifications` | Admin inbox list + unread count (per-admin read state) | SUPER_ADMIN |
| POST | `/api/notifications/read` | Mark notifications read for the calling admin | SUPER_ADMIN |
| POST | `/api/notifications/delete` | SOFT-delete notifications by `{ ids }` — hidden from the admin inbox only; parent/student reminder copies survive (stamped `adminDeletedAt`) | SUPER_ADMIN |
| GET | `/api/parent/children` | Parent's linked children + fee summaries | PARENT |
| POST | `/api/parent/pay` | Parent pays fee (creates PENDING) | PARENT |
| GET | `/api/admin/stats` | Overview metric cards | SUPER_ADMIN |
| POST | `/api/leads` | Contact/demo form → stores a lead | public |
| POST | `/api/newsletter` | Newsletter signup | public |

**Route conventions to keep:**
- Auth first: `const session = await getSession(); if (!session) return jsonError("Not authenticated", 401);`
- Role gate: `if (session.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);`
- Tenant scope: always use `session.schoolId` — never trust ids in the body for scoping decisions.
- Role enum check: `["STUDENT","TEACHER","PARENT"].includes(role)` (uppercase).

---

## 🖥️ The Portals (pages)

### Login — `src/app/login/page.js`
- "Change school" dropdown uses `/api/schools`.
- Demo-account quick buttons (hardcoded list at the top of the file).
- Role selector determines the button label; login hits `/api/auth/login`, which redirects by role.

### Registration + Onboarding — `register/`, `onboarding/`
- `register/page.js` → POST `/api/auth/register` → redirect to `/onboarding`.
- `onboarding/page.js` → pick class arms, session, term, brand color → PATCH `/api/school` → redirect to `/admin/dashboard`.
- The dashboard's class-arm dropdowns all read `session.school.activeArms` — **configure arms here first**, or teachers/admins have nothing to select.

### Admin dashboard — `src/app/admin/dashboard/page.js` (thin layout shell, ~998 lines)
A thin layout shell: state declarations → data-fetch effects → `useAdminActions()` call → role gates → JSX. All 30+ action functions extracted to `useAdminActions.js` (1,302 lines).
- Fetches: `/api/auth/me`, `/api/admin/stats`, `/api/users`, `/api/fees`, `/api/reports`.
- 19 tabs with URL hash routing (`#fees`, `#timetable`, etc.).
- **State lives in page.js; actions live in `src/components/admin/useAdminActions.js`.** Tab components consume state via `useAdminShell()` context.
- **12 modals** extracted to `src/components/admin/modals/`, each wrapped in `<ErrorBoundary>`.
- **Each tab has a distinct gradient theme** (blue for Timetable, emerald for Fees, purple for Reports, etc.).
- **Sidebar highlights the active tab** with a blue indicator + glowing dot.
- **Standalone admin pages** (`/admin/import`, `/admin/quick-add`, `/admin/placeholders`) use `AdminLayout.js` for persistent sidebar + topbar.

### Teacher dashboard — `src/app/teacher/dashboard/page.js`
Tabs (via state + hash): **Grading Matrix** (batch score entry), **Attendance** (daily register), **Report Cards** (ranked students + generate PDF).
- "Add student" modal (teachers can add students into their own class arm).
- Class arm is locked to the teacher's `assignedClass` when set.

### Student dashboard — `src/app/student/dashboard/page.js`
"My Report Card": summary cards (average, position, standing, fee balance, attendance, best subject) + per-subject cards + `ReportCardModal` for the branded PDF.

### Parent dashboard — `src/app/parent/dashboard/page.js`
"My Children": child cards with report-card view, fee balance + **Pay Now** (creates PENDING payment; shows "awaiting confirmation" chip until admin confirms), attendance.

---

## 🎨 Marketing Site — `src/app/` + `src/components/marketing/`

| Page | File | Notes |
|---|---|---|
| Home | `page.js` | Hero (3D/parallax), 8-module grid, how-it-works, testimonials, **install-the-app section**, CTA |
| Features | `features/page.js` | One section per module (`id` anchors: `#report-cards`, `#grading`, `#attendance`, `#fees`, `#payroll`, `#parents`, `#multitenant`, `#pwa`) |
| Solutions | `solutions/page.js` | Per-role sections (`#admin`, `#teacher`, `#student`, `#parent`) |
| Pricing | `pricing/page.js` | Plan cards |
| Trust | `trust/page.js` | Security/privacy |
| Blog | `blog/page.js` | Uses `src/lib/blog-posts.js` data |
| Contact | `contact/page.js` | Contact + demo-request forms → POST `/api/leads` |
| Download | `download/page.js` | PWA install instructions + `InstallPwaButton` |

**Marketing components** (`src/components/marketing/`):
- `SiteNav.js` — the sticky nav (its `LINKS` array controls the top menu — add a page link there).
- `SiteFooter.js` — footer (link columns are the `COLUMNS` array).
- `Reveal.js` — scroll-reveal animation wrapper.
- `TiltCard.js` — 3D tilt-on-hover card.
- `Parallax.js` — parallax background wrapper.
- `BlogGrid.js`, `DemoRequestForm.js`, `NewsletterForm.js`.

The marketing site uses custom CSS animations defined in `src/app/globals.css` — e.g. `animate-drift`, `animate-float-y`, `animate-spin-slow`, `animate-gradient-text`, `animate-ping-dot`, `perspective-2000`, `preserve-3d`.

---

## 🧩 Shared Components — `src/components/`

There are three groups: **portal components** (used inside the dashboards), **utility components** (used everywhere), and **marketing components** (`src/components/marketing/`, used only on the public site). Each entry lists its props and where it is used.

### Portal components (dashboards)

#### `Sidebar.js` — left navigation for all four portals
"use client". Renders the left nav with the correct menu items for the signed-in role, plus the Sign out button. On mobile it slides in over a backdrop.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `role` | `string` | — | `SUPER_ADMIN` → 5 admin links, `TEACHER` → 3 links, `PARENT` → 1 link, anything else → student's "My Report" |
| `open` | `boolean` | — | Mobile drawer visibility (start `false`) |
| `onClose` | `() => void` | — | Called when the backdrop or close button is clicked |

**Used by:** `admin/dashboard`, `teacher/dashboard`, `student/dashboard`, `parent/dashboard` (each passes `role={session.user.role}`).

#### `ReportCard.js` — the A4 report card itself
Server-safe (no hooks). This is the single source of truth for the report-card layout — headers, per-subject table, totals, class position, standings, signature blocks and the **school logo watermark on the lower right** (reads `school.logoUrl` / `school.brandColor`). Used on-screen (scaled) and by the PDF exporter (captured at natural size).

| Prop | Type | Notes |
|---|---|---|
| `school` | `object` | School record: `name`, `currentSession`, `currentTerm`, `brandColor`, `logoUrl` |
| `user` | `object` | The student: `name`, `assignedClass`, `studentId` |
| `scores` | `array` | `[{ subject, caScore, examScore, totalScore, grade, classArm }]` |
| `summary` | `object` | `{ subjects, average, position, outOf, standing }` |
| `attendance` | `object` | `{ present, total }` |

**Edit the layout here** — the PDF and every preview stay in sync automatically.

#### `ReportCardModal.js` — preview + A4 PDF export
"use client". Modal showing a scaled preview of `ReportCard` with a **Download PDF** button (jsPDF + html2canvas). Uses an off-screen capture node so the PDF renders at full quality regardless of modal scaling.

| Prop | Type | Notes |
|---|---|---|
| `open` | `boolean` | Renders nothing when `false` |
| `onClose` | `() => void` | — |
| `school` | `object` | same shape as `ReportCard.school` |
| `student` | `object` | the student record |
| `scores` | `array` | report-card scores |
| `summary` | `object` | report-card summary |
| `attendance` | `object` | `{ present, total }` |
| `fileName` | `string` | optional filename stem for the saved PDF |

**Used by:** `student/dashboard` (own card), `teacher/dashboard` and `admin/dashboard` (any student's card), `parent/dashboard` (child's card).

#### `Modal.js` — generic popup shell
"use client". Simple centered modal with a title bar, close button and a backdrop that closes on click. All the "Add teacher / Add student / Create parent / Edit" forms in the dashboards are built on this.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `open` | `boolean` | — | returns `null` when `false` |
| `onClose` | `() => void` | — | backdrop + ✕ button |
| `title` | `string` | — | shown in the header bar |
| `children` | `ReactNode` | — | the form/body |
| `wide` | `boolean` | `false` | `true` → `max-w-2xl`, else `max-w-md` |

**Used by:** `admin/dashboard` (add-teacher/student/parent, fee structure, walk-in payment), `teacher/dashboard` (add student), `parent/dashboard` (pay fee).

#### `MetricCard.js` — dashboard stat card
Server-safe. A label + big value + optional sub-line with a colored icon chip. The icons on the admin Overview and teacher dashboards.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `icon` | `Component` | — | a lucide icon (passed as `<Icon />`) |
| `label` | `string` | — | small grey caption |
| `value` | `string/number` | — | the big bold number |
| `sub` | `string` | `undefined` | optional helper text under the value |
| `accent` | `string` | `"brand"` | chip color: `brand` \| `emerald` \| `amber` \| `navy` |

**Used by:** `admin/dashboard` Overview tab.

#### `TopStudents.js` — "Best students" leaderboard
"use client". Ranked list (top 3 get medal colors) with average %, grade badge, and a clickable row that calls `onView(studentId)`.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `students` | `array` | — | **already sorted desc by average** — the component only slices + renders |
| `onView` | `(id) => void` | — | row click (opens that student's report card) |
| `limit` | `number` | `5` | how many to show |
| `title` | `string` | `"Top students"` | heading text |

**Used by:** `admin/dashboard` (Report Cards tab) and `teacher/dashboard` (Report Cards tab).

### Utility components (used everywhere)

#### `Logo.js` — the Edutrack logo
Server-safe. A brand-gradient rounded square with a graduation-cap icon + "Edu**track**" wordmark.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `light` | `boolean` | `false` | white text for dark backgrounds |
| `size` | `string` | `"md"` | `"sm"` \| `"md"` \| `"lg"` |

**Used by:** `Sidebar`, `SiteNav`, `SiteFooter`, `login`, `register`, `onboarding`.

#### `DemoLoginButton.js` — one-click demo login
"use client". Signs into the seeded demo school via `POST /api/auth/demo` and navigates to the dashboard. Hidden (renders `null`) if the demo endpoint fails — safe on any page.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `className` | `string` | `""` | extra classes (used by SiteNav to shrink padding) |

**Used by:** homepage hero + CTA, `SiteNav`, `pricing`, `trust`, `contact`.

#### `PwaRegister.js` — service worker registration
"use client", renders `null`. Registers `/sw.js` on load (dev AND production) so the app is installable as a PWA. No props.

**Used by:** `app/layout.js` only (once, app-wide).

#### `InstallPwaButton.js` — "Install the app" button
"use client". Listens for the browser's `beforeinstallprompt` event and only renders when installation is available; after installing it shows an "Installed ✓" chip. Renders `null` on browsers that can't install.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `string` | `"solid"` | `"solid"` (dark button) \| `"ghost"` (translucent, for dark hero) |
| `className` | `string` | `""` | sizing/positioning extras |

**Used by:** homepage `#install` section, `/download` page (hero + CTA).

### Marketing components — `src/components/marketing/`

| Component | Props | Purpose | Used by |
|---|---|---|---|
| `SiteNav.js` | *(none — internal state)* | Sticky top nav; the `LINKS` array drives the menu | every marketing page |
| `SiteFooter.js` | *(none — internal)* | Footer with link `COLUMNS` | every marketing page |
| `Reveal.js` | `children`, `variant` (`up`/`left`/`right`/`scale`, default `up`), `delay` (ms, for staggering), `className` | Scroll-reveal via IntersectionObserver; add class `is-visible` | every marketing page + `BlogGrid` |
| `TiltCard.js` | `children`, `maxTilt` (deg, default 8), `glare` (bool, default true), `className` | 3D mouse-tilt card with moving glare | every marketing page + `BlogGrid` |
| `Parallax.js` | `children`, `speed` (default 0.3; 0.2 subtle, 1 same as page), `className` | Scroll-driven Y translation (rAF-based) | every marketing page |
| `BlogGrid.js` | `posts` (plain post metadata — no components) | Filterable blog grid with category chips | `/blog` |
| `DemoRequestForm.js` | *(none)* | Contact/demo form → `POST /api/leads` (includes honeypot + success/error states) | `/contact` |
| `NewsletterForm.js` | *(none)* | Blog newsletter signup → `POST /api/newsletter` | `/blog` |

> The marketing pages follow one consistent recipe: `SiteNav` → sections wrapped in `Reveal` (for entrance) + `TiltCard` (for hover 3D) + `Parallax` (for background depth) → `SiteFooter`. To style a new marketing section, copy this pattern from any page.

---

## 📱 PWA ("Install the app")

The app is a **Progressive Web App** — installable on Android (Chrome) and Windows (Edge/Chrome) like a native app, no app store.

| File | Role |
|---|---|
| `public/manifest.webmanifest` | App name, icons, `standalone` display, shortcuts |
| `public/sw.js` | Service worker — network-first with offline shell |
| `public/icons/` | `icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon` |
| `src/components/PwaRegister.js` | SW registration (runs in dev AND production) |
| `src/components/InstallPwaButton.js` | Shows the install button when the browser supports it |
| `src/app/download/page.js` | The public install-instructions page |
| `src/app/layout.js` | Links the manifest + icons in `<head>` |

> Testing install locally: open the dev URL in Chrome/Edge — the address-bar install icon appears once the SW is active. On a real Android phone you need **HTTPS** (localhost counts, LAN IPs don't).

---

## 🛠️ "How do I change…" Cookbook

**Change the grading scale** (e.g. A = 75+)
→ Edit `computeGrade()` in `src/lib/grading.ts`. That's the single source of truth — everything (UI, report cards, standings) uses it.

**Add a new subject to the dropdowns**
→ Edit `DEFAULT_SUBJECTS` in `src/lib/grading.ts`, or set `EDUTRACK_SUBJECTS=Maths,English,...` in `.env.local` (comma-separated).

**Add a field to students** (e.g. "Date of birth")
→ 1) `src/models/User.js` (Mongo schema), 2) `src/lib/demo-store.js` seed + `createUser`, 3) `src/lib/mongo-store.js` `createUser`/queries, 4) the create/edit modal in `admin/dashboard/page.js`, 5) anywhere the field is displayed.

**Change a school's branding color / logo**
→ In the admin dashboard's Overview tab (or onboarding). Stored on the School record (`brandColor`); the report card and dashboards read it via `session.school.brandColor`. Default blue is `#2563EB`.

**Edit the report card layout (logo position, signature blocks)**
→ `src/components/ReportCard.js`. The user asked for the school logo on the lower right — it's there.

**Change the fee confirmation flow**
→ Payment lifecycle lives in `recordFeePayment` / `confirmFeePayment` (both stores) + `src/app/api/parent/pay/route.js` (creates PENDING) + `src/app/api/fees/payments/route.js` (PATCH confirms) + the pending-panel UI in `admin/dashboard/page.js`.

**Add a brand-new API endpoint**
→ Create a folder under `src/app/api/` with a `route.js`; use `getSession`, `jsonError`, and `store.*`. Restart nothing — App Router picks it up.

**Add a new marketing page**
→ Create `src/app/<name>/page.js` (copy a simple one like `pricing/page.js`), add it to `SiteNav.js` `LINKS` and optionally `SiteFooter.js` `COLUMNS`.

**Change what teachers can do**
→ Role gates live in each API route (`session.role === "TEACHER"`). The teacher dashboard UI is `src/app/teacher/dashboard/page.js`.

**Change the demo data** (fake school, students, scores)
→ The `seed()` function at the top of `src/lib/demo-store.js`. Restart the dev server to reload it.

**Change marketing copy / testimonials / stats**
→ All hardcoded arrays at the top of `src/app/page.js` (`modules`, `steps`, `testimonials`, `stats`).

---

## 🔐 Environment Variables

Copy `.env.example` → `.env.local` to customize:

| Variable | Purpose | Default |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string. **If unset → demo mode.** | *(demo mode)* |
| `JWT_SECRET` | Signs session tokens | `edutrack-dev-secret-change-in-prod` |
| `EDUTRACK_SUBJECTS` | Comma-separated custom subject list | built-in list |
| `NEXT_PUBLIC_*` | (none currently used) | — |

---

## 🚀 Running & Validating

```bash
npm install        # first time
npm run dev        # http://localhost:3000 (or your configured port)
npm run build      # production build — catches import/route errors
npm run lint       # eslint
npm run start      # serve the production build
```

**Demo accounts (no DB needed):**
| Portal | Email | Password |
|---|---|---|
| Super Admin | `admin@edutrack.app` | `admin123` |
| Teacher | `a.okafor@edutrack.app` | `teacher123` |
| Student | `k.adebayo@edutrack.app` | `student123` |
| Parent | `p.adebayo@edutrack.app` | `parent123` |

**Sanity checklist after editing:**
1. `npm run build` — green? (catches bad imports, missing files, route errors)
2. `npm run lint` — clean?
3. If you touched a store function — did you update **both** stores?
4. If you touched an API route — is it tenant-scoped (`session.schoolId`) and role-gated?
5. Test the flow in the browser with a demo account, and ideally register a fresh school and repeat the flow there (new schools start with zero data — great for catching empty-state bugs).

---

## Maintenance conventions

- **Defense document (standing rule):** after EVERY code change, append the change to the
  Changelog in `docs/Project-Defense-Document.md` (with today's date), update any affected
  sections, then run `npm run defense-docs` to regenerate
  `docs/Project-Defense-Document.pdf` / `.docx`.

*Last updated: August 2026. If something in the app moved, trust the code — but this map shows you exactly where to look.*
