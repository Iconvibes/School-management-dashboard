# Future Features — EduTrack

**Documentation only.** Nothing here is implemented, and none of it should be
started before the product has been validated with real schools. Each item
names the trigger that would justify building it.

---

## From TECH_DEBT.md (the durable items)

- **Mongo implementations for platform stubs** — webhook dispatch records,
  platform alerts, audit trail, impersonation sessions, and digest history in
  `src/lib/mongo/platform.js` and `src/lib/mongo/auth-tokens.js` currently
  return empty arrays / null when running on Mongo. Needed the day the first
  real customer runs on `MONGODB_URI`. Contract signatures are pinned by
  `tests/dual-store-contract.test.js`.
- **Login queue for the 08:00 burst** — rate limiting, Redis caching, native
  bcrypt and the per-school bucket are shipped (see
  `EduTrack-Traffic-Audit.md`); the last-mile defense is a bounded admission
  queue in front of login for pathological spikes.
- **Paginated admin roster** — `/api/users` supports `?limit&offset`; the
  admin console still loads the whole roster. Flip to paged fetches when a
  school approaches ~1–2k students (docs/scaling.md).

## Natural next steps observed while hardening

- **Conflict-scan push instead of pull** — the daily scan runs in-process per
  server instance. If EduTrack ever runs multi-region, move the fixed-hour
  scan to a single scheduled worker (or Mongo change streams) so scans happen
  exactly once per tenant per day regardless of instance count. The
  `isScanDue` policy already makes today's design idempotent, so this is an
  optimization, not a correctness fix.
- **Attendance day-summary endpoint** — parents/students currently derive
  attendance views from stored registers; a precomputed per-student summary
  (month/term percentages) would let the parent portal render richer trend
  charts without scanning registers client-side.
- **Fee reminder scheduling** — reminders are admin-triggered today; a
  digest-time scheduler (same pattern as the conflict-scan ticker) could
  auto-send reminders N days before term end for schools that opt in.
- **Report-card PDF per student on demand** — bulk PDF generation exists
  (`/api/reports/bulk`); a single-student "Download my report card" button on
  the parent portal is a thin reuse of the same pipeline.

## Larger bets (only after customer validation)

- **Term rollover automation** — the schema already carries session/term on
  scores, attendance, fees and archive models; a guided "close the term"
  wizard (archive → promote arms → seed next-term fee structures) would
  remove the most manual admin chore.
- **Parent mobile app (PWA install-first)** — the PWA/offline stack exists;
  a parent-focused install flow with push-first notifications (VAPID keys
  already supported) is a packaging exercise, not new backend.
- **Multi-branch analytics** — `Branch.js` model exists; cross-branch
  dashboards (attendance, fees, performance) for school groups.
- **SSO for partner schools** — Google Workspace / Microsoft Entra sign-in
  for staff accounts, with the existing role system mapped from groups.
- **Payments: Paystack subscriptions autopilot** — webhook handling and
  plan activation exist; add automatic plan downgrade/pause workflows on
  `subscriptionStatus` transitions (the states are already modeled).
