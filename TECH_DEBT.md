# Tech Debt & Architectural Trade-offs

Living document — append new entries at the top of each section with the date.
Run `npm run defense-docs` after editing to regenerate the defense document PDF.

---

## Architecture Trade-offs

These are deliberate design decisions. They're not bugs — they're the price of
shipping. Revisit each one when the triggering constraint changes.

### 1. Dual-store architecture (demo ⇄ Mongo)

**Decision:** Two data-access layers (`demo-store.js` and `mongo-store.js`) with
identical function signatures, swapped at runtime by `src/lib/store.js`.

**Why:** Development speed. Anyone can run the app with zero infrastructure — no
MongoDB, no Docker, no seed scripts. The demo store seeds a realistic Nigerian
school with 16 teachers, 16 students, a collision-free timetable, and fee data.

**Cost:**
- Every store function must be implemented twice. A signature drift causes
  "works in demo but not Mongo" bugs that are hard to diagnose.
- The `dual-store-contract.test.js` (214 lines) locks the contract, but it
  only tests function *signatures*, not behavioral edge cases.
- The demo store's `seed()` function is ~300 lines including the König
  timetable generator — it's been extracted to `src/lib/konig.js` but the
  seed orchestration is still inline.

**When to revisit:** If you ever need a third store (e.g. SQLite for
self-hosted), extract a shared interface/contract definition that both stores
implement.

**Files:** `src/lib/demo-store.js`, `src/lib/mongo-store.js`, `src/lib/store.js`

---

### 2. Pure JavaScript (no TypeScript) — GRADUAL MIGRATION STARTED

**Decision:** The codebase is primarily `.js`/`.jsx` with `jsconfig.json` path
aliases. TypeScript is now available (`tsconfig.json`, `typescript` in devDeps).

**Why:** Faster prototyping. The team moves faster without a build-step type
system, and JSDoc annotations on key functions (policy.js, grading.js,
permissions.js) provide the most important type documentation.

**Progress (August 2026):**
- `src/lib/grading.js` → `grading.ts` — full type annotations, 128 lines
- `src/lib/ranking.js` → `ranking.ts` — 5 interfaces + 4 typed functions, 93 lines
- `tests/register-aliases.js` handles `.js` → `.ts` remapping for test suite
- Build compiles clean with Turbopack

**Cost:**
- No compile-time catches for prop-drilling mismatches, wrong API shapes, or
  misspelled store function names.
- The dual-store contract is enforced only by a test, not by a shared type.
- New contributors can't rely on IDE autocomplete for the full request flow.

**When to revisit:** Continue gradual migration of `src/lib/` modules. The
grading → ranking import chain is the proof-of-concept; follow the same
pattern for `timetable.js`, `permissions.js`, `policy.js`.

---

### 3. Admin dashboard state management — RESOLVED

**Decision:** All admin dashboard state lives in `src/app/admin/dashboard/page.js`
and is threaded to 19 tab components via React Context.

**Resolution (August 2026):** The page was broken into:
- **page.js** (~998 lines) — thin layout shell: state declarations, data-fetch
  effects, `useAdminActions()` call, role gates, and JSX.
- **useAdminActions.js** (1,302 lines) — all 30+ action functions extracted
  into a custom hook, organized by domain (fee, user CRUD, timetable, bell
  schedule, term rollover).
- **19 tab components** in `src/components/admin/` — presentational, consuming
  state via `useAdminShell()` context.
- **12 modals** in `src/components/admin/modals/` — each wrapped in
  `<ErrorBoundary>`.
- **tabConfig.js** — visible tabs computation.

