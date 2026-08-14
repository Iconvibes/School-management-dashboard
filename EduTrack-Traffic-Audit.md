# EduTrack — Traffic Readiness Audit
**Scope:** 300+ schools · 300,000–1,000,000 students logging in at 08:00
**Auditor:** Senior DevOps / Backend Architect / Load Testing Engineer
**Method:** code audit of the full repo (stores, routes, models, auth, infra files) + existing measured baseline (`docs/scaling.md`, `scripts/load-test.mjs`) + load math.

> This audit is deliberately brutal. Where the code is good, it says so. Where it will crash at 08:00, it says so, with the math.

---

## 0. What the app actually is (verified in code, not assumed)

| Question | Answer (evidence) |
|---|---|
| Database | **MongoDB via Mongoose** (`src/lib/db.js`, `src/lib/store.js`). Demo mode = in-memory JSON-file store (`src/lib/demo-store.js`, `persist()` does `fs.writeFileSync`) — **dev-only; never production**. No Postgres/MySQL/SQLite. |
| Framework | Next.js 16.3 App Router, Node runtime, API route handlers. |
| Sessions | **Stateless JWTs** (7-day, httpOnly cookie, `src/lib/token.js`), **re-validated against Mongo on every request** (`requireAuth` → `findAuthSnapshot`, a lean `select("role schoolId assignedClass")` read that never decrypts PII, `src/lib/policy.js`). Revocation via `tokenVersion` counter. |
| Rate limiting | **In-memory per-process `Map`** (`src/lib/rate-limit.js`). Explicitly documented as single-instance. |
| Caching | **None.** No Redis, no in-memory cache, no CDN config in-repo. |
| Queue | **None.** No BullMQ, no workers. |
| Background jobs | In-process timers in `src/instrumentation.js` (daily conflict scan, hourly deletion sweeper) — **run on every instance**. |
| Measured baseline | `docs/scaling.md`: **~1,000 req/s per instance** (prod build, demo store, dev laptop — a *lower bound*; Mongo-backed is slower per request but stateless). `/api/auth/me` at 500 concurrency: 920 req/s, p50 535 ms, p99 746 ms, **0 HTTP errors**. |

---

## 1. Architecture audit

**DB:** MongoDB (see above). Single shared Mongo for all tenants — a multi-tenant design with a `schoolId` on every document.

**Is the backend stateless? Can we run 10 servers?**
**Yes — this is the single best thing in the codebase.** Sessions are signed JWTs with zero server-side session state; any instance can serve any user; the load balancer needs **no stickiness**. `tokenVersion` gives immediate revocation without a shared store. The two stateful things that break multi-instance are small and named:
1. the in-memory rate limiter (per-instance budgets), and
2. the in-process background jobs (every instance runs its own scan/sweeper).

**Verdict: "Will it scale horizontally? Yes. Why?** Stateless JWT auth + per-request lean revalidation + tenant-scoped data model. The API has no `session` table, no in-memory user state, no WebSocket sessions. Ten instances is architecturally trivial **once Redis owns the rate limits and jobs are gated to one instance** (§6)."

---

## 2. Database bottleneck check

**N+1 queries:** none found on the hot paths. The login path is 1 indexed lookup + 1 bcrypt compare (+1 children lookup for parents). Authed requests are 1 `findAuthSnapshot` + the route's own scoped queries. Dashboard stats run `countDocuments` in parallel. No per-row loops calling the DB.

**Indexes (current — from `src/models/*.js`, enforced by `npm run ensure-indexes`):**
- `users`: `{ schoolId, emailIdx }` **unique** (login by email) · `schoolId` · `parentId`
- `scores`: `{ studentId, subject, classArm }` unique
- `notifications`: `{ schoolId, createdAt }` (new auto-archive works on it)
- `feePayments`: `{ schoolId, receiptNo }`
- `attendance`: `{ schoolId, classArm, date }`

**Missing indexes — add these NOW (one `ensure-indexes` run):**
```js
// users: name-based logins (parents/teachers sign in by NAME). `name` is
// plaintext (only email/phone are encrypted), so a compound index applies.
// Without it, every name login scans the whole users collection.
userSchema.index({ schoolId: 1, role: 1, name: 1 });

// users: the roster/dashboard student lists are always school + arm.
userSchema.index({ schoolId: 1, assignedClass: 1, name: 1 });

// scores: report-card assembly is arm-scoped — covers the existing unique
// index with a cheaper path for whole-arm reads.
scoreSchema.index({ schoolId: 1, classArm: 1, subject: 1, studentId: 1 });
```

