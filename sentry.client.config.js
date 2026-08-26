/**
 * Sentry client-side configuration.
 *
 * Initialized in the browser via Next.js instrumentation-client.
 * Only active when SENTRY_DSN is set (no DSN = no-op).
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || undefined,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  sendDefaultPii: false,
  environment: process.env.NODE_ENV || "development",
  ignoreErrors: ["NEXT_NOT_FOUND"],
});
