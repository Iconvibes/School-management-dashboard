/**
 * Pins the framework-native security headers configured in next.config.mjs —
 * the App Router equivalent of helmet. If someone removes or weakens a header,
 * this test fails with a diff instead of silently shipping without it.
 *
 * (The headers themselves are emitted by Next at request time; what we can
 * unit-test is the config contract: one rule for every path, with the exact
 * keys/values the security posture depends on.)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config.mjs";

const EXPECTED_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

describe("next.config security headers", () => {
  it("applies the header rule to every path", async () => {
    assert.equal(typeof nextConfig.headers, "function");
    const rules = await nextConfig.headers();
    const rule = rules.find((r) => r.source === "/:path*");
    assert.ok(rule, "expected a header rule matching /:path*");
  });

  it("sets every header in the security posture with its exact value", async () => {
    const rules = await nextConfig.headers();
    const rule = rules.find((r) => r.source === "/:path*");
    const byKey = Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
    for (const [key, value] of Object.entries(EXPECTED_HEADERS)) {
      assert.equal(byKey[key], value, `${key} header`);
    }
  });

  it("does not ship an unsafe or duplicated header set", async () => {
    const rules = await nextConfig.headers();
    const rule = rules.find((r) => r.source === "/:path*");
    const keys = rule.headers.map((h) => h.key);
    assert.equal(new Set(keys).size, keys.length, "duplicate header keys");
    // Permissions-Policy must NOT lock down features the app depends on:
    // notifications (class alarms), clipboard-write (copy password), payment.
    const pp = rule.headers.find((h) => h.key === "Permissions-Policy")?.value || "";
    for (const kept of ["notifications", "clipboard-write", "payment"]) {
      assert.ok(!pp.includes(kept), `Permissions-Policy must not restrict ${kept}`);
    }
  });
});
