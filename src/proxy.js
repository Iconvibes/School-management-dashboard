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

// Security headers applied to EVERY response that passes through the proxy
// (HTML pages AND API routes). Scripts are nonce-based in production: the
// proxy generates a fresh nonce per request, announces it in the response CSP
// (`'nonce-…'`, no `'unsafe-inline'`), and ALSO stamps the forwarded request
// with the same policy — Next 16's renderer extracts the script nonce from
// the request's CSP header (app-render/getScriptNonceFromHeader) and applies
// it to every inline script it emits (the flight-data bootstrap, RSC payload,
// and webpack chunk loads), so the browser only ever runs nonced scripts.
// Dev keeps `'unsafe-inline'` + `'unsafe-eval'`: the dev server inlines its
// bootstrap and React's dev-mode debugging uses eval(). `style-src` keeps
// `'unsafe-inline'` in both modes — the app sets inline style attributes
// (brand colors, chart geometry), which CSP governs via style-src. Turnstile
// needs its challenge origin. The rest follow the helmet playbook.
const IS_DEV = process.env.NODE_ENV !== "production";

function buildSecurityHeaders(nonce) {
  const scriptSrc = IS_DEV
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com;"
    : `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com;`;
  return {
    "Content-Security-Policy":
      "default-src 'self'; " +
      scriptSrc +
      " style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; " +
      "font-src 'self' data:; " +
      "connect-src 'self'; " +
      "worker-src 'self' blob:; " +
      "frame-src 'self' https://challenges.cloudflare.com; " +
      "object-src 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'; " +
      "frame-ancestors 'self'",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()",
  };
}

function withSecurityHeaders(response, nonce) {
  for (const [name, value] of Object.entries(buildSecurityHeaders(nonce))) {
    response.headers.set(name, value);
  }
  return response;
}

/**
 * Proxy entry point: run the route guard, then stamp every response with the
 * security headers (redirects too, so a bounced visitor never gets an
 * un-headered page). Each request gets a FRESH script nonce, and the
 * forwarded request carries the same CSP so Next's renderer can extract it
 * and nonce its inline scripts (see buildSecurityHeaders).
 */
export function proxy(request) {
  const nonce = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "content-security-policy",
    buildSecurityHeaders(nonce)["Content-Security-Policy"]
  );
  return withSecurityHeaders(route(request, requestHeaders), nonce);
}

/** Render the page downstream, carrying the CSP header for nonce extraction. */
function renderNext(requestHeaders) {
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/** The existing route-guard logic (kept pure for testability). */
function route(request, requestHeaders) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? verifyToken(token) : null;

  // Authenticated users don't need the auth pages (login, register) — send
  // them to their role home, or to a validated ?next= deep link they are
  // allowed to render. (resolvePostLoginRedirect guarantees the target is
  // role-safe, so this can never bounce back into the proxy in a loop.)
  if (pathname === "/login" || pathname === "/register") {
    if (!session?.role) return renderNext(requestHeaders);
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
    return renderNext(requestHeaders);
  }

  const guard = matchPortalGuard(pathname);
  if (!guard) return renderNext(requestHeaders);

  // Missing/invalid session, or a valid session aimed at the wrong portal —
  // sign in first. The original path is carried in ?next= so the login flow
  // can drop the user back where they were going (if their role allows it).
  if (!session?.role || !guard.roles.includes(session.role)) {
    return signInFirst(request);
  }

  return renderNext(requestHeaders);
}

/** Redirect to /login, remembering where the visitor was headed. */
function signInFirst(request) {
  const { pathname } = request.nextUrl;
  const next = encodeURIComponent(pathname + request.nextUrl.search);
  return NextResponse.redirect(new URL(`/login?next=${next}`, request.url));
}

export const config = {
  matcher: [
    // EVERY path except Next's internal static/image pipeline and binary
    // assets — so HTML pages AND API routes all get the security headers
    // (the portal guards above only act on the paths they own). Running the
    // proxy on /api/* is cheap: a header stamp, no JWT work, no DB.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js|map)$).*)",
  ],
};
