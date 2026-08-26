/**
 * Sentry server-side configuration.
 *
 * Initialized once per Node.js process via instrumentation.js.
 * Only active when SENTRY_DSN is set (no DSN = no-op).
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,

  // Performance monitoring — sample 10% of traces in production, 100% in dev.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Don't send PII — emails, phones, and passwords are encrypted at rest
  // specifically to protect users. We scrub them before they reach Sentry.
  sendDefaultPii: false,

  // Scrub sensitive fields from event context, breadcrumbs, and request payloads.
  beforeSend(event) {
    return scrubPII(event);
  },

  // Environment tag for filtering in Sentry dashboard.
  environment: process.env.NODE_ENV || "development",

  // Don't report known non-errors.
  ignoreErrors: [
    "NEXT_NOT_FOUND", // 404s — not actionable
  ],
});

/**
 * Deep-scrub an event to remove PII fields (email, phone, password, token,
 * secret) from all nested objects, arrays, and strings. This is a defense-in-
 * depth measure — the app encrypts PII at rest, but Sentry events are
 * constructed from runtime data that may contain decrypted values.
 */
export function scrubPII(obj) {
  if (!obj || typeof obj !== "object") return obj;

  const SENSITIVE_KEYS = new Set([
    "email",
    "phone",
    "phoneNum",
    "password",
    "passwordHash",
    "oldPassword",
    "newPassword",
    "token",
    "jwt",
    "secret",
    "vapidPrivateKey",
    "dataEncKey",
    "cookie",
    "set-cookie",
    "authorization",
  ]);

  const SENSITIVE_PATTERNS = [
    /email/i,
    /phone/i,
    /password/i,
    /secret/i,
    /token/i,
    /vapid/i,
  ];

  function isSensitiveKey(key) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lower)) return true;
    return SENSITIVE_PATTERNS.some((p) => p.test(lower));
  }

  function scrub(val) {
    if (val === null || val === undefined) return val;
    if (typeof val === "string") {
      // Redact strings that look like emails, phone numbers, or base64 secrets.
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return "[REDACTED_EMAIL]";
      if (/^\+?[\d\s\-()]{7,}$/.test(val)) return "[REDACTED_PHONE]";
      if (/^ey[A-Za-z0-9]/.test(val)) return "[REDACTED_TOKEN]";
      return val;
    }
    if (Array.isArray(val)) return val.map(scrub);
    if (typeof val === "object") {
      const result = {};
      for (const [k, v] of Object.entries(val)) {
        if (isSensitiveKey(k)) {
          result[k] = "[REDACTED]";
        } else {
          result[k] = scrub(v);
        }
      }
      return result;
    }
    return val;
  }

  return scrub(obj);
}
