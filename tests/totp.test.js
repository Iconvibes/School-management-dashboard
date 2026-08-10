/**
 * TOTP tests — provable against RFC 6238 Appendix B.
 *
 * The official test vectors use the ASCII secret "12345678901234567890" (the
 * base32 of the 20-byte ASCII string is GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ).
 * 8-digit codes are the RFC's published values; 6-digit codes (what this app
 * uses) are the same HOTP value truncated to 6 digits.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSecret, otpauthUri, totpAt, verifyTotp } from "../src/lib/totp.js";

const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

// RFC 6238 Appendix B (SHA-1): TIME IN SECONDS → 8-digit TOTP. The RFC's
// "Time (sec)" column is epoch seconds; the HOTP counter is floor(time/30).
const RFC_VECTORS = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
];

describe("totpAt — RFC 6238 vectors", () => {
  it("reproduces the 8-digit SHA-1 vectors", () => {
    for (const [timeSec, expected] of RFC_VECTORS) {
      const counter = Math.floor(timeSec / 30);
      assert.equal(totpAt(RFC_SECRET_B32, counter, 8), expected, `time ${timeSec}`);
    }
  });

  it("reproduces the 6-digit forms used by the app", () => {
    for (const [timeSec, expected8] of RFC_VECTORS) {
      const counter = Math.floor(timeSec / 30);
      const expected6 = String(Number(expected8) % 1000000).padStart(6, "0");
      assert.equal(totpAt(RFC_SECRET_B32, counter, 6), expected6, `time ${timeSec}`);
    }
  });
});

describe("verifyTotp", () => {
  it("accepts the current code and ±1 window (30s drift)", () => {
    const secret = RFC_SECRET_B32;
    const now = 1700000000 * 1000; // any fixed epoch
    const counter = Math.floor(now / 1000 / 30);
    assert.equal(verifyTotp(secret, totpAt(secret, counter), { now }), true);
    assert.equal(verifyTotp(secret, totpAt(secret, counter - 1), { now }), true);
    assert.equal(verifyTotp(secret, totpAt(secret, counter + 1), { now }), true);
  });

  it("rejects wrong, malformed and out-of-window codes", () => {
    const secret = RFC_SECRET_B32;
    const now = 1700000000 * 1000;
    const counter = Math.floor(now / 1000 / 30);
    assert.equal(verifyTotp(secret, "000000", { now }), false);
    assert.equal(verifyTotp(secret, "12345", { now }), false); // 5 digits
    assert.equal(verifyTotp(secret, "abcdef", { now }), false);
    assert.equal(verifyTotp(secret, "", { now }), false);
    assert.equal(verifyTotp(secret, null, { now }), false);
    // Two full windows away is outside the default ±1 window.
    assert.equal(verifyTotp(secret, totpAt(secret, counter - 3), { now }), false);
    // ...but a wider window accepts it.
    assert.equal(verifyTotp(secret, totpAt(secret, counter - 3), { now, window: 3 }), true);
  });
});

describe("generateSecret", () => {
  it("returns a 32-char base32 string (160 bits) with only valid alphabet chars", () => {
    const s = generateSecret();
    assert.match(s, /^[A-Z2-7]{32}$/);
  });

  it("is unique across calls", () => {
    assert.notEqual(generateSecret(), generateSecret());
  });
});

describe("otpauthUri", () => {
  it("builds the standard otpauth://totp URI with app params", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", { accountName: "admin@school.app" });
    assert.ok(uri.startsWith("otpauth://totp/Edutrack:admin%40school.app?"));
    assert.ok(uri.includes("secret=JBSWY3DPEHPK3PXP"));
    assert.ok(uri.includes("issuer=Edutrack"));
    assert.ok(uri.includes("algorithm=SHA1"));
    assert.ok(uri.includes("digits=6"));
    assert.ok(uri.includes("period=30"));
  });
});
