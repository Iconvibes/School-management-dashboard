/**
 * Password reset token management.
 *
 * Generates time-limited, single-use tokens for self-service password reset.
 * Tokens are stored in-memory (demo) or MongoDB (production) and expire after
 * 1 hour. Each token is linked to a user+school pair and consumed on use.
 *
 * In demo mode, the token is also logged to the console so testers can
 * copy-paste it into the reset URL without needing email delivery.
 */
import { store } from "@/lib/store";
import * as log from "@/lib/log";
import { randomBytes } from "node:crypto";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_LENGTH = 48;

/**
 * Generate a cryptographically random hex token.
 */
function generateToken() {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  // Use crypto.getRandomValues if available (browser/edge), fallback to
  // randomBytes (Node.js).
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    const { randomBytes } = require("crypto");
    const buf = randomBytes(TOKEN_LENGTH);
    for (let i = 0; i < TOKEN_LENGTH; i++) bytes[i] = buf[i];
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create a password reset token for a user.
 *
 * @param {Object} opts
 * @param {string} opts.userId — the user requesting reset
 * @param {string} opts.schoolId — the user's school
 * @param {string} opts.email — the user's email (for logging)
 * @returns {{ token: string, expiresAt: string }}
 */
export async function createResetToken({ userId, schoolId, email }) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  // Store the token
  await store.createPasswordResetToken({
    token,
    userId,
    schoolId,
    email,
    expiresAt,
    used: false,
    createdAt: new Date().toISOString(),
  });

  log.info("password-reset", `Reset token created for ${email} (school: ${schoolId})`);

  // In demo mode, log the token so testers can use it
  if (process.env.NODE_ENV !== "production") {
    log.info("password-reset", `DEMO MODE — Reset URL: /reset-password?token=${token}`);
  }

  return { token, expiresAt };
}

/**
 * Consume a password reset token and update the user's password.
 *
 * @param {string} token — the reset token
 * @param {string} newPassword — the new password (already validated for length)
 * @returns {{ success: boolean, error?: string, user?: Object }}
 */
export async function consumeResetToken(token, newPassword) {
  if (!token || !newPassword) {
    return { success: false, error: "Token and new password are required" };
  }

  // Find the token
  const record = await store.findPasswordResetToken(token);
  if (!record) {
    return { success: false, error: "Invalid or expired reset link" };
  }

  if (record.used) {
    return { success: false, error: "This reset link has already been used. Request a new one." };
  }

  if (new Date(record.expiresAt) < new Date()) {
    return { success: false, error: "This reset link has expired. Request a new one." };
  }

  // Mark token as used
  await store.consumePasswordResetToken(token);

  // Update the user's password
  const { hash } = await import("@/modules/shared/store-state");
  const bcrypt = await import("bcrypt");
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const user = await store.updateUser(record.userId, {
    password: hashedPassword,
    generatedPassword: newPassword,
    passwordSet: true,
  });

  if (!user) {
    return { success: false, error: "Failed to update password" };
  }

  // Invalidate cached auth snapshots so the user must re-authenticate
  try {
    const { invalidateAuthSnapshot } = await import("@/lib/policy");
    await invalidateAuthSnapshot(record.userId);
  } catch {}

  log.info("password-reset", `Password reset completed for user ${record.userId}`);

  return { success: true, user };
}

/**
 * Find a user by email across all schools.
 * Used by the forgot-password endpoint to locate the user.
 *
 * @param {string} email
 * @returns {Object|null} user object or null
 */
export async function findUserByEmail(email) {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  // listUsers filters by schoolId, so we need to search across all schools
  const schoolIds = await store.listSchoolIds();
  for (const schoolId of schoolIds) {
    const users = await store.listUsers({ schoolId });
    const found = users.find((u) => u.email === normalized);
    if (found) return found;
  }
  return null;
}

// ── Email Verification ───────────────────────────────────────────────

const VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

function generateVerificationToken() {
  return randomBytes(32).toString("hex");
}

/**
 * Send a verification email to the school admin after registration.
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.schoolId
 * @param {string} opts.email
 * @param {string} opts.adminName
 * @param {string} opts.schoolName
 */
