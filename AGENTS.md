<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

## Environment & Seeding

- **`SEED_DEMO_SCHOOL=1` must be in `.env.local`** for the demo school to exist. The README claims it's on by default in dev, but the code (`demoSeedEnabled()` in `demo-store.js`) requires the env var to be explicitly `"1"`, `"true"`, or `"yes"`. Without it, login shows "No school found" and no accounts are seeded.

## Build & Test

- **`node --test` can't resolve `@/lib/*`** — the `@/` path alias is a Next.js bundler feature. Tests that import from `@/lib/` fail with `ERR_MODULE_NOT_FOUND` unless run with `--import ./tests/register-aliases.js` (which only `tests/register-aliases.js` sets up). Only tests importing via relative paths (e.g. `../src/lib/permissions.js`) work with plain `node --test`.
- **`register-aliases.js` hook quirk: CJS vs ESM** — When the hook intercepts an extensionless relative import (e.g. `./grading`) and returns a `file://` URL, the CJS loader (invoked for files where Node doesn't detect ESM) crashes with `ERR_INVALID_ARG_TYPE`. Fix: only intercept when a `.ts`/`.tsx` file exists; otherwise fall through to `nextResolve` so the CJS loader handles `.js` natively. This was hit when `ranking.js` (CJS context) imported `./grading` (now `.ts`).
- **Next.js auto-assigns a port when 3000 is occupied** — `next dev` picks a random high port (e.g. 57921, 59093). The actual URL is printed in the console output; don't assume port 3000.
- **`npm run lint` is slow (60s+)** — use `npx eslint <specific files>` to lint individual files quickly.

## Architecture & Gotchas

- **Admin dashboard has two undeclared `useState` variables**: `roleConfirm` and `printSheet` are used in JSX (`page.js` ~line 3330 and ~line 3753) but were never declared with `useState`. These cause runtime `ReferenceError` when the dashboard renders. Both must be declared in the state block near the other `useState` calls.
- **`src/lib/log.js` — `isDev` must be a function, not a const** — `const isDev = process.env.NODE_ENV !== "production"` evaluates once at module load. In test environments or when NODE_ENV changes between imports, this gives stale results. Use `const isDev = () => process.env.NODE_ENV !== "production"` so it reads at call time.
- **Windows: `taskkill /PID` breaks in Git Bash** — Git Bash translates `/PID` to a Windows path. Use `powershell -NoProfile -Command "Stop-Process -Id <pid> -Force"` instead.
- **Admin dashboard `page.js` was ~3770 lines, now ~998 lines (74% reduction)** — 19 tab components, 12 modals, tab config, ScheduleHealthCard, and all 30+ action functions were extracted. Actions live in `useAdminActions.js` (1,302 lines), modals in `src/components/admin/modals/`, tabs in `src/components/admin/`. The page is now a thin layout shell: state declarations → data-fetch effects → `useAdminActions()` call → role gates → JSX. All modals use `useAdminShell()` context. The `AdminProvider` value must list every key a tab or modal destructures.
- **Multi-teacher-per-subject is real** — schools have more than one Maths teacher, more than one English teacher, etc. Basic schools can have multiple teachers assigned to the same subject. Any logic that assumes a unique teacher per subject (scope editor, timetable, report cards, attendance) must handle duplicates.
- **Dashboard layout nesting trap (`<main className="flex">`)** — Every dashboard (admin, teacher, student, parent) uses `<main className="flex">` with `<Sidebar>` (fixed-position) + a content `<div className="min-w-0 flex-1 lg:pl-64">`. All page content (inline sections, not portaled modals) MUST be inside that content `<div>`. Placing components outside it (after its closing `</div>`) makes them flex siblings of the content wrapper, causing duplicated columns, broken layouts, and the sidebar appearing on both sides. The parent dashboard had MessagingPanel, GDPR buttons, AttendanceCalendar, GradeTrends, and PaymentHistory outside the wrapper — fixed August 2026.
- **ErrorBoundary pattern** — `src/components/ErrorBoundary.js` is a React class component with `getDerivedStateFromError` + `componentDidCatch`. Every admin tab, modal, and each dashboard view section should be wrapped: `<ErrorBoundary label="Tab Name"><TabContent /></ErrorBoundary>`. The label appears in the fallback UI so users know which section crashed.
- **`useTabFetch` data starts as `null`, not `undefined`** — Destructuring `{ data: foo = [] }` only provides the default for `undefined`. If the API hasn't responded yet or fails, `data` is `null` and `foo.map()` crashes. Use `(foo || [])` for null-safe iteration. This crashed `RolesTab.js` and is a risk in any component using `useTabFetch`.
- **TypeScript proof of concept** — `grading.ts` and `ranking.ts` are the first two TypeScript files. The `register-aliases.js` test hook handles `.js` → `.ts` remapping for both `@/` aliases and relative imports. CJS files (like `ranking.js` before conversion) that import extensionless relative paths need special handling in the hook to avoid `ERR_INVALID_ARG_TYPE`. Turbopack resolves `.ts` imports fine, but explicit `.js` imports of renamed files break — use extensionless imports.
- **Admin standalone pages need shared sidebar** — `Bulk Import`, `Quick Add`, and `From Class Sizes` were standalone pages without the admin sidebar. `AdminLayout.js` wraps them to provide persistent sidebar + topbar. Always use `AdminLayout` for new admin sub-pages.

## Files That Change Together

- `src/lib/demo-store.js` ↔ `src/lib/mongo-store.js` — any store function signature change must be mirrored in both, or "works in demo but not Mongo" bugs result. The `dual-store-contract.test.js` (214 lines) catches signature drift.
- `src/app/admin/dashboard/page.js` ↔ `src/components/admin/context/AdminContext.js` — the AdminProvider `value` prop must list every key a tab component destructures via `useAdminShell()`. Adding a new tab with new context keys requires updating both files.
- `src/lib/permissions.js` ↔ `src/lib/portal-guard.js` ↔ `src/lib/roles.js` — adding a role requires updating all three plus `src/models/User.js` enum, `src/lib/demo-store.js` seed, `src/app/login/page.js` ROLES list, and `src/components/Sidebar.js`. The full checklist is in README.md ("Adding a new role").
