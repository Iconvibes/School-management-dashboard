/**
 * Proxy integration tests — drives the REAL src/proxy.js `proxy()` function
 * (Next 16 page-route guard) with hand-built Next requests.
 *
 * The portal-guard unit tests cover the pure helpers (matchPortalGuard,
 * resolvePostLoginRedirect, sanitizeNext…). These tests go one layer up and
 * exercise the actual redirects the browser receives, so the three behaviors
 * that keep the portals safe are locked in together:
 *
 *   1. bounce-with-next  — missing/invalid/wrong-role session on a portal
 *                          → 307 /login?next=<original path>
 *   2. authenticated /login (and /register) → role home, or a ?next= the role
 *                          may actually render (deep links survive)
 *   3. loop prevention    — the redirect target is always a page that role may
 *                          render, so following redirects always converges to
 *                          a 200 (never /login → /login → … or portal ping-pong)
 *
 * Requires the @/ alias hook (npm test loads tests/register-aliases.js) and
 * the `next/server.js` import in src/proxy.js (Next resolves both forms).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { proxy } from "../src/proxy.js";
import { signToken } from "../src/lib/token.js";
import { ROLES } from "../src/lib/permissions.js";
import { ROLE_HOME, mayRenderPortal } from "../src/lib/portal-guard.js";

const BASE = "http://localhost:3000";
const ALL_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.BURSAR,
  ROLES.REGISTRAR,
  ROLES.TEACHER,
  ROLES.STUDENT,
  ROLES.PARENT,
];

/** A fake Next request the proxy can read: real URL for nextUrl, stub cookies. */
function fakeRequest(path, { role = null, token = null } = {}) {
  const url = new URL(path, BASE);
  const cookie = token ?? (role ? signToken({ userId: "usr_1", role, schoolId: "sch_1" }) : null);
  return {
    url: url.toString(),
    nextUrl: url,
    cookies: {
      get: () => (cookie ? { value: cookie } : undefined),
    },
  };
}

/** The Location header of a redirect response, as path+search (or null). */
function redirectTarget(res) {
  const loc = res.headers.get("location");
  if (!loc) return null;
  const u = new URL(loc);
  return u.pathname + u.search;
}

/**
 * Follow redirects the way a browser would: start at `path` with a session
 * for `role`, re-issue the proxy for each Location, until a 200 or hop cap.
 * Returns the outcome — the loop-prevention property is "always converges".
 */
function follow(role, path, { maxHops = 8 } = {}) {
  let current = path;
  const visited = [];
  for (let hop = 0; hop < maxHops; hop++) {
    const res = proxy(fakeRequest(current, { role }));
    if (res.status === 200) {
      return { converged: true, hops: hop, final: current, visited };
    }
    const target = redirectTarget(res);
    if (!target) return { converged: false, hops: hop, final: current, visited };
    visited.push(target);
    current = target;
  }
  return { converged: false, hops: maxHops, final: current, visited };
}

