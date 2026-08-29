/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker standalone builds (see deploy/Dockerfile).
  output: "standalone",
  // Next 16's dev request log prints a line for EVERY request
  // (GET /api/auth/me 200 in 25ms (next.js: 5ms, proxy.ts: 6ms, ...)) —
  // under a load test that's ~9,000 lines per storm, drowning real errors.
  // Turn it off; genuine warnings and errors still reach the terminal.
  // (If selective logging is ever wanted, `incomingRequests: { ignore: [...] }`
  // accepts regexes, e.g. /^\/api\/health/.)
  logging: {
    incomingRequests: false,
  },
  // Security headers — the App Router equivalent of helmet, applied to every
  // page and API response. Content-Security-Policy is NOT set here: it lives
  // in src/proxy.js, where a per-request nonce is generated and stamped on
  // every response (strict in prod — no 'unsafe-inline' in script-src; the
  // root layout forces dynamic rendering so Next can nonce its inline
  // flight scripts, per the nonce guide in node_modules/next/dist/docs).
  // The non-negotiable headers below are a static safety net for any path
  // that ever bypasses the proxy.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HSTS is only honored over HTTPS (browsers ignore it on
          // http://localhost), so dev is unaffected.
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          // Camera/mic/geo are never used. Notifications (class alarms),
          // clipboard-write (copy password) and payment stay enabled.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