**Remaining cost:**
- Every context value change still re-renders all 19 tabs (React Context
  doesn't support selector-based subscriptions).
- State for fees, timetable, reports, users, and school lifecycle all live in
  the same useState stack in page.js.

**When to revisit:** Split into domain-specific contexts (FeeContext,
TimetableContext) or migrate to `useReducer` + context for coarser updates.
The `src/components/admin/context/AdminContext.js` JSDoc already groups the
values by domain — that's the natural split line.

**Files:** `src/app/admin/dashboard/page.js`, `src/components/admin/useAdminActions.js`, `src/components/admin/context/AdminContext.js`

---

### 4. Client-side state for server-authoritative data

**Decision:** Dashboard pages fetch data via `useTabFetch` and hold it in local
state. Mutations update the local state optimistically, then refresh from the
server.

**Why:** Instant UI feedback. The payroll toggle, fee toggle, and timetable
cell edits all flip the badge immediately and revert on failure.

**Cost:**
- Stale state if a different admin tab modifies the same data concurrently.
- The optimistic toggles (`pendingToggleRef`) guard against double-clicks but
  not against cross-tab conflicts.
- Fee ledger refresh after a payment is a manual re-fetch, not a real-time
  subscription.

**When to revisit:** Add SSE (Server-Sent Events) subscriptions for cross-tab
sync, or migrate to a client-side cache (SWR/React Query) that handles
revalidation automatically. The `src/lib/sse-manager.js` infrastructure is
already in place for notification broadcasting.

**Files:** `src/hooks/useTabFetch.js`, `src/lib/sse-manager.js`

---

### 5. Demo-store persistence on disk

**Decision:** The demo store snapshots in-memory state to `.demo-data/store.json`
after every mutation (debounced, atomic rename).

**Why:** Dev-server hot-reloads used to wipe all demo data. Now a 900-student
import survives a restart.

**Cost:**
- The snapshot is JSON — no encryption at rest (passwords are bcrypt-hashed,
  but the snapshot file is plaintext on disk).
- The `restore()` function has 20+ backward-compatible migrations for legacy
  snapshot formats.
- Under `node --test`, the snapshot goes to a temp path — this is correct but
  fragile if a test process crashes mid-write.

**When to revisit:** When demo mode is no longer the primary development
environment. Production ships a clean slate (`SEED_DEMO_SCHOOL` is off by
default), so this infrastructure exists solely for dev convenience.

**Files:** `src/lib/demo-store.js` (lines 40–160)

---

## Known Limitations

Things that work correctly but have known constraints.

### L1. Teacher subject assignment is additive only

A teacher's `subjects` and `assignedClasses` arrays can grow through the scope
editor, but removing a subject from a teacher who already has scores for it
creates orphaned score records. The API doesn't cascade-delete or warn.

**Mitigation:** The scope editor shows a warning that changes take effect
instantly. The timetable conflict scanner flags scope violations after the fact.

### L2. Parent login is name-based, not email-based

Parents sign in with their full name (case-insensitive) and their child's name
as the password. This works for small schools but creates collision risk at
scale — two parents named "Mrs. Adebayo" would shadow each other.

**Mitigation:** The link-parent modal has duplicate detection (name + phone).
The `findParentByName` helper in the dashboard enforces uniqueness.

### L3. Fee structures are per-class-arm, not per-student

A student who transfers mid-term keeps the old arm's fee structure. There's no
prorating or adjustment mechanism — the admin must manually reconcile.

**Mitigation:** The fee ledger shows the full picture (billed, paid, balance,
carryover). The audit trail records every adjustment.

### L4. Timetable generation is demo-only

The König's edge-coloring algorithm (`src/lib/konig.js`) generates a valid
timetable in the demo seed. In production, the admin builds the timetable
manually through the grid editor. There's no "auto-fill" button for real
schools.

**Mitigation:** The conflict scanner (`/api/timetable/scan`) catches problems
after manual edits.

### L5. Report card PDF is client-side only

The PDF export uses jsPDF + html2canvas in the browser. There's no server-side
PDF generation, so bulk printing (e.g. "export all report cards for this arm")
isn't possible — each card must be opened and downloaded individually.

**Mitigation:** The `ReportCardModal` component renders at full A4 resolution
for print-quality output. A server-side pipeline would need a headless browser
(Puppeteer/Playwright) and is tracked as a future enhancement.

---

## Intentional Shortcuts

These were done for speed and should be revisited when the code stabilizes.

### S1. `console.warn` cleanup (August 2026)

All 27 raw `console.warn`/`console.error` calls were migrated to the
structured logger (`src/lib/log.js`). The logger delegates to `console.*` in
dev and is swappable for production logging. **No production logging pipeline
is configured yet** — the `isDev` gate means production calls are silently
swallowed.

**Action:** When deploying to production, wire `log.warn`/`log.error` to a
structured logging service (e.g. Datadog, BetterStack, or a simple JSON stdout
emitter).

### S2. Demo seed edge-coloring extraction (August 2026)

The König's algorithm was extracted to `src/lib/konig.js` with 17 tests, but
the demo seed's *orchestration* (building weekly plans, assigning days to arm
groups, the verification harness) remains inline in `seed()` (~200 lines).