describe("proxy — bounce-with-next (unauthenticated / wrong role)", () => {
  it("bounces a cookie-less visitor from every portal to /login with the path preserved", () => {
    for (const portal of ["/admin/dashboard", "/teacher/dashboard", "/student/dashboard", "/parent/dashboard"]) {
      const res = proxy(fakeRequest(portal));
      assert.equal(res.status, 307, portal);
      assert.equal(redirectTarget(res), `/login?next=${encodeURIComponent(portal)}`, portal);
    }
  });

  it("preserves sub-paths and query strings in next", () => {
    const res = proxy(fakeRequest("/admin/quick-add?tab=roster"));
    assert.equal(res.status, 307);
    assert.equal(redirectTarget(res), "/login?next=%2Fadmin%2Fquick-add%3Ftab%3Droster");
  });

  it("bounces exact portal paths and trailing-slash variants too", () => {
    for (const portal of ["/admin", "/admin/", "/teacher/dashboard/"]) {
      const res = proxy(fakeRequest(portal));
      assert.equal(res.status, 307, portal);
      assert.equal(redirectTarget(res), `/login?next=${encodeURIComponent(portal)}`, portal);
    }
  });

  it("bounces a garbage or tampered token like no session", () => {
    const res = proxy(fakeRequest("/admin/dashboard", { token: "not-a-real-token" }));
    assert.equal(res.status, 307);
    assert.equal(redirectTarget(res), "/login?next=%2Fadmin%2Fdashboard");
  });

  it("bounces a valid session pointed at the WRONG portal (role change still bounces)", () => {
    const res = proxy(fakeRequest("/admin/dashboard", { role: ROLES.TEACHER }));
    assert.equal(res.status, 307);
    assert.equal(redirectTarget(res), "/login?next=%2Fadmin%2Fdashboard");

    const res2 = proxy(fakeRequest("/teacher/dashboard", { role: ROLES.SUPER_ADMIN }));
    assert.equal(res2.status, 307);
    assert.equal(redirectTarget(res2), "/login?next=%2Fteacher%2Fdashboard");
  });

  it("renders (200) when the session role matches the portal", () => {
    assert.equal(proxy(fakeRequest("/admin/dashboard", { role: ROLES.SUPER_ADMIN })).status, 200);
    assert.equal(proxy(fakeRequest("/teacher/dashboard", { role: ROLES.TEACHER })).status, 200);
    assert.equal(proxy(fakeRequest("/student/dashboard", { role: ROLES.STUDENT })).status, 200);
    assert.equal(proxy(fakeRequest("/parent/dashboard", { role: ROLES.PARENT })).status, 200);
  });
});

describe("proxy — authenticated /login and /register redirect", () => {
  it("sends each role from /login and /register to its own role home", () => {
    for (const role of ALL_ROLES) {
      for (const page of ["/login", "/register"]) {
        const res = proxy(fakeRequest(page, { role }));
        assert.equal(res.status, 307, `${role} @ ${page}`);
        assert.equal(redirectTarget(res), ROLE_HOME[role], `${role} @ ${page}`);
      }
    }
  });

  it("leaves /login alone for anonymous visitors (it must render)", () => {
    assert.equal(proxy(fakeRequest("/login")).status, 200);
    assert.equal(proxy(fakeRequest("/register")).status, 200);
  });

  it("honors a ?next= deep link the role may render", () => {
    const res = proxy(fakeRequest("/login?next=%2Fteacher%2Fdashboard", { role: ROLES.TEACHER }));
    assert.equal(redirectTarget(res), "/teacher/dashboard");
  });

  it("falls back to role home for a ?next= portal the role may NOT render", () => {
    const res = proxy(fakeRequest("/login?next=%2Fadmin%2Fdashboard", { role: ROLES.TEACHER }));
    assert.equal(redirectTarget(res), ROLE_HOME[ROLES.TEACHER]);
  });

  it("blocks open-redirect and auth-page next values", () => {
    for (const evil of ["https%3A%2F%2Fevil.com", "%2F%2Fevil.com", "%2Flogin", "%2Fregister"]) {
      const res = proxy(fakeRequest(`/login?next=${evil}`, { role: ROLES.SUPER_ADMIN }));
      assert.equal(redirectTarget(res), ROLE_HOME[ROLES.SUPER_ADMIN], evil);
    }
  });

  it("allows public (non-portal) deep links like /features and /onboarding", () => {
    const res = proxy(fakeRequest("/login?next=%2Ffeatures", { role: ROLES.STUDENT }));
    assert.equal(redirectTarget(res), "/features");

    // Onboarding is a public path to the resolver, so it survives as a deep
    // link for the founding admin; the /onboarding page re-checks completion.
    const admin = proxy(fakeRequest("/login?next=%2Fonboarding", { role: ROLES.SUPER_ADMIN }));
    assert.equal(redirectTarget(admin), "/onboarding");
  });
});

