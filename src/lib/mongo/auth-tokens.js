/**
 * Mongo store — auth-tokens domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */


// ── Password Reset Tokens ────────────────────────────────────────────
// In-memory stubs mirroring the demo store signatures — single-use,
// time-limited (1h) tokens created by src/lib/password-reset.js through the
// store seam. Real Mongo collections follow when the feature ships.

const _passwordResetTokens = [];

export async function createPasswordResetToken(record) {
  _passwordResetTokens.push({ ...record });
  return record;
}

export async function findPasswordResetToken(token) {
  return _passwordResetTokens.find((t) => t.token === token) || null;
}

export async function consumePasswordResetToken(token) {
  const record = _passwordResetTokens.find((t) => t.token === token);
  if (record) record.used = true;
  return !!record;
}

// ── Email Verification Tokens stubs ──────────────────────────────────

const _emailVerificationTokens = [];

export async function createEmailVerificationToken(record) {
  // Invalidate any existing unverified tokens for this user
  _emailVerificationTokens.forEach((t) => {
    if (t.userId === record.userId && !t.used) t.used = true;
  });
  _emailVerificationTokens.push({ ...record });
  return record;
}

export async function findEmailVerificationToken(token) {
  return _emailVerificationTokens.find((t) => t.token === token) || null;
}

export async function consumeEmailVerificationToken(token) {
  const record = _emailVerificationTokens.find((t) => t.token === token);
  if (record) record.used = true;
  return !!record;
}