**Action:** Extract the weekly-plan builder and the verification harness into
separate functions or a `src/lib/timetable-generator.js` module.

### S3. Admin tab extraction (August 2026) — RESOLVED

19 tab components were extracted from the admin dashboard page. The context
was expanded to eliminate prop drilling. All 30+ action functions were
extracted into `useAdminActions.js` (1,302 lines). 12 modals were moved
to `src/components/admin/modals/`. page.js is now ~998 lines.

**Remaining:** Split into domain-specific contexts or a `useReducer` pattern
when a new tab is added or an existing tab needs complex local state.

### S4. No E2E tests — IN PROGRESS

Playwright infrastructure is set up (`playwright.config.js`, `tests/e2e/`).
Login flow tests exist for admin, teacher, student, and parent dashboards.

**Remaining:**
- Admin: add student → grade → report card → PDF
- Parent: login → view child → pay fee
- Teacher: login → mark attendance → enter scores

### S5. Marketing site is not lazy-loaded

The marketing pages (home, features, pricing, etc.) are full client components
with heavy animation libraries (Reveal, TiltCard, Parallax). They're bundled
with the main app chunk.

**Action:** Use `next/dynamic` with `ssr: false` for marketing-only components,
or split into a separate route group with its own layout.

---

## Open Questions

Design decisions that haven't been finalized.

### Q1. Should the demo store be replaced with a local database?

Options:
- **Keep in-memory** — simplest, no deps, dev-only. Risk: the persistence
  layer is 120 lines of snapshot/restore logic.
- **SQLite** — lightweight, file-based, no server. Would unify the dual-store
  contract but adds a native dependency.
- **Keep both** — demo store for zero-config dev, Mongo for production. This
  is the current approach.

### Q2. Should the admin dashboard use a state manager? — PARTIALLY RESOLVED

The action functions were extracted to `useAdminActions.js`, but all state
still lives in the page's useState stack. Options:

- **React Context (current)** — simple, no deps. Re-renders all tabs on any
  change.
- **Zustand/Jotai** — lightweight, selector-based subscriptions. Would fix the
  re-render issue without a full Redux setup.
- **useReducer + Context** — no new deps, coarser updates. Good middle ground.

### Q3. Should the dual-store contract be enforced by types? — IN PROGRESS

The first two TypeScript files (`grading.ts`, `ranking.ts`) prove the approach.
Options:

- **Keep as tests** — the `dual-store-contract.test.js` catches signature
  drift. But it only checks function names, not return shapes.
- **Add JSDoc `@returns` types** — lightweight, no build step. Catches shape
  drift in IDEs.
- **Migrate to TypeScript** — full compile-time safety. Gradual migration of
  `src/lib/` is underway (`grading.ts` + `ranking.ts`). Follow this pattern
  for the remaining library files.

---

## New Entries (August 2026)

