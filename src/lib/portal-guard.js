/**
 * Page-route → allowed roles for the four role portals. Pure data + helpers
 * (no Next.js imports) so tests can drive it and src/proxy.js stays a thin
 * redirect layer. Mirrors the route gates: the API remains the authoritative
 * boundary; this only decides which portal a role may RENDER.
 */
import { ROLES, STAFF_ROLES } from "@/lib/permissions";

const PORTAL_GUARDS = Object.freeze([
  { prefix: "/platform", roles: Object.freeze([ROLES.PLATFORM_ADMIN]) },
  { prefix: "/admin", roles: STAFF_ROLES }, // SUPER_ADMIN, BURSAR, REGISTRAR
  { prefix: "/teacher", roles: Object.freeze([ROLES.TEACHER]) },
  { prefix: "/student", roles: Object.freeze([ROLES.STUDENT]) },
  { prefix: "/parent", roles: Object.freeze([ROLES.PARENT]) },
]);

/** The guard whose prefix matches `pathname` (exact or sub-path), or undefined. */
export function matchPortalGuard(pathname) {
  return PORTAL_GUARDS.find(
    (g) => pathname === g.prefix || pathname.startsWith(`${g.prefix}/`)
  );
}

/**
 * May a session role render the page at `pathname`?
 * - unmatched path (login, marketing, etc.) → true — not a protected portal
 * - no/unknown role → false
 * - role not in the portal's allowed set → false
 */
export function mayRenderPortal(role, pathname) {
  const guard = matchPortalGuard(pathname);
  if (!guard) return true;
  return !!role && guard.roles.includes(role);
}

/**
 * Post-login landing page per role. The single source of truth — the login
 * API, the proxy's /login redirect and any auth UX all use this, so a new
 * role home is configured in exactly one place.
 */
export const ROLE_HOME = Object.freeze({
  [ROLES.PLATFORM_ADMIN]: "/platform/dashboard",
  [ROLES.SUPER_ADMIN]: "/admin/dashboard",
  [ROLES.BURSAR]: "/admin/dashboard",
  [ROLES.REGISTRAR]: "/admin/dashboard",
  [ROLES.TEACHER]: "/teacher/dashboard",
  [ROLES.STUDENT]: "/student/dashboard",
  [ROLES.PARENT]: "/parent/dashboard",
});

/** Pages a ?next= must never send someone to — they would just loop. */
const AUTH_PATHS = ["/login", "/register"];

/**
 * Sanitize a `?next=` query value into a safe local path, or "".
 * Open-redirect protection: only single-slash local paths survive — absolute
 * URLs (https://…), protocol-relative (//…), non-path values, and the auth
 * pages themselves are rejected. Query strings and hashes are preserved.
 */
export function sanitizeNext(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return "";
  const value = raw.trim();
  // Single-slash local paths only: absolute URLs, protocol-relative (//), and
  // backslash-laden values (URL parsers normalize \\ to /, so reject them
  // outright) are open-redirect vectors or confusion.
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "";
  const path = value.split(/[?#]/)[0];
  if (AUTH_PATHS.includes(path) || AUTH_PATHS.some((p) => path.startsWith(`${p}/`))) return "";
  return value;
}

/**
 * Where should a freshly logged-in (or already-authenticated) session go?
 * - no/unsafe ?next= → the role home
 * - ?next= is a public path (not a role portal) → ?next= itself, safe for anyone
 * - ?next= is a portal path → ?next= only if THIS role may render it, else the
 *   role home. Without this check an admin would be bounced /admin → /login
 *   → /admin forever; role-compatibility is what makes deep links loop-proof.
 */
export function resolvePostLoginRedirect(role, rawNext) {
  const next = sanitizeNext(rawNext);
  if (!next) return ROLE_HOME[role] || "/";
  if (!matchPortalGuard(next)) return next;
  return mayRenderPortal(role, next) ? next : ROLE_HOME[role] || "/";
}
