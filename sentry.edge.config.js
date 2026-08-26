/**
 * Sentry edge-runtime configuration.
 *
 * Initialized once per Edge Worker via instrumentation.js.
 * Only active when SENTRY_DSN is set (no DSN = no-op).
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  sendDefaultPii: false,
  environment: process.env.NODE_ENV || "development",
  ignoreErrors: ["NEXT_NOT_FOUND"],
});
