# Scaling to 10,000 concurrent users

This runbook is the honest answer to *"is the software ready for 10,000 users
at once?"* — what is already strong, what was measured, what the real ceilings
are, and the exact steps to cross each one. Read it before a big rollout, and
re-run the load test (`npm run load-test`) after any change to the request
path.

---

## 1. What is already strong (measured in the code, not promised)

- **Indexed hot paths.** Every per-request lookup runs on an index: users by
  `schoolId + emailIdx` (unique), scores by `studentId + subject + classArm`
  (unique), notifications by `schoolId + createdAt`, fee payments by
  `schoolId + receiptNo`, attendance by `schoolId + classArm + date`, digest
  prefs by `schoolId + userId`. See `src/models/*.js`.
- **One pooled connection.** Mongoose connects once (global cache in
  `src/lib/db.js`); there is no per-request connect. Pool size, selection and
  connect timeouts are now env-tunable and fail fast (see §3).
- **Cheap stats.** Dashboards use `countDocuments` (index-counted) run in
  parallel — not full collection scans.
- **Cheap auth.** Sessions are JWTs re-validated against the store on every
  request (security, not performance — demotions and deletions take effect
  immediately). The re-validation uses `findAuthSnapshot`, a lean
  `select("role schoolId assignedClass")` read that **never loads or decrypts
  PII** — the old path decrypted email + phone on every single request.
- **Bounded data loads.** Ranking/report-card routes load only the *class arm*
  they need (`getScoresByClassArm`), not the whole school's score table. The
  parent portal builds a ledger only for its own children. The roster API
  supports `?limit=&offset=&total` paging.
- **Everything else from the security work:** encryption at rest, RBAC matrix,
  rate limits on public endpoints, self-verifying backups (see
  `docs/disaster-recovery.md`).

## 2. Measured baseline

Run against the **production build** (`next build` + `next start`), demo store,
single instance, on a development laptop — i.e. a *lower bound*. A Mongo-backed
deployment adds DB round-trips per request but makes the app stateless, which
is exactly what unlocks horizontal scaling.

| Endpoint (what it exercises) | Concurrency | Throughput | p50 | p99 | Errors |
|---|---|---|---|---|---|
| `/api/health` (server overhead) | 200 | **1,163 req/s** | 167ms | 296ms | 0 |
| `/api/auth/me` (full hot path: JWT → re-validation → data) | 200 | **985 req/s** | 198ms | 274ms | 0 |
| `/api/reports` (heaviest data load, arm-scoped) | 100 | **912 req/s** | 107ms | 166ms | 0 |
| `/api/auth/me` | 500 | 920 req/s | 535ms | 746ms | 0 |
| `/api/auth/me` | 1,000 | 981 req/s | 976ms | 2.7s | client-side only* |

\* At 1,000 concurrent clients the *server* returned 200 for every request it
received (0 HTTP errors) — the failures were client-side socket exhaustion
from a single Windows measurement rig (ephemeral ports / undici pool), not
server drops. Treat the ≥500-concurrent numbers as "this rig can't measure
more", not "the server degrades".

**The headline:** one production instance sustains **~1,000 req/s** with
sub-200ms p50 at sane concurrency. Dev mode (`next dev`) is ~10× slower and
is NOT a benchmark target.

**10,000 users at once → the math.** 10k concurrent *sessions* is not 10k
simultaneous *requests*. A typical user issues ~1 request per 5–10s (page
actions + a 30s notification poll). That puts a 10k-user school district at
**~1,000–3,000 req/s peak** — one instance sits right at the low end, **two
to four stateless instances comfortably cover it**. The per-school data
model keeps each request cheap: no request scans another tenant.

## 3. What shipped in this pass

- `src/lib/db.js` — `MONGODB_POOL_SIZE` (default 100), `serverSelectionTimeoutMS:
  5000`, `connectTimeoutMS: 10000`, and `autoIndex: false` when
  `NODE_ENV=production`.
- `scripts/ensure-indexes.mjs` (`npm run ensure-indexes`) — the explicit,
  non-destructive index build for deploys (creates missing indexes, never
  drops). **Run it once per deploy** — with autoIndex off in production, a
  missing `schoolId+emailIdx` unique index silently weakens dedupe.
- `src/lib/demo-store.js` / `mongo-store.js` — `findAuthSnapshot`,
  `getScoresByClassArm`, `getFeeLedger({ studentIds })`, `listUsers` paging +
  `countUsers`.
- `src/lib/policy.js` — `requireAuth` / `requireClassScope` on the snapshot.
- Routes — `reports`, `scores/student`, `reports/[studentId]` load arm-scoped
  scores; `parent/children` loads per-arm + per-child data; `users` GET
  supports `?limit`/`?offset` (cap 500) and returns `total`.
- `scripts/load-test.mjs` (`npm run load-test`) — the benchmark harness.

## 4. The remaining ceilings — and the exact step to cross each

| Ceiling | Where | Crossing step | When |
|---|---|---|---|
| **Demo store** (in-memory arrays, whole-file sync writes) | `src/lib/demo-store.js` | Set `MONGODB_URI`; demo mode is for demos and tests, never production | Before any real rollout |
| **Rate limiter** | `src/lib/rate-limit.js` | DONE: `checkRateLimit` is Redis-backed (shared per-IP/account/school budgets when `REDIS_URL` is set) with an in-memory fallback for demo/tests and Redis outages | — |
| **Notification polling: 30s × every admin** | `NotificationsBell.js` | Replace the poll with SSE/WebSocket push (or lengthen the interval) — at 10k users, 330 req/s of polling alone eats a third of one instance | ~3,000+ concurrent admins |
| **Roster tab loads the whole school** | admin dashboard → `GET /api/users` | The API now supports paging — flip the dashboard to `?limit=200&offset=` + `total`-aware UI | A school exceeds ~1–2k students |
| **Whole-school views** (`reports` with no `classArm`, stats) | `src/app/api/reports/route.js` | These are inherently whole-school; scope by arm in the UI, or move the school's aggregate to a precomputed rollup | 10k students in ONE school |
| **Mongo tier** | infra | Right-size Atlas/Mongo for the request profile; watch `serverSelectionTimeoutMS` 5s with an overloaded tier | Load-test against the real tier |

## 5. The 10k deployment shape (recommended)

```
Browser ──► CDN / WAF (caching for marketing pages)
              │
              ▼
        Load balancer (sticky NOT required — sessions are stateless JWTs)
              │
        ┌─────┴─────┐
        ▼           ▼
   app instance  app instance        (2–4 × `next start`, ~1k req/s each)
        │           │
        └─────┬─────┘
              ▼
        MongoDB (shared, indexed)
        + Redis (shared rate limits + caches, future SSE fan-out)
        + object storage (backups — see docs/disaster-recovery.md)
```

Sessions are signed JWTs with **server-side re-validation** — any instance can
serve any user with zero shared session state. That single property is what
makes horizontal scaling this clean.

## 6. Before you trust these numbers

1. Run `npm run ensure-indexes` against your real Mongo.
2. Set `MONGODB_URI` and re-run `npm run load-test` against the **real tier** —
   every request now includes a DB round-trip; the p50s here are the
   no-DB lower bound.
3. Use a production-grade load tool (k6 / wrk) with a realistic user mix
   (logins, dashboards, fee pages, notifications), not just the three smoke
   endpoints in `scripts/load-test.mjs`.
4. Watch four things under load: p95 (not p50), the error rate, the Mongo
   `currentOp` for slow queries, and the instance CPU (a ~1k req/s instance is
   event-loop bound — two instances is the cheap fix).
