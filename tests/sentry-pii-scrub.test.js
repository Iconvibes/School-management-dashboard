/**
 * P0.3 — Sentry PII scrubbing regression guard.
 *
 * The app encrypts emails, phones, and passwords at rest specifically to
 * protect user PII. Sentry events are constructed from runtime data that
 * may contain decrypted values (e.g. from login flows, error contexts).
 * The scrubPII() function in sentry.server.config.js must strip all PII
 * fields before they reach Sentry.
 *
 * This test deliberately throws an error carrying a user object with PII
 * and asserts no email/phone/password field reaches the reported payload.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Read the scrubPII function from sentry.server.config.js
const SERVER_CONFIG = readFileSync(
  new URL("../sentry.server.config.js", import.meta.url),
  "utf8"
);

// Extract the scrubPII function by evaluating the module.
// Since the file has side effects (Sentry.init), we extract just the function.
let scrubPII;
try {
  // The file exports scrubPII — import it directly.
  const mod = await import("../sentry.server.config.js");
  scrubPII = mod.scrubPII;
} catch {
  // If the import fails (e.g. Sentry not installed in test env),
  // fall back to evaluating the function source.
  const fnMatch = SERVER_CONFIG.match(
    /export function scrubPII\(obj\) \{[\s\S]*?\n\}/
  );
  if (fnMatch) {
    // Evaluate the function in isolation.
    const fn = new Function("obj", fnMatch[0].replace(/export function scrubPII\(obj\)/, "return (function scrubPII(obj)").replace(/\n\}$/, ")(obj)"));
    scrubPII = fn;
  } else {
    throw new Error("Could not extract scrubPII from sentry.server.config.js");
  }
}

describe("Sentry PII scrubbing — scrubPII()", () => {
  it("redacts email fields in nested objects", () => {
    const event = {
      user: { email: "john@example.com", name: "John" },
      extra: { contactEmail: "jane@test.org" },
    };
    const scrubbed = scrubPII(event);
    assert.equal(scrubbed.user.email, "[REDACTED]");
    assert.equal(scrubbed.user.name, "John", "non-PII fields should pass through");
    assert.equal(scrubbed.extra.contactEmail, "[REDACTED]");
  });

  it("redacts phone fields", () => {
    const event = {
      user: { phone: "+234 801 234 5678", phoneNum: "08012345678" },
    };
    const scrubbed = scrubPII(event);
    assert.equal(scrubbed.user.phone, "[REDACTED]");
    assert.equal(scrubbed.user.phoneNum, "[REDACTED]");
  });

  it("redacts password fields", () => {
    const event = {
      body: { password: "supersecret123", oldPassword: "old", newPassword: "new" },
    };
    const scrubbed = scrubPII(event);
    assert.equal(scrubbed.body.password, "[REDACTED]");
    assert.equal(scrubbed.body.oldPassword, "[REDACTED]");
    assert.equal(scrubbed.body.newPassword, "[REDACTED]");
  });

  it("redacts token and secret fields", () => {
    const event = {
      headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9..." },
      config: { vapidPrivateKey: "abc123", secret: "mysecret" },
    };
    const scrubbed = scrubPII(event);
    assert.equal(scrubbed.headers.authorization, "[REDACTED]");
    assert.equal(scrubbed.config.vapidPrivateKey, "[REDACTED]");
    assert.equal(scrubbed.config.secret, "[REDACTED]");
  });

  it("redacts email-like strings in string-typed fields named 'email'", () => {
    // scrubPII matches keys, not arbitrary string values — that's by design
    // to avoid false positives. This test verifies the key-based matching
    // works even when the key is camelCase or nested.
    const event = {
      userData: { userEmail: "user@test.com", contactEmail: "admin@school.edu.ng" },
    };
    const scrubbed = scrubPII(event);
    assert.equal(scrubbed.userData.userEmail, "[REDACTED]");
    assert.equal(scrubbed.userData.contactEmail, "[REDACTED]");
  });

  it("does not alter non-PII data", () => {
    const event = {
      tags: { school: "Greenfield", role: "TEACHER" },
      extra: { count: 42, active: true },
    };
    const scrubbed = scrubPII(event);
    assert.deepEqual(scrubbed, event, "non-PII data should be unchanged");
  });

  it("handles null/undefined/primitives gracefully", () => {
    assert.equal(scrubPII(null), null);
    assert.equal(scrubPII(undefined), undefined);
    assert.equal(scrubPII("hello"), "hello");
    assert.equal(scrubPII(42), 42);
  });

  it("scrubs deeply nested PII", () => {
    const event = {
      request: {
        data: {
          user: {
            profile: {
              contact: { email: "deep@test.com", phone: "+1234567890" },
            },
          },
        },
      },
    };
    const scrubbed = scrubPII(event);
    assert.equal(
      scrubbed.request.data.user.profile.contact.email,
      "[REDACTED]"
    );
    assert.equal(
      scrubbed.request.data.user.profile.contact.phone,
      "[REDACTED]"
    );
  });

  it("a deliberately thrown error with a user object contains no PII after scrubbing", () => {
    // Simulate what happens when log.error() is called with a user object.
    const userPayload = {
      email: "leaked@example.com",
      phone: "+2348012345678",
      password: "plaintext-password",
      name: "Test User",
      role: "TEACHER",
    };

    const event = {
      exception: { values: [{ type: "Error", value: "user load failed" }] },
      extra: { user: userPayload },
    };

    const scrubbed = scrubPII(event);

    // PII fields must be redacted.
    assert.equal(scrubbed.extra.user.email, "[REDACTED]");
    assert.equal(scrubbed.extra.user.phone, "[REDACTED]");
    assert.equal(scrubbed.extra.user.password, "[REDACTED]");

    // Non-PII fields must survive.
    assert.equal(scrubbed.extra.user.name, "Test User");
    assert.equal(scrubbed.extra.user.role, "TEACHER");
  });
});
