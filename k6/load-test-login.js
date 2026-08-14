/**
 * EduTrack — login-only burst (isolates the login path).
 *
 * The full login-storm script (load-test.js) mixes 90% session reuse into the
 * measurement. This variant drives ONLY POST /api/auth/login — the bcrypt
 * path — so the login endpoint's own throughput and p95 are visible without
 * the page-load mix muddying the numbers.
 *
 * Usage:
 *   k6 run --env K6_ACCOUNTS_FILE=... k6/load-test-login.js
 */
import http from "k6/http";
import { SharedArray } from "k6/data";

const BASE = __ENV.K6_BASE || "http://localhost:3000";

const accounts = new SharedArray("accounts", () => {
  const raw = open(__ENV.K6_ACCOUNTS_FILE);
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

export const options = {
  scenarios: {
    loginStorm: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 100 }, // the 08:00 wall
        { duration: "30s", target: 100 }, // sustained storm
        { duration: "10s", target: 0 },   // ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const acct = accounts[Math.floor(Math.random() * accounts.length)];
  http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({
      email: acct.email,
      password: acct.password,
      role: "STUDENT",
      schoolId: acct.schoolId,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
