#!/usr/bin/env node
/**
 * Concurrency load test — the "is it ready for 10k users at once?" smoke.
 *
 * Drives a RUNNING server (dev/demo mode) with N concurrent clients × M
 * requests, and reports throughput + latency percentiles + errors. The
 * session is bootstrapped from the real demo sign-in (`POST /api/auth/demo`,
 * which issues the actual session cookie), so authed endpoints exercise the
 * genuine hot path — cookie → JWT verify → store re-validation → role gate →
 * data load — not a mocked one.
 *
 * Usage:
 *   node scripts/load-test.mjs --base http://localhost:3210 --users 100 --requests 200 --endpoint me
 *
 *   --base      server base URL        (default http://localhost:3210)
 *   --users     concurrent clients     (default 50)
 *   --requests  requests per client    (default 100)
 *   --endpoint  health | me | reports  (default me)
 *               health  — /api/health        (unauthed, server overhead)
 *               me      — /api/auth/me       (authed, full revalidation)
 *               reports — /api/reports       (authed, heaviest data load)
 *
 * Exit code 1 when error rate > 1% — CI-friendable. This is a smoke
 * benchmark, not a substitute for a production-grade tool (k6, wrk) with
 * real user distributions and a Mongo-backed store.
 *
 * Note: the bootstrap sign-in (POST /api/auth/demo) is IP rate-limited to 10
 * per 15 minutes, so ~10 runs inside one window will 429 — that is the limit
 * working, not a server fault. Space runs out, or use a fresh IP/proxy.
 */

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};

const base = (getArg("base", "http://localhost:3210") || "").replace(/\/$/, "");
const users = Number(getArg("users", "50")) || 50;
const requests = Number(getArg("requests", "100")) || 100;
const endpoint = getArg("endpoint", "me");
const total = users * requests;

/** Bootstrap a real session cookie from the demo sign-in route. */
async function bootstrap() {
  let res;
  try {
    res = await fetch(`${base}/api/auth/demo`, { method: "POST" });
  } catch {
    throw new Error(
      `Could not reach ${base} — start the server first (npm run dev) and point --base at it.`
    );
  }
  if (!res.ok) {
    throw new Error(
      `Demo bootstrap failed (HTTP ${res.status}) — the load test needs a running demo-mode server.`
    );
  }
  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(/edutrack_token=([^;]+)/);
  if (!match) {
    throw new Error("No session cookie returned by the demo sign-in.");
  }
  return `edutrack_token=${match[1]}`;
}

const cookie = endpoint === "health" ? null : await bootstrap();

const urlFor = (ep) =>
  ep === "health"
    ? `${base}/api/health`
    : ep === "reports"
      ? `${base}/api/reports?classArm=SS1%20Science&limit=50`
      : `${base}/api/auth/me`;
const url = urlFor(endpoint);

const request = async () => {
  const started = Date.now();
  let status = 0;
  try {
    const res = await fetch(url, {
      headers: cookie ? { cookie } : {},
      // keep-alive is undici's default — connection reuse matters here.
    });
    status = res.status;
    await res.arrayBuffer(); // drain the body so the socket is reused
  } catch {
    // network-level failure — counted as an error below
  }
  return { status, ms: Date.now() - started };
};

const results = [];
console.log(
  `load-test: ${endpoint} @ ${base} — ${users} concurrent × ${requests} requests (${total} total)`
);
const startedAt = Date.now();

await Promise.all(
  Array.from({ length: users }, () =>
    (async () => {
      for (let i = 0; i < requests; i += 1) {
        results.push(await request());
      }
    })()
  )
);

const elapsedSec = (Date.now() - startedAt) / 1000;
const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];
const sum = latencies.reduce((a, b) => a + b, 0);
const errors = results.filter((r) => r.status >= 400 || r.status === 0);
const statuses = {};
results.forEach((r) => {
  const k = r.status === 0 ? "network" : r.status;
  statuses[k] = (statuses[k] || 0) + 1;
});

const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`);
console.log("------------------------------------------------------");
console.log(`  requests      ${results.length}`);
console.log(`  wall time     ${elapsedSec.toFixed(1)}s`);
console.log(`  throughput    ${(results.length / elapsedSec).toFixed(0)} req/s`);
console.log(`  avg latency   ${fmt(sum / results.length)}`);
console.log(`  p50           ${fmt(pct(50))}`);
console.log(`  p95           ${fmt(pct(95))}`);
console.log(`  p99           ${fmt(pct(99))}`);
console.log(`  errors        ${errors.length} (${((errors.length / results.length) * 100).toFixed(2)}%)`);
console.log(`  status map    ${JSON.stringify(statuses)}`);
console.log("------------------------------------------------------");

if (errors.length / results.length > 0.01) {
  console.error("ERROR RATE ABOVE 1% — see docs/scaling.md before going to 10k users.");
  process.exit(1);
}
console.log("OK — error rate within the 1% budget.");
