/**
 * Field-crypto tests — AES-256-GCM envelopes + HMAC blind indexes.
 *
 * Covers the security properties the encryption-at-rest design depends on:
 *   - round-trip fidelity (encrypt → decrypt returns the exact plaintext)
 *   - fail-closed tampering (GCM auth catches every mutation → null, never garbage)
 *   - blind indexes are deterministic, normalized, and unreadable
 *   - legacy plaintext values pass through (pre-encryption snapshots/docs)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encryptField,
  decryptField,
  isEncrypted,
  blindEmailIndex,
  blindPhoneIndex,
  normalizeEmail,
  normalizePhone,
} from "../src/lib/field-crypto.js";

describe("encryptField / decryptField", () => {
  it("round-trips an email and a phone exactly", () => {
    assert.equal(decryptField(encryptField("admin@edutrack.app")), "admin@edutrack.app");
    assert.equal(decryptField(encryptField("0803 123 4567")), "0803 123 4567");
    assert.equal(decryptField(encryptField("p.adebayo@edutrack.app")), "p.adebayo@edutrack.app");
  });

  it("produces a versioned envelope that never contains the plaintext", () => {
    const ct = encryptField("admin@edutrack.app");
    assert.ok(isEncrypted(ct));
    assert.ok(ct.startsWith("enc:v1:"));
    assert.ok(!ct.includes("admin@edutrack.app"));
    // Three dots: iv, tag, ciphertext — all base64url.
    const parts = ct.slice("enc:v1:".length).split(".");
    assert.equal(parts.length, 3);
    assert.ok(parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p)));
  });

  it("uses a fresh random IV — the same plaintext never encrypts identically", () => {
    const a = encryptField("same@example.com");
    const b = encryptField("same@example.com");
    assert.notEqual(a, b);
  });

  it("returns '' for empty/absent values (no pointless envelopes)", () => {
    assert.equal(encryptField(""), "");
    assert.equal(encryptField(undefined), "");
    assert.equal(encryptField(null), "");
  });

  it("passes legacy plaintext through unchanged (pre-encryption data)", () => {
    assert.equal(decryptField("admin@edutrack.app"), "admin@edutrack.app");
    assert.equal(decryptField("0803 123 4567"), "0803 123 4567");
    assert.equal(decryptField(""), "");
    assert.equal(decryptField(undefined), undefined);
    assert.equal(decryptField(null), null);
  });

  it("fails CLOSED on any tampering — never returns garbage", () => {
    const ct = encryptField("admin@edutrack.app");
    // Flip one character in the IV part → GCM auth must fail.
    const ivEnd = ct.indexOf(".", "enc:v1:".length);
    const tampered = ct.slice(0, ivEnd) + (ct[ivEnd] === "A" ? "B" : "A") + ct.slice(ivEnd + 1);
    assert.equal(decryptField(tampered), null);

    // Flip one character in the ciphertext part.
    const flipped =
      ct.slice(0, ct.length - 1) + (ct.endsWith("A") ? "B" : "A");
    assert.equal(decryptField(flipped), null);

    // Truncated envelopes and junk with the prefix fail too.
    assert.equal(decryptField("enc:v1:abc"), null);
    assert.equal(decryptField("enc:v1:not-base64!"), null);
  });
});

describe("blind indexes", () => {
  it("are deterministic and versioned", () => {
    const a = blindEmailIndex("admin@edutrack.app");
    const b = blindEmailIndex("admin@edutrack.app");
    assert.equal(a, b);
    assert.ok(a.startsWith("idx:v1:"));
    assert.ok(a.length > "idx:v1:".length);
  });

  it("normalize emails: case and surrounding whitespace are ignored", () => {
    assert.equal(normalizeEmail("  Admin@Edutrack.APP  "), "admin@edutrack.app");
    assert.equal(
      blindEmailIndex("Admin@Edutrack.APP"),
      blindEmailIndex("admin@edutrack.app")
    );
  });

  it("normalize phones: formatting (spaces, dashes, +) is ignored", () => {
    assert.equal(normalizePhone("0803 123-4567"), "08031234567");
    assert.equal(normalizePhone("+234 803 123 4567"), "2348031234567");
    assert.equal(
      blindPhoneIndex("0803 123 4567"),
      blindPhoneIndex("08031234567")
    );
  });

  it("never contains the plaintext and differs across values", () => {
    const idx = blindEmailIndex("admin@edutrack.app");
    assert.ok(!idx.includes("admin@edutrack.app"));
    assert.notEqual(
      blindEmailIndex("admin@edutrack.app"),
      blindEmailIndex("bursar@edutrack.app")
    );
    assert.notEqual(
      blindPhoneIndex("08031234567"),
      blindPhoneIndex("08031234568")
    );
  });

  it("return '' for empty values", () => {
    assert.equal(blindEmailIndex(""), "");
    assert.equal(blindEmailIndex("   "), "");
    assert.equal(blindPhoneIndex(""), "");
    assert.equal(blindPhoneIndex(undefined), "");
  });
});

describe("key separation", () => {
  it("the HMAC index key cannot decrypt ciphertext (purposes are split)", () => {
    // Without touching env we can't swap keys in-process, but we CAN assert
    // the structural contract: an index is NOT an enc envelope, and indexes
    // and ciphertexts share no readable content.
    const ct = encryptField("admin@edutrack.app");
    const idx = blindEmailIndex("admin@edutrack.app");
    assert.ok(!isEncrypted(idx));
    assert.ok(!ct.startsWith("idx:v1:"));
    assert.notEqual(ct, idx);
  });
});