### N1. Responsive grid gaps in admin tabs

Several admin tab components had `grid-cols-N` without responsive breakpoints,
meaning the grids broke on mobile. Fixed:
- `ClassesTab.js`: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`
- `RiskAlerts.js`: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`
- `EngagementTab.js`: `sm:grid-cols-5` → `sm:grid-cols-3 lg:grid-cols-5`
- `ComplianceTab.js`: `overflow-hidden` → `overflow-x-auto`

### N2. Admin navigation reordered and themed

Sidebar nav links reordered by importance (daily essentials at top). Each tab
gets a distinct gradient theme (blue for Timetable, emerald for Fees, purple
for Reports, etc.). Active tab gets a blue highlight + glowing dot indicator.

---

## Severity Guide

When adding new entries, tag them:

| Tag | Meaning |
|-----|---------|
| 🔴 **Must fix before v1.0** | Blocking for production launch |
| 🟡 **Should fix soon** | Causes developer friction or risk |
| 🟢 **Nice to have** | Improvement but not urgent |
| ⚪ **Documented trade-off** | Intentional — revisit when constraints change |

Current status: no 🔴 items. The architecture is sound for a v1.0 launch.
The admin dashboard is now a thin layout shell (74% reduction from 3,770 to
998 lines). TypeScript proof-of-concept is in place (2 files). E2E test
infrastructure exists. The main remaining risks are operational (no production
logging pipeline) rather than architectural.

---



### N3. Platform admin module (August 2026)

A complete platform administration layer was added at `/platform/`, entirely
separate from the school admin portal. Features include:

- **Platform Admin login** (`/platform/login`) -- separate from school login,
  not visible to schools.
- **School directory** (`/platform/schools`) -- list all tenants with status,
  plan, student/teacher counts. Click to drill into per-school detail.
- **School detail page** (`/platform/schools/[id]`) -- enrollment chart with
  click-to-drill-down, revenue history, revenue forecast with confidence bands,
  activity timeline, admin accounts with impersonate buttons.
- **Audit log** (`/platform/audit`) -- cross-tenant audit trail.
- **Alerts** (`/platform/alerts`) -- platform-wide notification center.
- **School comparison** (`/platform/compare`) -- overlay two schools trends.
- **Settings** (`/platform/settings`) -- digest preferences, webhook config.
- **Impersonation** -- lets platform admin act as a school admin with timeout.
- **Billing enforcement** -- subscription lifecycle management.
- **Webhook system** -- Slack/Discord/generic format, auto-dispatch.
- **Digest email** -- responsive HTML, auto-send via cron.

**When to revisit:** Platform store functions need real Mongo implementations.

**Files:** `src/app/platform/`, `src/app/api/platform/`, `src/modules/platform/`
`src/lib/platform-digest.js`, `src/models/PlatformAlert.js`, `src/models/AuditLog.js`

---

### N4. Digest email responsive template (August 2026)

Rewritten for mobile-first responsive design: viewport meta, @media queries,
dark mode support, Outlook MSO conditionals, role=presentation on tables,
stat-cell/header-pad/health-row CSS classes, two-column footer with CTA.

**Files:** `src/lib/platform-digest.js`

---

### N5. Demo schools for multi-tenant preview (August 2026)

Three additional demo schools seeded: Sunshine Academy, Lagos Heritage School,
Prestige College Abuja. Internal school filtered from public directory.

**Files:** `src/lib/demo-store.js`, `src/modules/school/store.js`

---

### N6. Impersonation system (August 2026)

Platform admins can impersonate any school admin for support. Includes
configurable timeout, countdown banner, auto-redirect, full audit logging.
Known issue: client-side me-gate timing during cookie propagation.

**Files:** `src/app/api/platform/schools/[id]/impersonate/route.js`,
`src/components/ImpersonationBanner.js`, `src/lib/token.js`

---

*Last updated: August 2026. Add new entries at the top of each section.*