**Pagination:** the roster API supports `?limit&offset` (hard-capped) — **but the dashboard does not use it** (documented ceiling in `docs/scaling.md`: "Roster tab loads the whole school"). At ~3,300 students/school that's ~3,300 docs per tab open — survivable per school, wasteful under 1M-user burst. Flip the roster tab to paging.

**Will `SELECT * FROM students WHERE school_id = X` lock the table at 8 AM?**
There is no SQL and no table locks — it's Mongo. The equivalent (`users.find({ schoolId })`) runs on the `schoolId` index; reads don't block writes in WiredTiger. The real risks are (a) **Mongo connection exhaustion** — 10 instances × default `maxPoolSize: 100` = 1,000 connections against a small Atlas tier, and (b) **an under-provisioned tier** — `serverSelectionTimeoutMS: 5000` means requests queue then fail with 5s timeouts when the cluster saturates. Fix: set `MONGODB_POOL_SIZE=25–50` per instance (already env-tunable) and right-size the cluster (§5).

---

## 3. Load-test simulation — the 8 AM math

### The honest numbers

**Measured:** ~1,000 req/s sustained per instance (single core-bound at that rate, per `docs/scaling.md`; ~700 req/s is a safer real-world figure once Mongo round-trips and mixed endpoints are included).

**The storm:**
- 300,000 logins in 60 s = **5,000 logins/s**
- 1,000,000 logins in 60 s = **16,667 logins/s**
- Add ~2–4 follow-up requests per student (dashboard, fee view, report card, 30 s notification poll) → **15,000–60,000 req/s total** during the peak.

