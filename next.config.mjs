/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security headers — the App Router equivalent of helmet, applied to every
  // page and API response. Deliberate omission: no Content-Security-Policy —
  // a strict CSP needs per-request nonces that force dynamic rendering (see
  // the nonce guide in node_modules/next/dist/docs), and the app's 3-layer
  // auth already guards the main injection surface. Revisit if that changes.
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
