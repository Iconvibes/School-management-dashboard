/**
 * EduTrack — 8 AM login-storm load test (k6)
 *
 * Models the real day:
 *   - login scenario:     10% of VUs do a FRESH login (exercises the bcrypt
 *                         path — the #1 bottleneck, see EduTrack-Traffic-Audit.md §3)
 *   - session scenario:   90% of VUs already hold a 7-day JWT and just
 *                         revalidate + load pages (the actual 08:00 shape)
 *   - poll scenario:      staff admins polling /api/notifications
 *
 * Run against a PROD-LIKE staging with a Mongo-backed store and seeded
 * accounts. Do NOT trust demo-mode numbers for capacity planning.
 *
 * Local smoke (200 VUs, 1 min):
 *   k6 run --vus 200 --duration 1m k6/load-test.js
 *
 * Distributed (300k–1M VUs): one k6 machine caps out around 40–80k VUs.
 * Use `k6 cloud` or orchestrate 5–10 generators with --paused:
 *   K6_RAMP=300000 k6 cloud k6/load-test.js
 *
 * Accounts: point K6_ACCOUNTS_FILE at a CSV `email,password,schoolId`
 * (one per VU; reuse with `SharedArray` when you have fewer than VUs).
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { randomIntBetween } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE = __ENV.K6_BASE || "https://staging.edutrack.example";
const RAMP = Number(__ENV.K6_RAMP || 200);          // total VUs (distributed sum)
const RAMP_SECS = Number(__ENV.K6_RAMP_SECS || 60); // the 08:00 wall, in seconds

const accounts = new SharedArray("accounts", () => {
  const raw = open(__ENV.K6_ACCOUNTS_FILE || "./k6/accounts.csv");
  return raw
    .trim()
    .split("\n")
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [email, password, schoolId] = line.split(",");
      return { email: email.trim(), password: password.trim(), schoolId: schoolId.trim() };
    });
});

function pickAccount() {
  return accounts[randomIntBetween(0, accounts.length - 1)];
}

export const options = {
  scenarios: {
    // 10% fresh logins — the bcrypt cliff. Watch: throughput per instance,
    // p95, and event-loop stalls. Fails hard if bcryptjs is still installed.
    login: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: `${RAMP_SECS}s`, target: Math.round(RAMP * 0.1) },
        { duration: "60s", target: Math.round(RAMP * 0.1) },
        { duration: "30s", target: 0 },
      ],
      exec: "freshLogin",
    },
    // 90% session reuse — revalidate /api/auth/me, then load pages.
    session: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: `${RAMP_SECS}s`, target: Math.round(RAMP * 0.9) },
        { duration: "120s", target: Math.round(RAMP * 0.9) },
        { duration: "30s", target: 0 },
      ],
      exec: "sessionUser",
    },
    // Staff admins polling the bell (30 s interval today — see §6.8).
    poll: {
      executor: "constant-vus",
      vus: Math.max(5, Math.round(RAMP * 0.01)),
      duration: "3m30s",
      exec: "pollNotifications",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"], // ≥1% errors = fail the run
    http_req_duration: ["p(95)<1000"], // p95 under 1 s for the burst
  },
};

// A fresh login exercises the REAL credential path: school lookup → user
// lookup (indexed) → bcrypt compare → JWT issue. `next` is the post-login
// landing so we also measure the first dashboard load of the day.
export function freshLogin() {
  const acct = pickAccount();
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email: acct.email, password: acct.password, role: "STUDENT", schoolId: acct.schoolId }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, { "login 200": (r) => r.status === 200 });
  if (res.status === 200) {
    // Carry the issued cookie into the landing-page burst.
    const jar = http.cookieJar();
    jar.set(BASE, "edutrack_token", extractToken(res.headers["Set-Cookie"]));
    http.get(`${BASE}/admin/dashboard`);
  }
  sleep(randomIntBetween(0, 2));
}

// A returning student: 1 revalidation + a realistic page mix.
export function sessionUser() {
  const jar = http.cookieJar();
  // Seed a long-lived session token (harvest from a prior login, or use the
  // app's demo sign-in in staging). If K6_TOKEN is set, reuse it.
  if (__ENV.K6_TOKEN) jar.set(BASE, "edutrack_token", __ENV.K6_TOKEN);

  const me = http.get(`${BASE}/api/auth/me`);
  check(me, { "me 200": (r) => r.status === 200 });

  // Weighted page mix — 60% dashboard, 25% fee view, 15% report card.
  const page = Math.random();
  if (page < 0.6) http.get(`${BASE}/api/admin/stats`);
  else if (page < 0.85) http.get(`${BASE}/api/fees`); // the fee ledger route
  else http.get(`${BASE}/api/reports`);

  sleep(randomIntBetween(2, 8)); // humans aren't 100% concurrent
}

// The notification poll — every 30 s per admin today (see audit §6.8).
export function pollNotifications() {
  const jar = http.cookieJar();
  // The poll is an ADMIN call — seed the same K6_TOKEN as sessionUser so the
  // check sees 200 instead of 401 when run without a pre-seeded jar.
  if (__ENV.K6_TOKEN) jar.set(BASE, "edutrack_token", __ENV.K6_TOKEN);
  const res = http.get(`${BASE}/api/notifications`);
  check(res, { "poll 200": (r) => r.status === 200 });
  sleep(30);
}

function extractToken(setCookie) {
  if (!setCookie) return "";
  const m = setCookie.match(/edutrack_token=([^;]+)/);
  return m ? m[1] : "";
}
