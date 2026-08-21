#!/usr/bin/env node
/**
 * 100k-user load test for EduTrack.
 *
 * Simulates a realistic 08:00 school-district login storm followed by steady-state
 * dashboard usage. Measures throughput, latency percentiles, and error rates.
 *
 * Usage:
 *   node scripts/load-test-100k.mjs --base http://localhost:3000
 *   node scripts/load-test-100k.mjs --base http://localhost:3000 --ramp 30000 --steady 60000
 *
 * Flags:
 *   --base      Base URL (default: http://localhost:3000)
 *   --ramp      Ramp-up duration in ms (default: 60000 — 1 minute)
 *   --steady    Steady-state duration in ms (default: 120000 — 2 minutes)
 *   --users     Total simulated users (default: 100000)
 *   --concurrency  Max concurrent HTTP requests (default: 500)
 *
 * This does NOT require 100k real accounts — it simulates the request pattern
 * of 100k users hitting the server at realistic rates. Auth requests use the
 * demo credentials; unauthenticated requests test the rate limiter and
 * server overhead.
 *
 * Requires Node 18+ (fetch is built-in).
 */

import { parseArgs } from "node:util";

const { values: FLAGS } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3000" },
    ramp: { type: "string", default: "60000" },
    steady: { type: "string", default: "120000" },
    users: { type: "string", default: "100000" },
    concurrency: { type: "string", default: "500" },
  },
});

const BASE = FLAGS.base.replace(/\/$/, "");
const RAMP_MS = Number(FLAGS.ramp);
const STEADY_MS = Number(FLAGS.steady);
const TOTAL_USERS = Number(FLAGS.users);
const MAX_CONCURRENCY = Number(FLAGS.concurrency);

// ── Request profiles (weighted) ────────────────────────────────────
// These mirror real user behavior: a logged-in user hits /api/auth/me
// every ~5s (page load + notification check), with occasional dashboard
// data fetches.

const PROFILES = [
  // 40% — auth/me (the hottest endpoint at 08:00)
  { path: "/api/auth/me", weight: 40 },
  // 15% — admin stats (dashboard overview)
  { path: "/api/admin/stats", weight: 15 },
  // 10% — notifications list
  { path: "/api/notifications", weight: 10 },
  // 10% — fee ledger
  { path: "/api/fees", weight: 10 },
  // 10% — reports
  { path: "/api/reports?limit=50", weight: 10 },
  // 5% — users list
  { path: "/api/users?role=STUDENT&limit=100", weight: 5 },
  // 5% — health check (load balancer probe)
  { path: "/api/health", weight: 5 },
  // 5% — login attempt (simulates fresh sign-in)
  { path: "__LOGIN__", weight: 5 },
];

// ── Stats tracking ─────────────────────────────────────────────────
const stats = {
  total: 0,
  errors: 0,
  byStatus: {},
  latencies: [],
  loginSuccess: 0,
  loginFail: 0,
  startTime: Date.now(),
};

function recordLatency(ms, status, path) {
  stats.total++;
  stats.latencies.push(ms);
  stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
  if (status >= 400) stats.errors++;
  if (path === "__LOGIN__") {
    if (status === 200) stats.loginSuccess++;
    else stats.loginFail++;
  }
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Pool-based request executor ────────────────────────────────────
let active = 0;
const queue = [];

function enqueue(fn) {
  if (active < MAX_CONCURRENCY) {
    active++;
    fn().finally(() => {
      active--;
      if (queue.length) queue.shift()();
    });
  } else {
    queue.push(() => {
      active++;
      fn().finally(() => {
        active--;
        if (queue.length) queue.shift()();
      });
    });
  }
}

// ── Request executor ───────────────────────────────────────────────
const DEMO_CREDS = [
  { email: "admin@edutrack.app", password: "admin123", school: "Greenfield" },
  { email: "a.okafor@edutrack.app", password: "teacher123", school: "Greenfield" },
  { email: "k.adebayo@edutrack.app", password: "student123", school: "Greenfield" },
];

async function doRequest(path) {
  const start = performance.now();
  let status = 0;
  try {
    let url;
    let opts = { method: "GET", headers: {} };

    if (path === "__LOGIN__") {
      url = `${BASE}/api/auth/login`;
      const cred = DEMO_CREDS[Math.floor(Math.random() * DEMO_CREDS.length)];
      opts = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cred),
      };
    } else {
      url = `${BASE}${path}`;
    }

    // 10s per-request timeout so a slow demo-store response can't hang the drain loop
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    opts.signal = controller.signal;

    const res = await fetch(url, opts);
    status = res.status;
    clearTimeout(timer);
    await res.arrayBuffer();
  } catch (err) {
    status = err?.name === "AbortError" ? 408 : 0; // 408 = request timeout
  }
  const elapsed = performance.now() - start;
  recordLatency(elapsed, status, path);
}

// ── Weighted random path selection ─────────────────────────────────
const totalWeight = PROFILES.reduce((s, p) => s + p.weight, 0);
function randomPath() {
  let r = Math.random() * totalWeight;
  for (const p of PROFILES) {
    r -= p.weight;
    if (r <= 0) return p.path;
  }
  return PROFILES[0].path;
}

