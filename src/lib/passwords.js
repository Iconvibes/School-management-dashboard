/**
 * Password helpers for the reset-password flow.
 *
 * generatePassword() produces a human-friendly temporary password: 10 chars,
 * mixed case + digits, no ambiguous characters (0/O, 1/l/I) so it's easy to
 * read back over the phone or copy from a printed credentials sheet.
 */
import { randomInt } from "node:crypto";

export const PASSWORD_MIN_LENGTH = 6;
// bcrypt silently truncates input at 72 bytes — cap custom passwords below
// that so two different long passwords can never hash identically.
export const PASSWORD_MAX_LENGTH = 72;

// No 0/O/1/l/I — avoids the classic read-aloud mixups.
const CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Generate a random temporary password.
 * @param {number} [length] default 10
 * @returns {string}
 */
export function generatePassword(length = 10) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARS[randomInt(CHARS.length)];
  }
  return out;
}

/**
 * Normalize a name into the predictable lowercase login form used across the
 * app: lowercase, non-alphanumerics stripped, spaces removed. The same rule
 * powers student auto-passwords ("Adam Tope" + "JSS1" → "adamtopejss1") and
 * parent child-name passwords ("Adam Tope Johnson" → "adamtopejohnson").
 */
export function nameSlug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Parent login check: a parent signs in with their email plus ANY linked
 * child's full name (slugged — case/spacing-insensitive), so one parent with
 * several children can use whichever child's name they remember. Returns true
 * when `password` matches one of the children's names.
 */
export function matchesChildName(password, children) {
  const attempt = nameSlug(password);
  if (!attempt) return false;
  return children.some((c) => nameSlug(c && c.name) === attempt);
}
