# Presentation Readiness — EduTrack

Status date: **28 September 2026** (evening before school visits).
Verification was run on this machine (Windows 11, Git Bash, Node v24.16.0) against
the current `main` working tree, demo mode (`MONGODB_URI` unset,
`SEED_DEMO_SCHOOL=1` in `.env.local`).

Re-run everything below with the listed commands before each demo day.

---

## Environment

- [x] **install works** — `npm install` (dependencies already vendored in `node_modules`; lockfile present)
- [x] **environment setup documented** — README "Demo mode" section + `.env.example` (now documents `SEED_DEMO_SCHOOL=1`; earlier README wrongly claimed the seed was on by default)
- [x] **demo seed works** — verified from a clean slate: stopped the dev server, deleted the persisted `.demo-data/store.json` snapshot, rebooted → exactly one school, "Greenfield International School", on `/api/schools`; the platform pseudo-school is correctly hidden from the login page
- [x] **app starts** — `npm run dev` → "Ready in 2.7s" on port 3000
- [x] **production build works** — `npm run build` (Turbopack) → all routes compiled, no errors

> ⚠️ Before every demo: confirm `SEED_DEMO_SCHOOL=1` is still in `.env.local`.
> If the login page ever shows "No school found", this is the reason. To reset
> the demo data to a pristine seed: stop the server, delete `.demo-data/`,
> restart.

## Quality