// ── Ramp-up phase ──────────────────────────────────────────────────
async function runRamp() {
  console.log(`\n🚀 RAMP-UP: ${TOTAL_USERS} users over ${RAMP_MS / 1000}s (max ${MAX_CONCURRENCY} concurrent)\n`);
  const requestsPerUser = 2; // each user makes ~2 requests during ramp (login + first page)
  const totalRequests = Math.min(TOTAL_USERS * requestsPerUser, TOTAL_USERS * 5);
  const intervalMs = RAMP_MS / totalRequests;

  const deadline = Date.now() + RAMP_MS;
  let sent = 0;

  while (Date.now() < deadline && sent < totalRequests) {
    const path = randomPath();
    enqueue(() => doRequest(path));
    sent++;

    // Progress every 10k requests
    if (sent % 10000 === 0) {
      const elapsed = (Date.now() - stats.startTime) / 1000;
      const rps = stats.total / elapsed;
      process.stdout.write(
        `\r  [ramp] ${sent.toLocaleString()} sent | ${rps.toFixed(0)} req/s | ${active} active | ${stats.errors} errors`
      );
    }

    // Small delay to spread requests across the ramp window
    if (intervalMs > 0) await new Promise((r) => setTimeout(r, Math.min(intervalMs, 1)));
  }

  // Drain remaining active requests (with a 30s safety timeout)
  const drainDeadline = Date.now() + 30_000;
  while ((active > 0 || queue.length > 0) && Date.now() < drainDeadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (active > 0) console.log(`\n  ⚠️  ${active} requests still in flight after drain timeout`);

  console.log(`\n  ✅ Ramp complete: ${sent.toLocaleString()} requests sent`);
}

// ── Steady-state phase ─────────────────────────────────────────────
async function runSteady() {
  console.log(`\n📊 STEADY-STATE: ${STEADY_MS / 1000}s with ~${TOTAL_USERS.toLocaleString()} simulated users\n`);

  // At steady state, each user hits the server ~1x per 5-10s.
  // 100k users / 7.5s avg = ~13,333 req/s target
  const targetRps = Math.min(TOTAL_USERS / 7.5, MAX_CONCURRENCY * 2);
  const intervalMs = 1000 / targetRps;

  const deadline = Date.now() + STEADY_MS;
  let sent = 0;

  while (Date.now() < deadline) {
    const path = randomPath();
    enqueue(() => doRequest(path));
    sent++;

    if (sent % 50000 === 0) {
      const elapsed = (Date.now() - stats.startTime) / 1000;
      const rps = stats.total / elapsed;
      process.stdout.write(
        `\r  [steady] ${sent.toLocaleString()} sent | ${rps.toFixed(0)} req/s | ${active} active | p50=${percentile(stats.latencies, 50).toFixed(0)}ms p95=${percentile(stats.latencies, 95).toFixed(0)}ms p99=${percentile(stats.latencies, 99).toFixed(0)}ms`
      );
    }

    if (intervalMs > 0.1) await new Promise((r) => setTimeout(r, intervalMs));
  }

  // Drain remaining active requests (with a 30s safety timeout)
  const drainDeadline = Date.now() + 30_000;
  while ((active > 0 || queue.length > 0) && Date.now() < drainDeadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (active > 0) console.log(`\n  ⚠️  ${active} requests still in flight after drain timeout`);

  console.log(`\n  ✅ Steady-state complete: ${sent.toLocaleString()} requests sent`);
}

// ── Report ─────────────────────────────────────────────────────────
function printReport() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rps = stats.total / elapsed;
  const errorRate = stats.total ? ((stats.errors / stats.total) * 100).toFixed(2) : 0;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  📈 RESULTS — ${stats.total.toLocaleString()} requests in ${elapsed.toFixed(1)}s`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Throughput:    ${rps.toFixed(0)} req/s`);
  console.log(`  Error rate:    ${errorRate}% (${stats.errors.toLocaleString()} errors)`);
  console.log(`  Latency p50:   ${percentile(stats.latencies, 50).toFixed(0)}ms`);
  console.log(`  Latency p95:   ${percentile(stats.latencies, 95).toFixed(0)}ms`);
  console.log(`  Latency p99:   ${percentile(stats.latencies, 99).toFixed(0)}ms`);
  console.log(`  Latency max:   ${Math.max(0, ...stats.latencies).toFixed(0)}ms`);
  console.log(`\n  Status breakdown:`);
  for (const [code, count] of Object.entries(stats.byStatus).sort(([a], [b]) => a - b)) {
    console.log(`    ${code}: ${count.toLocaleString()} (${((count / stats.total) * 100).toFixed(1)}%)`);
  }
  console.log(`\n  Login results:`);
  console.log(`    Success: ${stats.loginSuccess.toLocaleString()}`);
  console.log(`    Failed:  ${stats.loginFail.toLocaleString()}`);
  console.log(`${"═".repeat(60)}\n`);
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🧪 EduTrack 100k Load Test`);
  console.log(`   Target: ${BASE}`);
  console.log(`   Users:  ${TOTAL_USERS.toLocaleString()}`);
  console.log(`   Ramp:   ${RAMP_MS / 1000}s | Steady: ${STEADY_MS / 1000}s`);
  console.log(`   Concurrency: ${MAX_CONCURRENCY}`);

  // Quick connectivity check
  try {
    const res = await fetch(`${BASE}/api/health`);
    const data = await res.json();
    console.log(`   Health: ${data.status} (${data.mode || "unknown"})`);
  } catch {
    console.error(`\n❌ Cannot reach ${BASE}/api/health — is the server running?`);
    process.exit(1);
  }

  stats.startTime = Date.now();
  await runRamp();
  await runSteady();
  printReport();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
