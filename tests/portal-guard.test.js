/**
 * Portal-guard tests — the pure decision logic behind src/proxy.js.
 *
 * The proxy is the optimistic render layer: it checks the JWT role claim
 * against the portal's allowed roles and redirects to /login on a mismatch.
 * These tests cover every portal × role combination plus unmatched paths.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  matchPortalGuard,
  mayRenderPortal,
  resolvePostLoginRedirect,
  ROLE_HOME,
  sanitizeNext,
} from "../src/lib/portal-guard.js";
import { ROLES, STAFF_ROLES } from "../src/lib/permissions.js";

describe("matchPortalGuard", () => {
  it("matches each portal's exact path and sub-paths", () => {
    assert.equal(matchPortalGuard("/admin").prefix, "/admin");
    assert.equal(matchPortalGuard("/admin/dashboard").prefix, "/admin");
    assert.equal(matchPortalGuard("/admin/quick-add").prefix, "/admin");
    assert.equal(matchPortalGuard("/teacher").prefix, "/teacher");
    assert.equal(matchPortalGuard("/teacher/dashboard").prefix, "/teacher");
    assert.equal(matchPortalGuard("/student/dashboard").prefix, "/student");
    assert.equal(matchPortalGuard("/parent/dashboard").prefix, "/parent");
  });

  it("matches trailing-slash variants of portal paths", () => {
    assert.equal(matchPortalGuard("/admin/").prefix, "/admin");
    assert.equal(matchPortalGuard("/teacher/dashboard/").prefix, "/teacher");
    assert.equal(matchPortalGuard("/student/dashboard/").prefix, "/student");
    assert.equal(matchPortalGuard("/parent/dashboard/").prefix, "/parent");
  });

  it("does not match look-alike prefixes or unprotected routes", () => {
    assert.equal(matchPortalGuard("/administer"), undefined);
    assert.equal(matchPortalGuard("/teacher-notes"), undefined);
    assert.equal(matchPortalGuard("/login"), undefined);
    assert.equal(matchPortalGuard("/features"), undefined);
    assert.equal(matchPortalGuard("/api/users"), undefined);
    assert.equal(matchPortalGuard("/"), undefined);
  });
});

describe("mayRenderPortal", () => {
  it("lets each role render its own portal", () => {
    for (const role of STAFF_ROLES) {
      assert.equal(mayRenderPortal(role, "/admin/dashboard"), true, `${role} → /admin`);
    }
    assert.equal(mayRenderPortal(ROLES.TEACHER, "/teacher/dashboard"), true);
    assert.equal(mayRenderPortal(ROLES.STUDENT, "/student/dashboard"), true);
    assert.equal(mayRenderPortal(ROLES.PARENT, "/parent/dashboard"), true);
  });

  it("denies every other role per portal", () => {
    const denied = [
      ["TEACHER", "/admin/dashboard"],
      ["STUDENT", "/admin/dashboard"],
      ["PARENT", "/admin/dashboard"],
      ["SUPER_ADMIN", "/teacher/dashboard"],
      ["BURSAR", "/teacher/dashboard"],
      ["STUDENT", "/teacher/dashboard"],
      ["PARENT", "/teacher/dashboard"],
      ["TEACHER", "/student/dashboard"],
      ["SUPER_ADMIN", "/student/dashboard"],
      ["SUPER_ADMIN", "/parent/dashboard"],
      ["TEACHER", "/parent/dashboard"],
      ["STUDENT", "/parent/dashboard"],
    ];
    for (const [role, pathname] of denied) {
      assert.equal(mayRenderPortal(role, pathname), false, `${role} → ${pathname}`);
    }
  });

  it("denies missing or unknown roles on any portal", () => {
    assert.equal(mayRenderPortal(null, "/admin/dashboard"), false);
    assert.equal(mayRenderPortal(undefined, "/teacher/dashboard"), false);
    assert.equal(mayRenderPortal("SUPERVILLAIN", "/admin/dashboard"), false);
    assert.equal(mayRenderPortal("", "/student/dashboard"), false);
  });

  it("always allows unprotected paths regardless of role", () => {
    for (const role of [...STAFF_ROLES, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT, null]) {
      assert.equal(mayRenderPortal(role, "/login"), true);
      assert.equal(mayRenderPortal(role, "/features"), true);
      assert.equal(mayRenderPortal(role, "/api/auth/me"), true);
    }
  });
});

describe("ROLE_HOME", () => {
  it("covers every role and each home is a portal that role may render", () => {
    for (const [role, home] of Object.entries(ROLE_HOME)) {
      assert.equal(mayRenderPortal(role, home), true, `${role} home ${home} renderable`);
    }
    // No role's home is another role's portal (cross-role landing would loop).
    assert.equal(mayRenderPortal(ROLES.TEACHER, ROLE_HOME[ROLES.SUPER_ADMIN]), false);
    assert.equal(mayRenderPortal(ROLES.STUDENT, ROLE_HOME[ROLES.TEACHER]), false);
  });
});

describe("sanitizeNext", () => {
  it("accepts safe local paths (query/hash preserved, whitespace trimmed)", () => {
    assert.equal(sanitizeNext("/admin/dashboard"), "/admin/dashboard");
    assert.equal(sanitizeNext("/teacher/dashboard?tab=1#grades"), "/teacher/dashboard?tab=1#grades");
    assert.equal(sanitizeNext("  /parent  "), "/parent");
  });

  it("rejects open-redirect vectors and non-paths", () => {
    assert.equal(sanitizeNext("https://evil.com"), "");
    assert.equal(sanitizeNext("//evil.com"), "");
    assert.equal(sanitizeNext("/\\evil.com"), ""); // URL parsers normalize \\ to /
    assert.equal(sanitizeNext("\\evil.com"), "");
    assert.equal(sanitizeNext("javascript:alert(1)"), "");
    assert.equal(sanitizeNext("evil.com/path"), "");
    assert.equal(sanitizeNext(""), "");
    assert.equal(sanitizeNext("   "), "");
    assert.equal(sanitizeNext(null), "");
    assert.equal(sanitizeNext(undefined), "");
    assert.equal(sanitizeNext(123), "");
  });

  it("rejects the auth pages themselves (they would loop)", () => {
    assert.equal(sanitizeNext("/login"), "");
    assert.equal(sanitizeNext("/login/"), "");
    assert.equal(sanitizeNext("/login?x=1"), "");
    assert.equal(sanitizeNext("/register"), "");
    assert.equal(sanitizeNext("/register?x=1"), "");
  });
});

describe("resolvePostLoginRedirect", () => {
  it("defaults to the role home when no (or unsafe) next is given", () => {
    for (const role of Object.keys(ROLE_HOME)) {
      assert.equal(resolvePostLoginRedirect(role), ROLE_HOME[role], role);
      assert.equal(resolvePostLoginRedirect(role, ""), ROLE_HOME[role], role);
      assert.equal(resolvePostLoginRedirect(role, "https://evil.com"), ROLE_HOME[role], role);
    }
  });

  it("honors a portal deep link the role may render", () => {
    assert.equal(resolvePostLoginRedirect(ROLES.TEACHER, "/teacher/dashboard"), "/teacher/dashboard");
    assert.equal(resolvePostLoginRedirect(ROLES.SUPER_ADMIN, "/admin/quick-add"), "/admin/quick-add");
    assert.equal(resolvePostLoginRedirect(ROLES.PARENT, "/parent/dashboard"), "/parent/dashboard");
  });

  it("falls back to role home for a portal the role may not render (loop-proof)", () => {
    assert.equal(resolvePostLoginRedirect(ROLES.TEACHER, "/admin/dashboard"), ROLE_HOME[ROLES.TEACHER]);
    assert.equal(resolvePostLoginRedirect(ROLES.STUDENT, "/teacher/dashboard"), ROLE_HOME[ROLES.STUDENT]);
    assert.equal(resolvePostLoginRedirect(ROLES.SUPER_ADMIN, "/login"), ROLE_HOME[ROLES.SUPER_ADMIN]);
  });

  it("allows public (non-portal) paths for any role", () => {
    assert.equal(resolvePostLoginRedirect(ROLES.TEACHER, "/features"), "/features");
    assert.equal(resolvePostLoginRedirect(ROLES.STUDENT, "/pricing"), "/pricing");
    // Onboarding is not a portal, so it survives as a deep link — the
    // /onboarding page itself re-checks role + completion against the store.
    assert.equal(resolvePostLoginRedirect(ROLES.SUPER_ADMIN, "/onboarding"), "/onboarding");
    // The auth pages themselves never survive (loop prevention).
    assert.equal(resolvePostLoginRedirect(ROLES.SUPER_ADMIN, "/register"), ROLE_HOME[ROLES.SUPER_ADMIN]);
    assert.equal(resolvePostLoginRedirect(ROLES.TEACHER, "/login"), ROLE_HOME[ROLES.TEACHER]);
  });
});