- [x] **lint passes** — `npm run lint`: **0 errors**, 23 pre-existing warnings (`no-img-element`, `no-location-assign-relative-destination`, `exhaustive-deps` in untouched files). All 36 former `react-hooks` errors (TDZ, set-state-in-effect, purity, refs, memoization) were fixed for real — no suppressions — including a new purity-safe [useNow](../src/hooks/useNow.js) clock hook replacing render-time `Date.now()` calls
- [x] **TypeScript check passes** — `npx tsc --noEmit` → 0 errors
- [x] **unit/integration tests pass** — `npm test` → **949/949** (265 suites), including the previously flaky timetable "STALE health read" test (root-caused and fixed — see TECH_DEBT entry)
- [x] **E2E tests pass** — `npm run test:e2e` (Playwright/Chromium vs live dev server) → **48/48** across three specs: the original 10 login/dashboard tests; `tests/e2e/flows.spec.js` (10) covering the five demo flows end to end — **A** student lifecycle (admin adds student → roster → teacher's grading matrix), **B** fees (part payment → receipt recorded → balance still Outstanding), **C** attendance (mark register → save → reload → marks persist), **D** results (teacher enters scores → student signs in with the auto-generated credentials → sees results; parent sees the report card), **E** timetable (slot re-save → conflict scan clean → persists across reload), plus sign-out; and `tests/e2e/security.spec.js` (28) covering cross-role access denials, tenant isolation and session expiry (details below). Sessions are seeded via the login API (`page.request`) because dev-mode Fast-Refresh remounts can wipe form state and trip the client me-gate mid-test; the login UI itself stays covered by login-and-dashboard.spec.js and Flow D's typed student sign-in. Passing 2/2 consecutive full-suite runs (`--workers=1`)
- [x] **pre-demo reset available** — `npm run reset-demo` wipes all test-run artifacts from the demo store (the E2E flows/security specs deliberately write real data: extra "Zara Okafor <stamp>" students, test payments, a second tenant) and backs it up to `.demo-data/store.json.bak`; the next `npm run dev` boot reseeds pristine. Guards: refuses to run while the server is up (its in-memory state would resurrect the junk), refuses under MONGODB_URI, and verifies `SEED_DEMO_SCHOOL=1` is set (without it the next boot has NO school at all). **Run it after any E2E session and before presenting**
- [x] **security E2E (`tests/e2e/security.spec.js`, 28 tests)** — ① cross-role page denials: every wrong role × every portal (12 pairs) is bounced by the Next 16 proxy and lands on their own role home (never the requested portal); anonymous + tampered/wrong-secret tokens rejected; ② policy-layer denials: student/parent/teacher sessions blocked from admin/platform data APIs (401/403/404, no data in bodies), unauthenticated 401s, student timetable read proven arm-scoped, conflicts scan SUPER_ADMIN-only; ③ tenant isolation with a REAL second tenant (registered via `/api/auth/register` + platform-approved via `/api/platform/approvals`, deterministic identity reused across runs to respect the 5/hour register limiter): tenant B cannot PATCH school A's users (verified the mutation truly didn't land), cannot read A's reports or write scores (403 from the tenant check, not validation), and its browser sessions render zero school-A content; ④ session lifecycle: expired-JWT, garbage and wrong-secret cookies bounce pages AND 401 APIs, logout clears the session everywhere, cookie pinned HttpOnly + SameSite=Lax/Strict
- [x] **E2E hardening pass fixed four real product bugs** (found by writing the flows spec): ① admin dashboard bounced valid sessions to /login when meData and loading landed in the same commit (the gate read a `session` copy that hadn't re-rendered yet) — now coalesces with the hook state; ② FeeContext exposed state without setters, so every fee modal input silently no-oped and Record-payment recorded the FULL prefill balance instead of the typed amount; ③ teacher dashboard mapped legacy seed scores (`caScore: 34`) into the CA1 box (max 10) making rows unsavable — legacy rows now keep their total and save through the legacy path; ④ timetable grid derived day timelines from abbreviated keys ("Mon") while data/grid use full names ("Monday"), rendering every day as "0 periods". Also: the PWA service worker no longer caches auth-bounced HTML (poisoned offline fallbacks) and skips static cache-first on localhost; Playwright blocks service workers so tests exercise the network, not the offline layer
- [x] **no known unexplained failures** — every failure found during this pass was root-caused and either fixed or reclassified (see TECH_DEBT.md)

## Role verification (via live API probes + E2E + full test suite)

| Role | Login | Dashboard | Role gates | Result |
|---|---|---|---|---|
| Super Admin | `admin@edutrack.app` / `admin123` | `/admin/dashboard` renders (E2E) | users/fees/attendance/timetable all pass | ✅ verified |
| Registrar | `registrar@edutrack.app` / `registrar123` | shares admin console | roster read OK; scan 403 | ✅ verified |
| Bursar | `bursar@edutrack.app` / `bursar123` | shares admin console (fees) | roster read OK (by design, for reconciliation); edits gated | ✅ verified |
| Teacher | `a.okafor@edutrack.app` / `teacher123` | `/teacher/dashboard` renders (E2E) | roster read OK (their classes); users **API** open to staff roles by design — writes separately gated | ✅ verified |
| Student | `k.adebayo@edutrack.app` / `student123` | `/student/dashboard` renders (E2E) | users API 403, timetable scan 403 | ✅ verified |
| Parent | name login "Mrs. Folake Adebayo" + child's name as password | `/parent/dashboard` renders (E2E) | users API 403 | ✅ verified |
| Platform Admin | `platform@edutrack.app` / `platform123` at `/platform/login` | separate portal | school-admin token on platform API → 403 | ✅ verified |

Also verified live: bad password → 401, unknown user → 401, missing
credentials → 400, no-cookie request to `/api/users` → 401, unauthenticated
platform API → 401.

## Security

- [x] **tenant isolation verified** — `tests/tenant-isolation.test.js` (8 negative cross-school cases) + `tests/security-fixes.test.js` (7) + `tests/parent-name-ambiguity.test.js` (3) all green
- [x] **role isolation verified** — matrix above; `bypassTenantScope()` usage audited previously (22 legitimate by-id call sites)
- [x] **protected APIs verified** — 116 route files run through `requirePermission`/`requireClassScope` policy layer (spot-verified live)
- [x] **secrets checked** — `git ls-files` scanned for `sk-…`, `pk_live_…`, `AIza…`, `ghp_…`, `xox…`, PEM blocks, Paystack secret patterns: **no real secrets tracked**. `.env.local` is gitignored and holds only dev JWT/enc keys + VAPID keys. `.env.example` contains placeholders only

## Browser (Playwright Chromium)

- [x] **no uncaught console errors** — E2E asserts zero `is not defined` / `is not a function` page errors per portal; all 4 passed
- [x] **no critical network errors** — dashboards render through successful API fetches (student scores verified to return 5 seeded subjects after the dashboard fix)
- [x] **no hydration errors** — none observed in dev logs or E2E
- [x] **no broken routes** — `next build` compiles every route; login, 4 dashboards, platform login exercised live

## Presentation

- [x] **demo login works** — school → role → submit flow covered by E2E for all four school portals
- [x] **demo data is realistic** — Greenfield seed: 12 class arms, 16 teachers, 16 students, fees, payments, attendance (last 20 school days), scores, full timetable (240 entries); student report card shows a 78.6 average
- [x] **core workflows work** — see flow table below
- [x] **no embarrassing broken states** — junk "Test Academy"/"Fake Academy" schools wiped from the persisted demo snapshot; student dashboard no longer claims "No scores have been recorded yet" when results exist
- [x] **presentation assets organized** — deck/flyer/brochure/audit-HTML/QA/captions exports moved to `docs/presentation/`; `EduTrack-Traffic-Audit.md` intentionally stays at repo root (referenced by 4 tracked docs + `.env.example` + `k6/load-test.js`)

## Verified end-to-end flows (live API, seeded demo school)

| Flow | Steps executed live | Result |
|---|---|---|
| **A — Student lifecycle** | admin creates student → appears in class roster → teacher sees the student → admin deletes → roster confirms gone | ✅ PASS |
| **B — Fees** | admin reads fee structures (12 arms) → reads full fee ledger (17 rows incl. pending balances) | ✅ PASS |
| **C — Attendance** | teacher marks register → read-back shows exact marks (marked=1/2, then full register 2/2) → **server restarted** → marks still present (snapshot persistence) | ✅ PASS |
| **D — Results** | student's own scores API returns 5 subjects, avg 78.6, with remarks; dashboard renders them (fixed) | ✅ PASS |
| **E — Timetable** | 240 seeded entries load → invalid slot write rejected 400 → admin health read OK; conflict scan job covered by 949 unit tests (63 timetable + 19 scheduler) | ✅ PASS |

## Pre-demo checklist (run on the demo machine)

```bash
npm install
npm run build        # optional but recommended
npm test             # expect 949/949
npm run test:e2e     # needs dev server on :3000; expect 10/10
# .env.local must contain: SEED_DEMO_SCHOOL=1
npm run dev
# login page → only "Greenfield International School" should be listed
```