**The bcrypt cliff (the #1 crash cause):** logins run `bcrypt.compare` from **bcryptjs — pure JavaScript on the main thread**. A cost-10 compare costs ~60–100 ms of *single-thread CPU*. Node has **one JS thread per process**, so one app instance sustains roughly **10–16 logins/s regardless of core count**.

| Scenario | Requires (bcryptjs, today) | Reality check |
|---|---|---|
| 5,000 logins/s | ~350–500 instances | **Not deployable** |
| 16,667 logins/s | ~1,200+ instances | **Not deployable** |

Two caveats that soften (but don't remove) the cliff:
1. **Most students won't actually re-login** — their 7-day JWT is in the cookie. The 08:00 burst is mostly *session revalidation* (1 lean Mongo read each) + page loads, not bcrypt compares. That's the difference between "un-deployable" and "deployable with 10–20 instances + cache".
2. On the first day of term (new devices, expired sessions, password resets), most students DO login. **Assume the worst case — that is the failure mode to engineer for.**

**Fix priority for the login path (in order):**
1. Swap `bcryptjs` → native **`bcrypt`** (libuv threadpool, off-main-thread). ~4–8 concurrent compares per instance → 50–130 logins/s/instance. Still not enough alone for 16k/s, but removes the *blocking* problem.
2. Add a **login queue / gate** (BullMQ) so the storm is absorbed instead of saturating the DB + event loop.
3. **Cache the auth snapshot** in Redis (60 s TTL) so repeated `/api/auth/me` calls from the same user don't hit Mongo every time.

### The k6 script
Written to `k6/load-test.js` (see repo). It models the real mix: a **login scenario** (10% of VUs, fresh logins), a **session-reuse scenario** (90%, `/api/auth/me` + dashboard + fee + report), and the notification poll. One k6 machine tops out around 40–80k VUs — for 300k–1M use **distributed k6** (`k6 cloud` or `--paused` orchestration across 5–10 load generators).

```bash
# local smoke: 200 concurrent users, 1 min
k6 run --vus 200 --duration 1m k6/load-test.js
# production-grade burst: distributed (k6 cloud) with K6_RAMP=300000
K6_RAMP=300000 k6 cloud k6/load-test.js
```

**Expected results to look for** (against a Mongo-backed prod-like staging):
- Login scenario: **throughput = min(instances × ~100/s with native bcrypt, Mongo capacity)**. If p95 > 2 s or error > 1% → the bcrypt/Mongo cliff; verify you're on native bcrypt + Redis cache.
- Session scenario: expect **~500–700 req/s per instance**; scale instances until p95 < 500 ms.
- The failure you'll see first: **Mongo connection saturation** (see `serverSelectionTimeoutMS` errors) and **event-loop stalls** if bcryptjs is still installed.

---

## 4. Caching strategy (Redis)

| What | Why | TTL | Code |
|---|---|---|---|
| **Rate-limit buckets** | Shared budgets across instances; per-school caps | window (15 min) | `rate-limit.js` swap (§6.1) |
| **Auth snapshot cache** (`/api/auth/me`) | The 08:00 burst is mostly revalidation; 1 Mongo read/request → ~0 | **60 s** (bounded staleness vs `tokenVersion` revocation — acceptable window; shorten to 30 s if revocation latency matters) | §6.2 |
| **Dashboard stats rollup** | `getDashboardStats` runs 10+ countDocuments per overview load | **30–60 s** | §6.3 |
| **Fee structures / school branding** | Immutable-ish, read on every portal page | 5 min | same pattern |
| **Notification fan-out** (later) | SSE/pub-sub instead of 30 s polls | — | future |

**Cache invalidation rules:** auth snapshot keyed `auth:<userId>` + busted on password change (`tokenVersion` bump) and role change; stats keyed `stats:<schoolId>`; branding keyed `school:<schoolId>`. Never cache anything tenant-invisible.

---

## 5. Server & infrastructure requirements

**Honest answer first:** 1M *concurrent students* at 08:00 is a **large platform event** (the order of magnitude of a mid-size country's tax portal at deadline). It is NOT "a VPS + Mongo" — it is a CDN-fronted, autoscaled cluster. Target these numbers:

**Minimum viable (300k students, mostly session reuse):**
- **App:** 8 × `next start` (standalone) — 8 vCPU / 16 GB each (CPU-bound at ~700 req/s/instance)
- **Mongo:** Atlas M50+ (or equivalent, ~2k+ IOPS) with **a read replica** for dashboard reads; connection pool 25–50 per instance; `npm run ensure-indexes` before every deploy
- **Redis:** 2 × 4 GB (1 primary, 1 replica) — rate limits + caches
- **Load balancer:** any (no stickiness needed); **Cloudflare in front** (WAF, bot management, marketing-page cache) — this absorbs the flood before it hits you
- **Jobs:** exactly one instance runs background jobs (`RUN_JOBS=primary`)

**For 1M students (worst case, all logging in):**
- 25–50 app instances behind autoscaling (CPU ≥ 70% → +2), **plus** a login queue so the bcrypt surge is processed in a controlled stream — otherwise instance count explodes (§3 math)
- Mongo **sharded** on `schoolId`, or accept read-replica fan-out + heavy dashboard caching
- 5–10 distributed k6 generators just to *measure* it — do this before the day, not after

**Hosting notes:**
- **Vercel/Railway/Render:** Railway/Render give you the Docker + scaling; **Vercel is wrong for this** — long-running Node timers (`instrumentation.js` background jobs) and self-managed Mongo connections don't fit serverless. Use **Docker on Railway/Render/DigitalOcean** with the `docker-compose.yml` in this repo (app + Mongo + Redis).
- **DigitalOcean:** Droplets + managed Mongo (or Atlas) + managed Redis — the `docker-compose.yml` maps 1:1.
- `next.config.mjs` must gain `output: "standalone"` for slim Docker images (§6.6).

---

## 6. Code changes needed NOW (exact diffs)

### 6.1 Redis-backed rate limiter — `src/lib/rate-limit.js`
Swap the `Map` for Redis behind the **same `checkRateLimit()` interface** (no route changes; the login route's per-IP + per-account + per-teacher-name buckets keep working, now shared across instances). Add a **per-school** dimension to the login route while you're in there.

```js
// src/lib/rate-limit.js — replace the in-memory Map with Redis.
import { createClient } from "redis";           // npm i redis
const redis = process.env.REDIS_URL
  ? createClient({ url: process.env.REDIS_URL })
  : null;
if (redis) redis.connect().catch(() => {});
let fallbackBuckets = new Map();                 // in-memory only when no REDIS_URL

export async function checkRateLimit({ request, windowMs, max, prefix = "rl", key = "" }) {
  const ip = clientIp(request);                  // (existing helper)
  const bucketKey = key ? `${prefix}:${ip}:${key}` : `${prefix}:${ip}`;
  if (redis) {
    const now = Date.now();
    const slot = Math.floor(now / windowMs);     // fixed window
    const rk = `${bucketKey}:${slot}`;
    const count = await redis.incr(rk);
    if (count === 1) await redis.expire(rk, Math.ceil(windowMs / 1000));
    if (count > max) {
      return Response.json({ error: "Too many requests. Please try again later." }, {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(windowMs / 1000)), "X-RateLimit-Remaining": "0" },
      });
    }
    return null;
  }
  /* ...existing in-memory Map path unchanged (demo/dev fallback)... */
}
```
Per-school cap in `src/app/api/auth/login/route.js` (inside `deny()`, alongside the existing buckets):
```js
checkRateLimit({ request, windowMs: 15 * 60 * 1000, max: 5000, prefix: "auth-login-school", key: `school:${schoolId}` })
```
`5000 failed logins / 15 min / school` — one school's scripted attack can no longer burn the shared budget or exhaust Mongo on other tenants.

### 6.2 Auth snapshot cache — `src/lib/policy.js` / `src/lib/mongo-store.js`
```js
// policy.js requireAuth — wrap the store revalidation:
const cached = await redisGet(`auth:${session.userId}`);      // TTL 60s
const user = cached ?? await store.findAuthSnapshot(session.userId);
if (user && !cached) await redisSet(`auth:${session.userId}`, user, 60);
// Invalidate on password/role change: DEL auth:<userId> in the
// change-password and roles routes (they already bump tokenVersion).
```
Trade-off to state in the deploy doc: revocation now propagates in ≤ 60 s instead of instantly. Acceptable for this traffic shape; shorten to 30 s if the school admin insists on instant demotions.

### 6.3 Dashboard stats cache — `src/app/api/admin/stats/route.js` (and the reports route)
```js
const key = `stats:${schoolId}`;
const cached = await redisGet(key);
if (cached) return Response.json(JSON.parse(cached));
const stats = await store.getDashboardStats(schoolId, { forRole: session.user.role });
await redisSet(key, JSON.stringify(stats), 45);               // 30–60 s TTL
return Response.json(stats);
```
This turns the heaviest page in the app (10+ countDocuments per load) into 1 Redis GET for 99.9% of the 08:00 hits.

### 6.4 Native bcrypt (login cliff) — `package.json` + stores
```bash
npm uninstall bcryptjs && npm install bcrypt
# UV_THREADPOOL_SIZE=8 in the app's env — native bcrypt runs on libuv threads
```
```js
// mongo-store.js / demo-store.js: import bcrypt from "bcrypt" (native);
// bcrypt.compare / bcrypt.hash keep the same call signatures.
```
Do **not** lower the cost — cost 10 stays. The win is off-main-thread compares.

### 6.5 Login queue (worst case) — `src/app/api/auth/login/route.js`
```js
// When REDIS_URL + QUEUE_* are set, enqueue instead of comparing inline:
await loginQueue.add("verify", { schoolId, email, name, role, passwordHashProbe }, {
  attempts: 1,
  removeOnComplete: true,
});
// A BullMQ worker (separate process) does bcrypt.compare and posts the
// result to a per-request callback key (Redis pub/sub or polling).
// Without QUEUE_* configured, the route keeps today's synchronous path —
// zero behavior change for single-instance/demo deploys.
```

### 6.6 `next.config.mjs` — Docker-friendly builds
```js
const nextConfig = {
  output: "standalone",        // slim, self-contained image for docker-compose
  // ...existing headers() unchanged
};
```

### 6.7 Single-instance background jobs — `src/instrumentation.js`
```js
const isPrimary = process.env.RUN_JOBS === "primary";   // default "primary" for 1-instance deploys
if (isPrimary) {
  g.__conflictScheduler = startConflictScheduler({ store });
  g.__deletionSweeper = startDeletionSweeper({ store });
}   // every other instance: no timers, no duplicate scans/sweeps
```

### 6.8 Notification poll — `src/components/NotificationsBell.js`
```js
// 30s → 60s + jitter: at 1M users, even 1% staff admins polling every 30s
// is ~33 req/s of pure polling.
const pollMs = 60000 + Math.floor(Math.random() * 15000);
timerRef.current = setInterval(load, pollMs);
```
(Proper fix is SSE/pub-sub — listed as future work, consistent with `docs/scaling.md`.)

### 6.9 Indexes — run `npm run ensure-indexes` after adding (§2)
New compound indexes on `users` (`schoolId+role+name`, `schoolId+assignedClass+name`) and `scores` (`schoolId+classArm+subject+studentId`).

---

## 7. Security under load

**Per-IP + per-school rate limiting:** the Redis swap (§6.1) makes budgets shared; the per-school bucket caps one tenant's blast radius. Today, with N instances, a school can multiply its budget by N — the Redis swap closes that.

**Login queue:** §6.5 (BullMQ worker for bcrypt) — also throttles a distributed credential attack to your compute budget instead of your CPU cliff.

**Cloudflare Turnstile on the login form** (recommended, not blocking): `data-sitekey` + server-side verification in `POST /api/auth/login` before the bcrypt compare. This is the standard answer to "bots will hammer the login at 08:00" — it keeps the queue for humans. (No code change can be committed for this without your site keys; the integration point is `deny()`/the top of `POST`.)

**Already in place (credit where due):** multi-bucket brute-force limiter (IP 20/15 min, account 10/15 min, teacher-name 5/15 min), fail-closed RBAC on every route, encrypted-at-rest PII with blind indexes, no account oracle in login errors, `tokenVersion` revocation, security headers on every response. **One security flag:** `JWT_SECRET` falls back to `"edutrack-dev-secret-change-in-prod"` — at 300 schools, set it in the deployment env or sessions are forgeable.

---

## 8. Monitoring + alerts

**Sentry:** `npm i @sentry/nextjs` → `sentry.client.config.ts` / `sentry.server.config.ts` (the official setup script generates them), then wrap:
```js
// instrumentation.js register(): add
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.05 });
```

**DB slow queries (Mongoose):** in `src/lib/db.js` after connect:
```js
mongoose.plugin((schema) => {
  schema.pre("find", function () { this._start = Date.now(); });
  schema.post("find", function () {
    const ms = Date.now() - (this._start || Date.now());
    if (ms > 200) console.error(`[slow-query] ${ms}ms ${this.model.modelName} ${JSON.stringify(this.getFilter())}`);
  });
});
```

**UptimeRobot** (configuration, not code): HTTP(S) monitor on `GET /api/health` every 60 s from 3 locations; alert on any non-200. Add a synthetic **login check** (the k6 scenario in §3 as a scheduled test) so the bcrypt path is probed, not just `/api/health`.

**The 07:55 alert — the metric that matters:** a 5-minute window alert that fires when **p95 latency on `/api/auth/me` > 1 s OR the app error rate > 1% OR Mongo `currentOp` shows queued/blocked ops** — measured on the *production build*, not dev. Set the alert at 07:55 so you have 5 minutes of runway before the 08:00 wall, and page the on-call with the instance-count autoscale flag already armed. Add a `serverSelectionTimeoutMS`-driven alert (failed Mongo pings) — that fires before the users feel it.

---

## 9. Final verdict

**Traffic Ready Score: 3/10** — an excellent single-tenant codebase, a 10k-user runbook, and a genuinely stateless architecture… with no Redis, no queue, main-thread bcrypt, per-instance rate limits, unproven Mongo tier, and no pagination in the biggest tab. The foundations are right; the load-bearing walls for 300k–1M are not built.

**Top 3 things that will make it crash at 08:00:**
1. **The login endpoint's main-thread bcryptjs** — at 300k logins/60 s it needs ~350–500 instances, or the event loop blocks and every request on the box stalls. This is the cliff. (Native bcrypt + queue + auth-snapshot cache is the escape.)
2. **No Redis, so rate limits are per-instance and nothing is cached** — with 5+ instances the brute-force budgets multiply by N (security), the dashboard's 10+ countDocuments stats run on every overview load (DB), and `/api/auth/me` revalidates against Mongo on every request (~15k–60k reads/s in the worst case).
3. **Unproven Mongo sizing + connection exhaustion** — 8 instances × pool 100 = 800 connections against a small Atlas tier saturates fast; `serverSelectionTimeoutMS: 5000` turns a saturated cluster into a waterfall of 5-second failures right at 08:00.

**To be 10/10 ready, do these 5 things in order:**
1. **Fix the login path first** (native bcrypt → off-main-thread; then a BullMQ login queue for the worst case). Nothing else matters if login is the cliff.
2. **Add Redis** and swap in the shared rate limiter + auth-snapshot/stats caches (§6.1–6.3) — this is what makes N instances actually N.
3. **Right-size and prove Mongo**: M50+ with a read replica, `MONGODB_POOL_SIZE=25–50` per instance, `npm run ensure-indexes` with the new indexes, then load-test against the real tier.
4. **Docker + deploy config**: `output: "standalone"`, the `docker-compose.yml` in this repo, autoscaling (CPU ≥ 70% → +2, cap by Mongo connections), `RUN_JOBS=primary` on exactly one instance, `JWT_SECRET` + `SENTRY_DSN` in env.
5. **Measure the real day**: distributed k6 (§3) against staging with the real user mix, the 07:55 p95/error-rate/Mongo-queue alert (§8), Cloudflare in front, and a rehearsal run of the 08:00 burst the week before.

**Bottom line:** don't ship 08:00 day-one with the current code. Three to four focused weeks of the work above — mostly config + two library swaps + one Redis — gets you to a defensible 7–8/10; the queue + sharded Mongo + CDN gets you to 10.