describe("proxy — onboarding and MFA branches", () => {
  it("bounces anonymous visitors from /onboarding with next", () => {
    const res = proxy(fakeRequest("/onboarding"));
    assert.equal(res.status, 307);
    assert.equal(redirectTarget(res), "/login?next=%2Fonboarding");
  });

  it("lets SUPER_ADMIN render /onboarding but routes other staff home", () => {
    assert.equal(proxy(fakeRequest("/onboarding", { role: ROLES.SUPER_ADMIN })).status, 200);
    for (const role of [ROLES.BURSAR, ROLES.REGISTRAR, ROLES.TEACHER]) {
      const res = proxy(fakeRequest("/onboarding", { role }));
      assert.equal(res.status, 307, role);
      assert.equal(redirectTarget(res), ROLE_HOME[role], role);
    }
  });

  it("renders /mfa/* for ticket holders and routes authenticated sessions home", () => {
    // No session → the page renders; the API demands the pending MFA ticket.
    assert.equal(proxy(fakeRequest("/mfa/setup")).status, 200);
    assert.equal(proxy(fakeRequest("/mfa")).status, 200);
    // A fully-authenticated session has already passed MFA — send it home.
    for (const path of ["/mfa", "/mfa/setup"]) {
      const res = proxy(fakeRequest(path, { role: ROLES.SUPER_ADMIN }));
      assert.equal(res.status, 307, path);
      assert.equal(redirectTarget(res), ROLE_HOME[ROLES.SUPER_ADMIN], path);
    }
  });
});

describe("proxy — loop prevention (redirects always converge)", () => {
  it("role homes render for their own role (no login ping-pong)", () => {
    for (const role of ALL_ROLES) {
      const res = proxy(fakeRequest(ROLE_HOME[role], { role }));
      assert.equal(res.status, 200, `${role} home ${ROLE_HOME[role]}`);
    }
  });

  it("every /login?next= for every role converges to a 200 (never loops)", () => {
    // Hostile next values: each role's home, other roles' homes, auth pages,
    // open-redirect vectors, and public paths.
    const candidates = [
      ...new Set([
        ...Object.values(ROLE_HOME),
        "/login",
        "/register",
        "/features",
        "/onboarding",
        "https://evil.com",
        "//evil.com",
      ]),
    ];
    for (const role of ALL_ROLES) {
      for (const next of candidates) {
        const outcome = follow(role, `/login?next=${encodeURIComponent(next)}`);
        assert.equal(
          outcome.converged,
          true,
          `${role} /login?next=${next} → loop! visited: ${outcome.visited.join(" → ")}`
        );
        // The landing page must actually be one this role may render — the
        // whole point of the role-compat check (would otherwise ping-pong
        // between portal and /login forever).
        assert.equal(
          mayRenderPortal(role, outcome.final),
          true,
          `${role} landed on ${outcome.final}, which it may not render`
        );
      }
    }
  });

  it("wrong-role portal access converges through login back to that role's home", () => {
    // TEACHER trying /admin → bounced to login → ?next re-checked → their home.
    const outcome = follow(ROLES.TEACHER, "/admin/dashboard");
    assert.equal(outcome.converged, true);
    assert.equal(outcome.final, ROLE_HOME[ROLES.TEACHER]);

    const outcome2 = follow(ROLES.STUDENT, "/teacher/dashboard");
    assert.equal(outcome2.converged, true);
    assert.equal(outcome2.final, ROLE_HOME[ROLES.STUDENT]);
  });
});

describe("proxy — unprotected paths pass through", () => {
  it("renders marketing/API/static paths regardless of session", () => {
    for (const path of ["/", "/features", "/pricing", "/api/auth/me", "/contact"]) {
      assert.equal(proxy(fakeRequest(path)).status, 200, path);
      assert.equal(proxy(fakeRequest(path, { role: ROLES.SUPER_ADMIN })).status, 200, path);
    }
  });

  it("does not match look-alike prefixes of portals", () => {
    assert.equal(proxy(fakeRequest("/administer")).status, 200);
    assert.equal(proxy(fakeRequest("/teacher-notes")).status, 200);
  });
});
