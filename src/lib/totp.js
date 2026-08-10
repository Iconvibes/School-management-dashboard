/**
 * TOTP (RFC 6238) — zero-dependency, node:crypto only.
 *
 * Implements the standard time-based one-time password used by authenticator
 * apps (Google Authenticator, Authy, 1Password…). Secret is base32 (RFC 4648),
 * HMAC-SHA1 with a 30-second period and 6-digit codes — the universal default.
 *
 * Provable against the RFC 6238 Appendix B test vectors (see tests/totp.test.js).
 */
import { createHmac, randomBytes } from "node:crypto";

const PERIOD = 30;
const DIGITS = 6;

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Encode bytes as base32 without padding (RFC 4648, as TOTP apps expect). */
function toBase32(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decode a base32 string (case-insensitive, optional padding/spaces). */
function fromBase32(input) {
  const clean = input.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const idx = B32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 20-byte (160-bit) random secret, base32 — the RFC's recommended size. */
export function generateSecret() {
  return toBase32(randomBytes(20));
}

/** The otpauth:// URI an authenticator app (or QR code) can consume. */
export function otpauthUri(secret, { issuer = "Edutrack", accountName = "" } = {}) {
  const label = encodeURIComponent(accountName);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${issuer}:${label}?${params.toString()}`;
}

/** The code for a specific time counter (0-based 30s steps since the epoch). */
export function totpAt(secret, counter, digits = DIGITS) {
  const key = fromBase32(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** digits;
  return String(otp).padStart(digits, "0");
}

/**
 * Verify a submitted code against a secret, allowing ±`window` timesteps of
 * clock drift (default 1 = ±30s). Comparison is constant-time.
 *
 * @param {string}  secret        base32 secret
 * @param {string}  code          the 6-digit code from the authenticator
 * @param {Object}  [opts]
 * @param {number}  [opts.now]    epoch ms (tests inject a fixed time)
 * @param {number}  [opts.window] allowed drift in 30s steps
 * @returns {boolean}
 */
export function verifyTotp(secret, code, { now = Date.now(), window = 1 } = {}) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / 1000 / PERIOD);
  const submitted = Buffer.from(code);
  // Constant-time-ish: compare all candidates, accept if any matches.
  // The i === 0 candidate covers the current counter, so no separate
  // "expected" buffer is needed.
  let matched = false;
  for (let i = -window; i <= window; i++) {
    const candidate = Buffer.from(totpAt(secret, counter + i));
    const same = candidate.length === submitted.length &&
      candidate.reduce((acc, b, j) => acc | (b ^ submitted[j]), 0) === 0;
    if (same) matched = true;
  }
  return matched;
}
