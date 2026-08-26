/**
 * Structured logger — replaces raw console.warn / console.error across the
 * codebase with a consistent, grep-friendly pattern.
 *
 * Every call takes a **tag** (the module or feature name) and a **message**,
 * followed by optional context.  The tag is always the first argument so
 * log output can be filtered with a simple prefix match:
 *
 *   grep '\[paystack-webhook\]' logs.txt
 *
 * Usage:
 *   import { log } from "@/lib/log";
 *   log.warn("paystack-webhook", "Missing metadata:", reference);
 *   log.error("school-status", "alert failed:", err);
 *
 * In development the calls delegate to console.warn / console.error so
 * existing devtools, sourcemaps and stack traces work unchanged.
 * In production a future swap (e.g. to a structured JSON emitter) only
 * needs to change this file — callers are untouched.
 */

let Sentry;
const isDev = () => process.env.NODE_ENV !== "production";

// Lazy-load Sentry — only import when DSN is set and we're in production.
// This avoids pulling in the SDK in dev/test and keeps the import out of
// the Edge bundle (Sentry is a Node-only dependency here).
// NOTE: log.js is ESM, so we use import() not require(). The import is
// awaited inside the warn/error functions; on first call the promise is
// cached in the module-level Sentry variable.
let sentryReady = null;
function getSentry() {
  if (Sentry) return Promise.resolve(Sentry);
  if (!process.env.SENTRY_DSN) return Promise.resolve(null);
  if (sentryReady) return sentryReady;
  sentryReady = import("@sentry/nextjs").then((mod) => {
    Sentry = mod;
    return mod;
  }).catch(() => null);
  return sentryReady;
}

/**
 * Operational warning — something unexpected happened but the app keeps
 * working (e.g. a non-critical fetch failed, a queue job errored).
 *
 * @param {string} tag   Module or feature name, e.g. "mailer", "tt-health"
 * @param {string} msg   Human-readable description
 * @param {...any} args  Optional context (error objects, IDs, payloads)
 */
export function warn(tag, msg, ...args) {
  if (isDev()) {
    console.warn(`[${tag}] ${msg}`, ...args);
  }
  // Production: report to Sentry as a warning. Fire-and-forget — callers
  // must not await this; the promise is cached for subsequent calls.
  if (!isDev()) {
    getSentry().then((s) => {
      if (s) {
        s.withScope((scope) => {
          scope.setTag("log.tag", tag);
          scope.setLevel("warning");
          s.captureMessage(`[${tag}] ${msg}`, "warning");
        });
      }
    });
  }
}

/**
 * Actual error — something broke and needs attention (e.g. a background
 * job failed, a webhook couldn't be processed).
 *
 * @param {string} tag   Module or feature name
 * @param {string} msg   Human-readable description
 * @param {...any} args  Optional context
 */
export function error(tag, msg, ...args) {
  if (isDev()) {
    console.error(`[${tag}] ${msg}`, ...args);
  }
  // Production: report to Sentry as an error. Fire-and-forget — callers
  // must not await this; the promise is cached for subsequent calls.
  if (!isDev()) {
    getSentry().then((s) => {
      if (s) {
        s.withScope((scope) => {
          scope.setTag("log.tag", tag);
          scope.setLevel("error");
          const err = args.find((a) => a instanceof Error);
          if (err) {
            scope.setExtras({ message: msg, tag });
            s.captureException(err);
          } else {
            s.captureMessage(`[${tag}] ${msg}`, "error");
          }
        });
      }
    });
  }
}

/**
 * Informational — rarely needed in client code; useful for server-side
 * startup messages and health checks.
 *
 * @param {string} tag   Module or feature name
 * @param {string} msg   Human-readable description
 * @param {...any} args  Optional context
 */
export function info(tag, msg, ...args) {
  if (isDev()) {
    console.log(`[${tag}] ${msg}`, ...args);
  }
}

/** Default export for convenience: `import log from "@/lib/log"` */
const log = { warn, error, info };
export default log;
