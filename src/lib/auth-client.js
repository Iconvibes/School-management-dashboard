/**
 * Client-side helper for the "session check failed" path.
 *
 * Portals re-validate their session via /api/auth/me; on a 401 they bounce to
 * /login. The proxy redirects a visitor holding a valid JWT away from /login
 * to their role home — so if the JWT is still valid but the account no longer
 * exists (user deleted, demo store reset), the visitor would ping-pong between
 * /login and the portal forever. Clearing the cookie here breaks that loop:
 * the next /login visit renders the actual form.
 */
export function bounceToLogin(router) {
  fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  router.replace("/login");
}
