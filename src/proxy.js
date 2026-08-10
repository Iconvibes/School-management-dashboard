/**
 * Page-route guard — Next 16 `proxy` (the successor to middleware).
 *
 * The four role portals are locked to their roles at the routing layer, so a
 * student can never even RECEIVE the admin console's HTML and the wrong role
 * can never render the wrong portal.
 *
 * This is the OPTIMISTIC render layer, not the authorization boundary — per
 * the Next docs, proxy must not do slow work, so it only checks the JWT's
 * role claim and never touches the database:
 *   1. Proxy  — valid token + role claim matches the portal → render;
 *               otherwise redirect to /login. (A token whose role changed is
 *               still valid here by design — the next /api/auth/me call 401s
 *               and the dashboard bounces the user, which is the P1
 *               revalidation path.)
 *   2. API    — every data call re-validates the session against the store
 *               (see policy.js requireAuth), the authoritative boundary.
 *   3. Client — dashboards re-check /api/auth/me and send stale sessions to
 *               /login.
 */
// `next/server.js` (not `next/server`): Next aliases the extensionless form
// internally, but plain `node --test` (tests/proxy.test.js) resolves this
// file's imports too — same rule as the headers/server imports in auth.js.
import { NextResponse } from "next/server.js";
import { COOKIE_NAME, verifyToken } from "@/lib/token";
import { ROLES } from "@/lib/permissions";
import {
  matchPortalGuard,
  resolvePostLoginRedirect,
  ROLE_HOME,
} from "@/lib/portal-guard";

export function proxy(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? verifyToken(token) : null;

  // Authenticated users don't need the auth pages (login, register) — send
  // them to their role home, or to a validated ?next= deep link they are
  // allowed to render. (resolvePostLoginRedirect guarantees the target is
  // role-safe, so this can never bounce back into the proxy in a loop.)
  if (pathname === "/login" || pathname === "/register") {
    if (!session?.role) return NextResponse.next();
    const target = resolvePostLoginRedirect(
      session.role,
      request.nextUrl.searchParams.get("next")
    );
    return NextResponse.redirect(new URL(target, request.url));
  }

  // Onboarding is the founding SUPER_ADMIN's one-time setup wizard. The proxy
  // enforces the role (JWT only); whether onboarding is still needed is a DB
  // question (school.onboardingComplete), so the page re-checks that itself
  // and redirects to /admin/dashboard once it's done.
  if (pathname === "/onboarding") {
    if (!session?.role) return signInFirst(request);
    if (session.role !== ROLES.SUPER_ADMIN) {
      return NextResponse.redirect(new URL(ROLE_HOME[session.role] || "/", request.url));
    }
    return NextResponse.next();
  }

  // MFA screens are mid-login: the browser holds the short-lived pending
  // ticket, not a session. A fully authenticated session has already passed
  // MFA, so send it home instead.
  if (pathname === "/mfa" || pathname.startsWith("/mfa/")) {
    if (session?.role) {
      return NextResponse.redirect(new URL(ROLE_HOME[session.role] || "/", request.url));
    }
    return NextResponse.next();
  }

  const guard = matchPortalGuard(pathname);
  if (!guard) return NextResponse.next();

  // Missing/invalid session, or a valid session aimed at the wrong portal —
  // sign in first. The original path is carried in ?next= so the login flow
  // can drop the user back where they were going (if their role allows it).
  if (!session?.role || !guard.roles.includes(session.role)) {
    return signInFirst(request);
  }

  return NextResponse.next();
}

/** Redirect to /login, remembering where the visitor was headed. */
function signInFirst(request) {
  const { pathname } = request.nextUrl;
  const next = encodeURIComponent(pathname + request.nextUrl.search);
  return NextResponse.redirect(new URL(`/login?next=${next}`, request.url));
}

export const config = {
  matcher: [
    // The four role portals plus the auth pages and onboarding (all handled
    // above) — API routes, marketing pages and static assets are untouched
    // (guarded by requireAuth/requirePermission).
    "/admin/:path*",
    "/teacher/:path*",
    "/student/:path*",
    "/parent/:path*",
    "/login",
    "/register",
    "/onboarding",
    "/mfa/:path*",
  ],
};