export async function sendVerificationEmail({ userId, schoolId, email, adminName, schoolName }) {
  const token = generateVerificationToken();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();

  // Store the token
  await store.createEmailVerificationToken({
    token,
    userId,
    schoolId,
    email,
    expiresAt,
    used: false,
    createdAt: new Date().toISOString(),
  });

  const verifyUrl = `/verify-email?token=${token}`;
  const fullUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}${verifyUrl}`;

  log.info("email-verification", `Verification email for ${email} (school: ${schoolId})`);

  // In dev mode, log the URL
  if (process.env.NODE_ENV !== "production") {
    log.info("email-verification", `DEMO: Verification URL: ${fullUrl}`);
  }

  // Send the email via the mailer
  try {
    const { sendEmail, isEmailConfigured } = await import("@/lib/mailer");
    if (isEmailConfigured()) {
      const { emailVerification } = await import("@/lib/email-templates");
      const template = emailVerification({ adminName, schoolName, verifyUrl: fullUrl });
      await sendEmail({ to: email, subject: template.subject, text: template.text, html: template.html });
      log.info("email-verification", `Verification email sent to ${email}`);
    } else {
      log.info("email-verification", `Email not configured — verification URL logged for dev testing`);
    }
  } catch (err) {
    log.warn("email-verification", `Failed to send email: ${err.message}`);
  }

  return { token, expiresAt };
}

/**
 * Verify an email using the token.
 *
 * @param {string} token
 * @returns {{ success: boolean, error?: string }}
 */
export async function verifyEmail(token) {
  if (!token || typeof token !== "string") {
    return { success: false, error: "Invalid verification token" };
  }

  const record = await store.findEmailVerificationToken(token);
  if (!record) {
    return { success: false, error: "Invalid or expired verification link" };
  }

  if (record.used) {
    return { success: false, error: "This verification link has already been used" };
  }

  if (new Date(record.expiresAt) < new Date()) {
    return { success: false, error: "This verification link has expired. Request a new one." };
  }

  // Mark token as used
  await store.consumeEmailVerificationToken(token);

  // Update the school's emailVerified status
  const school = await store.getSchoolById(record.schoolId);
  if (school) {
    await store.updateSchool(record.schoolId, {
      emailVerified: true,
      emailVerifiedAt: new Date().toISOString(),
    });
  }

  log.info("email-verification", `Email verified for school ${record.schoolId}`);

  return { success: true };
}

/**
 * Send a registration approval email to the school admin.
 */
export async function sendApprovalEmail({ schoolId, adminEmail, adminName, schoolName }) {
  try {
    const { registrationApproved } = await import("@/lib/email-templates");
    const { sendEmail, isEmailConfigured } = await import("@/lib/mailer");

    if (!isEmailConfigured()) {
      log.info("approval-email", `Email not configured — approval notification logged for dev testing: ${adminEmail}`);
      return;
    }

    const school = await store.getSchoolById(schoolId);
    const template = registrationApproved({
      adminName,
      schoolName,
      brandColor: school?.brandColor || "#2563EB",
    });

    await sendEmail({ to: adminEmail, subject: template.subject, text: template.text, html: template.html });
    log.info("approval-email", `Approval email sent to ${adminEmail} for ${schoolName}`);
  } catch (err) {
    log.warn("approval-email", `Failed to send approval email: ${err.message}`);
  }
}

/**
 * Send a registration rejection email to the school admin.
 */
export async function sendRejectionEmail({ schoolId, adminEmail, adminName, schoolName, reason }) {
  try {
    const { registrationRejected } = await import("@/lib/email-templates");
    const { sendEmail, isEmailConfigured } = await import("@/lib/mailer");

    if (!isEmailConfigured()) {
      log.info("rejection-email", `Email not configured — rejection notification logged for dev testing: ${adminEmail}`);
      return;
    }

    const school = await store.getSchoolById(schoolId);
    const template = registrationRejected({
      adminName,
      schoolName,
      reason,
      brandColor: school?.brandColor || "#2563EB",
    });

    await sendEmail({ to: adminEmail, subject: template.subject, text: template.text, html: template.html });
    log.info("rejection-email", `Rejection email sent to ${adminEmail} for ${schoolName}`);
  } catch (err) {
    log.warn("rejection-email", `Failed to send rejection email: ${err.message}`);
  }
}
