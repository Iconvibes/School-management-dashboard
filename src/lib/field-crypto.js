/**
 * Field-level encryption at rest — AES-256-GCM + HMAC blind indexes.
 *
 * PII fields (email, phone) are stored encrypted so a leaked database or
 * snapshot yields no readable identity data. Two primitives:
 *
 *   encryptField / decryptField
 *     AES-256-GCM with a random 12-byte IV per value and a versioned,
 *     self-describing envelope (`enc:v1:<iv>.<tag>.<ct>`, base64url). GCM
 *     authenticates the ciphertext, so a tampered or wrong-key value FAILS
 *     closed (decrypt returns null — never garbage). Values that are NOT
 *     `enc:v1:` envelopes pass through unchanged, so legacy plaintext rows
 *     (existing snapshots / pre-encryption Mongo docs) keep working until
 *     they are rewritten.
 *
 *   blindEmailIndex / blindPhoneIndex
 *     Deterministic HMAC-SHA256 of the NORMALIZED value (email lowercased +
 *     trimmed; phone stripped to digits). Two identical plaintexts always
 *     produce the same index, so equality lookups (login by email, dedupe)
 *     and unique constraints work against encrypted storage WITHOUT ever
 *     exposing the plaintext or enabling offline dictionary attacks on the
 *     ciphertext. Indexes are prefixed `idx:v1:` and must NEVER leave the
 *     server (they are stripped from every public user/lead shape).
 *
 * Key handling: a single DATA_ENC_KEY env var seeds two HKDF-derived keys —
 * one for AES, one for HMAC — so the two purposes are cryptographically
 * separated. In dev/demo (no env var) a deterministic fallback key is used,
 * exactly like JWT_SECRET.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const DEV_FALLBACK = "edutrack-dev-data-key-change-in-prod";

/** Normalize the env key into 32 raw bytes (hex, base64, or hashed). */
function masterKey() {
  const raw = process.env.DATA_ENC_KEY;
  if (raw) {
    if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
    if (/^[A-Za-z0-9+/]{43}=$|^[A-Za-z0-9+/]{44}$/.test(raw)) {
      const b64 = Buffer.from(raw, "base64");
      if (b64.length === 32) return b64;
    }
  }
  return createHash("sha256").update(raw || DEV_FALLBACK).digest();
}

const MASTER = masterKey();

// Two independent keys from one master — an attacker holding one derived key
// (say the HMAC key from an index leak) still cannot decrypt any field.
const ENC_KEY = hkdfSync("sha256", MASTER, "edutrack-enc", "field-encryption", 32);
const IDX_KEY = hkdfSync("sha256", MASTER, "edutrack-idx", "field-blind-index", 32);

const ENC_PREFIX = "enc:v1:";
const IDX_PREFIX = "idx:v1:";

/** True when the value is an encrypted envelope (not a legacy plaintext). */
export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

/** Encrypt a plaintext string. Returns "" for empty/absent values. */
export function encryptField(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === "") return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    ENC_PREFIX +
    [iv, tag, ct].map((b) => b.toString("base64url")).join(".")
  );
}

/**
 * Decrypt an `enc:v1:` envelope. Returns the plaintext; null when the value
 * is not an envelope (legacy plaintext) or GCM authentication fails (tampered
 * or wrong key). Empty/absent values pass through as-is.
 */
export function decryptField(value) {
  if (typeof value !== "string" || value === "") return value;
  if (!value.startsWith(ENC_PREFIX)) return value; // legacy plaintext
  const [iv, tag, ct] = value
    .slice(ENC_PREFIX.length)
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !ct) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", ENC_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null; // fail closed — never return garbage
  }
}

/** Normalize for the blind index: emails are case/whitespace-insensitive. */
export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/** Normalize for the blind index: phones are formatting-insensitive. */
export function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

/** Deterministic equality index for an email. "" when empty. */
export function blindEmailIndex(email) {
  const norm = normalizeEmail(email);
  if (!norm) return "";
  return IDX_PREFIX + createHmac("sha256", IDX_KEY).update(norm).digest("base64url");
}

/** Deterministic equality index for a phone. "" when empty. */
export function blindPhoneIndex(phone) {
  const norm = normalizePhone(phone);
  if (!norm) return "";
  return IDX_PREFIX + createHmac("sha256", IDX_KEY).update(norm).digest("base64url");
}

/**
 * Stable, NON-secret identity of the derived encryption master key — used by
 * the backup tooling so a manifest can record which DATA_ENC_KEY produced its
 * ciphertext, and a restore can refuse to load ciphertext its current key
 * cannot decrypt. SHA-256 of the 32-byte master is preimage-safe (the same
 * trick KMS uses for key IDs): revealing the fingerprint can never recover
 * the key. The hex and base64 forms of the same DATA_ENC_KEY normalize to the
 * same master, so they fingerprint identically — backups stay restorable
 * regardless of which spelling the operator used.
 */
export function dataKeyFingerprint() {
  return "key:v1:" + createHash("sha256").update(MASTER).digest("hex").slice(0, 16);
}
