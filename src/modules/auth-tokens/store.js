/**
 * Auth tokens module — password reset + email verification tokens (demo).
 *
 * In-memory arrays mirroring the mongo-store stubs: single-use, time-limited
 * tokens created by src/lib/password-reset.js through the store seam.
 * Re-exported from demo-store.js so @/lib/store serves both backends.
 */
import {
  passwordResetTokens,
  emailVerificationTokens,
  persist,
} from "@/modules/shared/store-state";

export async function createPasswordResetToken(record) {
  passwordResetTokens.push({ ...record });
  persist();
  return record;
}

export async function findPasswordResetToken(token) {
  return passwordResetTokens.find((t) => t.token === token) || null;
}

export async function consumePasswordResetToken(token) {
  const record = passwordResetTokens.find((t) => t.token === token);
  if (record) {
    record.used = true;
    persist();
  }
  return !!record;
}

export async function createEmailVerificationToken(record) {
  // Invalidate any existing unverified tokens for this user
  emailVerificationTokens.forEach((t) => {
    if (t.userId === record.userId && !t.used) t.used = true;
  });
  emailVerificationTokens.push({ ...record });
  persist();
  return record;
}

export async function findEmailVerificationToken(token) {
  return emailVerificationTokens.find((t) => t.token === token) || null;
}

export async function consumeEmailVerificationToken(token) {
  const record = emailVerificationTokens.find((t) => t.token === token);
  if (record) {
    record.used = true;
    persist();
  }
  return !!record;
}
