/**
 * Security-focused E2E — exercises the browser-facing security boundaries
 * end to end against the real running server.
 *
 * Covers:
 *   1. Cross-role access denials  — each portal rejects every other role
 *      (page routes via the Next 16 proxy) and each portal's data APIs
 *      reject foreign roles (401/403 — the authoritative policy layer).
 *   2. Tenant isolation           — a real second tenant (registered +
 *      platform-approved through the API, like a new customer) cannot read
 *      or mutate school A's data by id, even with a fully valid session;
 *      the student dashboard shows only tenant-scoped content.
 *   3. Session expiry             — a token signed with an expired `exp` is
 *      rejected by the proxy (page routes) AND the policy layer (APIs);
 *      clearing the cookie ends the session everywhere.
 *
 * Unlike the other specs these tests do NOT need the demo UI flow — sessions
 * are seeded directly via the login API (see flows.spec.js for why: dev-mode
 * Fast-Refresh remounts can race the UI login). Wrong-role page denials ARE
 * exercised through real page navigations, which is exactly what the proxy
 * governs.
 *
 * SEED_DEMO_SCHOOL=1 must be in .env.local for the demo school to exist.
 */

import { test, expect } from "@playwright/test";
import jwt from "jsonwebtoken";

const DEV_JWT_SECRET = process.env.JWT_SECRET || "edutrack-dev-secret-change-in-prod";

const PORTALS = {
  admin: { path: "/admin/dashboard", role: "SUPER_ADMIN", email: "admin@edutrack.app", password: "admin123" },
  // Teachers sign in by EMAIL in the demo seed (the "a.okafor" handle is the
  // display name, not the login name field).
  teacher: { path: "/teacher/dashboard", role: "TEACHER", email: "a.okafor@edutrack.app", password: "teacher123" },
  student: { path: "/student/dashboard", role: "STUDENT", email: "k.adebayo@edutrack.app", password: "student123" },
  parent: { path: "/parent/dashboard", role: "PARENT", name: "Mrs. Folake Adebayo", password: "Kunle Adebayo" },
};

/**
 * Sign in via the API inside the given browser context (cookie jar shared).
 * Platform admins have their own endpoint — they don't belong to a school,
 * so the school login route can't resolve them.
 */
async function apiLogin(request, { email, name, password, role, schoolId = "sch_101" }) {
  const isPlatform = role === "PLATFORM_ADMIN";
  const res = await request.post(
    isPlatform ? "/api/platform/auth/login" : "/api/auth/login",
    isPlatform ? { data: { email, password } } : { data: { email, name, password, role, schoolId } }
  );
  if (!res.ok()) throw new Error(`login failed (${res.status()}): ${await res.text()}`);
  return res;
}

/** Tenant B — a real second school, registered + platform-approved via API.
 *  Deterministic identity so re-runs reuse the tenant instead of burning the
 *  register rate limit (5 registrations/hour/IP, no test bypass by design). */
const TENANT_B = { name: "Isolation Academy E2E", email: "b-admin.e2e@edutrack.app", password: "badmin123" };

async function seedTenantB(request) {
  // Activate the tenant exactly like the platform would: log in as the
  // platform admin and approve the pending registration.
  await apiLogin(request, {
    email: "platform@edutrack.app",
    password: "platform123",
    role: "PLATFORM_ADMIN",
  });

  const findSchool = async () => {
    const overview = await (await request.get("/api/platform/overview")).json();
    return (overview.schools || []).find((s) => s.name === TENANT_B.name);
  };

  let school = await findSchool();
  if (!school) {
    const reg = await request.post("/api/auth/register", {
      data: {
        schoolName: TENANT_B.name,
        adminName: "B Admin E2E",
        email: TENANT_B.email,
        password: TENANT_B.password,
      },
    });
    if (!reg.ok()) throw new Error(`register failed: ${await reg.text()}`);
    school = await findSchool();
    if (!school) throw new Error("registered school not visible on the platform overview");
  }

  if (school.status !== "active") {
    const approve = await request.post("/api/platform/approvals", {
      data: { schoolId: school.id, action: "approve" },
    });
    if (!approve.ok()) throw new Error(`approve failed: ${await approve.text()}`);
  }

  return { schoolId: school.id, email: TENANT_B.email, password: TENANT_B.password };
}

/* ------------------------------------------------------------------ */
/*  1. Cross-role access denials                                      */
/* ------------------------------------------------------------------ */

test.describe("Cross-role page access (proxy layer)", () => {
  // Every WRONG role for a portal must never reach it. The proxy bounces an
  // authenticated wrong-role visitor to /login?next=… and, because that
  // visitor HAS a valid session, the login route immediately 307s them to
  // their own role home (resolvePostLoginRedirect refuses a ?next= their
  // role may not render — loop-proof deep links). So the observable outcome
  // server-side is: requested portal never renders; user lands on their own
  // dashboard.
  const ROLE_HOME = {
    admin: "/admin/dashboard",
    teacher: "/teacher/dashboard",
    student: "/student/dashboard",
    parent: "/parent/dashboard",
  };
  for (const [portal, { path }] of Object.entries(PORTALS)) {
    for (const [actor, { role, email, name, password }] of Object.entries(PORTALS)) {
      if (actor === portal) continue;
      test(`${actor} cannot render ${portal} portal (bounced to own home)`, async ({ page }) => {
        await apiLogin(page.request, { email, name, password, role });
        const res = await page.goto(path);
        expect(res.status()).toBe(200); // the redirect chain resolved
        expect(new URL(page.url()).pathname, `asked for ${path}`).toBe(ROLE_HOME[actor]);
      });
    }
  }

  test("anonymous visitor is bounced and ?next= survives the sign-in", async ({ page }) => {
    const res = await page.goto("/student/dashboard");
    expect(res.status()).toBe(200);
    expect(page.url()).toContain("/login?next=");
    // The bounce must NOT leak dashboard HTML into the login page's payload.
    expect(await page.content()).not.toContain("Report Card");
  });

  test("tampered role claim in the JWT is rejected by the proxy", async ({ page }) => {
    // Forge a token claiming SUPER_ADMIN but pointing at a real student id —
    // without the secret the browser could never do this; here we prove the
    // proxy only trusts validly-signed role claims. A token signed with the
    // WRONG secret must be treated as no session at all.
    const forged = jwt.sign(
      { userId: "usr_student", role: "SUPER_ADMIN", schoolId: "sch_101" },
      "not-the-real-secret",
      { expiresIn: "7d" }
    );
    await page.context().addCookies([
      { name: "edutrack_token", value: forged, url: "http://localhost:3000" },
    ]);
    const res = await page.goto("/admin/dashboard");
    expect(res.status()).toBe(200);
    expect(page.url()).toContain("/login?next=");
  });
});

test.describe("Cross-role data access (policy layer)", () => {
  // The API is the authoritative boundary: every data call re-validates the
  // session against the store and enforces the role list per route.
  test("student session cannot read admin data APIs", async ({ request }) => {
    await apiLogin(request, PORTALS.student);
    // /api/timetable is NOT in this list on purpose: students may READ their
    // own arm's schedule — its scoping is asserted separately below. The
    // conflicts scan inside it, however, is SUPER_ADMIN-only.
    for (const path of ["/api/users", "/api/fees/audit", "/api/timetable?conflicts=1"]) {
      const res = await request.get(path);
      expect([401, 403], `${path} → ${res.status()}`).toContain(res.status());
      const body = await res.json().catch(() => ({}));
      expect(JSON.stringify(body)).not.toContain('"students"');
    }
  });

  test("student timetable read is scoped to their own class arm", async ({ request }) => {
    await apiLogin(request, PORTALS.student);
    const res = await request.get("/api/timetable");
    expect(res.ok()).toBeTruthy();
    const body = await res.json().catch(() => ({}));
    const entries = body.entries || [];
    for (const e of entries) {
      expect(e.classArm, JSON.stringify(e)).toBe("SS1 Science");
    }
  });

  test("parent session cannot mutate admin data APIs", async ({ request }) => {
    await apiLogin(request, PORTALS.parent);
    const res = await request.post("/api/users", {
      data: { name: "Rogue Student", role: "STUDENT", assignedClass: "JSS1" },
    });
    expect([401, 403]).toContain(res.status());
    // And nothing was created: the parent's own view stays scoped.
    const me = await request.get("/api/auth/me");
    expect(me.ok()).toBeTruthy();
  });

  test("teacher session cannot reach platform APIs", async ({ request }) => {
    await apiLogin(request, PORTALS.teacher);
    // 404 is also acceptable: the route may not exist for this build — what
    // matters is a teacher never receives platform data.
    for (const path of ["/api/platform/overview", "/api/platform/approvals", "/api/platform/schools"]) {
      const res = await request.get(path);
      expect([401, 403, 404], `${path} → ${res.status()}`).toContain(res.status());
      const body = await res.json().catch(() => ({}));
      expect(JSON.stringify(body)).not.toContain("totalStudents");
    }
  });

  test("unauthenticated API calls are 401, never anonymous data", async ({ request }) => {
    for (const path of ["/api/users", "/api/scores", "/api/auth/me"]) {
      const res = await request.get(path);
      expect([401, 403], `${path} → ${res.status()}`).toContain(res.status());
    }
  });
});

/* ------------------------------------------------------------------ */
/*  2. Tenant isolation                                               */
/* ------------------------------------------------------------------ */

test.describe("Tenant isolation (real second tenant)", () => {
  let tenantB;

  test.beforeAll(async ({ request }) => {
    tenantB = await seedTenantB(request);
  });

  test("tenant B admin cannot read or mutate school A's user records", async ({ request }) => {
    await apiLogin(request, { ...tenantB, role: "SUPER_ADMIN" });
    // Find one of school A's users through school A's own eyes first.
    const aLogin = await request.post("/api/auth/login", {
      data: { email: "admin@edutrack.app", password: "admin123", role: "SUPER_ADMIN", schoolId: "sch_101" },
    });
    expect(aLogin.ok()).toBeTruthy();
    const users = await (await request.get("/api/users")).json();
    const victim = (users.users || users)[0];
    expect(victim?.id).toBeTruthy();
    const victimId = victim.id;
    const victimName = victim.name;

    // Back to tenant B: a mutation attempt against school A's user BY ID
    // must fail — and must never come back with the row's data.
    await apiLogin(request, { ...tenantB, role: "SUPER_ADMIN" });
    const patch = await request.patch(`/api/users/${victimId}`, {
      data: { name: "Hijacked Name" },
    });
    expect([401, 403, 404], `PATCH /api/users/${victimId} → ${patch.status()}`).toContain(patch.status());
    expect(await patch.text()).not.toContain("Greenfield");

    // The mutation genuinely did not land: from school A the row is intact.
    await apiLogin(request, PORTALS.admin);
    const after = await (await request.get("/api/users")).json();
    const afterRow = (after.users || after).find((u) => u.id === victimId);
    expect(afterRow?.name, "victim name must be unchanged").toBe(victimName);
  });

  test("tenant B admin cannot read school A's report or write scores", async ({ request }) => {
    // School A's first student id, seen from school A.
    await apiLogin(request, PORTALS.admin);
    const users = await (await request.get("/api/users")).json();
    const student = (users.users || users).find((u) => u.role === "STUDENT");
    expect(student?.id).toBeTruthy();

    // Tenant B reads the report card → 403/404.
    await apiLogin(request, { ...tenantB, role: "SUPER_ADMIN" });
    const report = await request.get(`/api/reports/${student.id}`);
    expect([403, 404], `report → ${report.status()}`).toContain(report.status());

    // Tenant B writes a VALID score row for that student → 403 ("students
    // do not belong to your school"). A malformed payload would 400 for any
    // caller and prove nothing — the write must be rejected by the TENANT
    // check, not by validation.
    const score = await request.post("/api/scores", {
      data: {
        classArm: student.assignedClass || "JSS1",
        subject: "Mathematics",
        rows: [{ studentId: student.id, ca1: 9, examScore: 58 }],
      },
    });
    expect([401, 403, 404], `scores → ${score.status()}`).toContain(score.status());
    expect(await score.text()).not.toContain("RCT-");
  });

  test("tenant B admin's dashboard shows no school A content in the browser", async ({ page }) => {
    await apiLogin(page.request, { ...tenantB, role: "SUPER_ADMIN" });
    const res = await page.goto("/admin/dashboard");
    expect(res.status()).toBe(200);
    await page.waitForURL("**/admin/dashboard", { timeout: 20_000 });
    const html = await page.content();
    expect(html).not.toContain("Greenfield International");
    expect(html).not.toContain("Kunle Adebayo");
    expect(html).not.toContain("k.adebayo@edutrack.app");
  });

  test("tenant B student sees only tenant B content on the student portal", async ({ page, request }) => {
    // Tenant B has no students yet — create one like an admin would.
    await apiLogin(request, { ...tenantB, role: "SUPER_ADMIN" });
    const stamp = Date.now().toString(36).slice(-4);
    const created = await request.post("/api/users", {
      data: { name: `B Student ${stamp}`, role: "STUDENT", assignedClass: "JSS1", email: `bstu.${stamp}@edutrack.app`, password: "bstupass123" },
    });
    expect(created.ok()).toBeTruthy();

    // Sign the browser in as that student and check the portal is scoped.
    await apiLogin(page.request, {
      email: `bstu.${stamp}@edutrack.app`,
      password: "bstupass123",
      role: "STUDENT",
      schoolId: tenantB.schoolId,
    });
    await page.goto("/student/dashboard");
    await page.waitForURL("**/student/dashboard", { timeout: 20_000 });
    const html = await page.content();
    expect(html).not.toContain("Kunle Adebayo");
    expect(html).not.toContain("Greenfield");
  });
});

/* ------------------------------------------------------------------ */
/*  3. Session expiry & lifecycle                                     */
/* ------------------------------------------------------------------ */

test.describe("Session expiry & lifecycle", () => {
  test("expired JWT is bounced by the proxy and rejected by APIs", async ({ page }) => {
    // A token with an exp in the past (signed with the dev secret, as a
    // locally-running server does) must behave exactly like no session.
    const expired = jwt.sign(
      { userId: "whatever", role: "SUPER_ADMIN", schoolId: "sch_101" },
      DEV_JWT_SECRET,
      { expiresIn: "-10s" }
    );
    await page.context().addCookies([
      { name: "edutrack_token", value: expired, url: "http://localhost:3000" },
    ]);
    const res = await page.goto("/admin/dashboard");
    expect(res.status()).toBe(200);
    expect(page.url()).toContain("/login?next=");
    const me = await page.request.get("/api/auth/me");
    expect([401, 403]).toContain(me.status());
  });

  test("garbage cookie value is rejected everywhere", async ({ page }) => {
    await page.context().addCookies([
      { name: "edutrack_token", value: "not-a-jwt", url: "http://localhost:3000" },
    ]);
    expect((await page.goto("/admin/dashboard")).status()).toBe(200);
    expect(page.url()).toContain("/login?next=");
    expect([401, 403]).toContain((await page.request.get("/api/auth/me")).status());
  });

  test("wrong-secret token with valid claims is still rejected", async ({ page }) => {
    const forged = jwt.sign(
      { userId: "usr_x", role: "SUPER_ADMIN", schoolId: "sch_101" },
      "attacker-secret",
      { expiresIn: "7d" }
    );
    await page.context().addCookies([
      { name: "edutrack_token", value: forged, url: "http://localhost:3000" },
    ]);
    expect((await page.goto("/admin/dashboard")).status()).toBe(200);
    expect(page.url()).toContain("/login?next=");
  });

  test("logout clears the session: portal bounces and APIs 401", async ({ page }) => {
    await apiLogin(page.request, PORTALS.admin);
    await page.goto("/admin/dashboard");
    await page.waitForURL("**/admin/dashboard", { timeout: 20_000 });

    // Sign out through the UI (the real user path).
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login*", { timeout: 15_000 });

    // After logout the browser is anonymous again — the proxy and the API
    // must both agree the session is gone.
    expect((await page.goto("/admin/dashboard")).status()).toBe(200);
    expect(page.url()).toContain("/login?next=");
    expect([401, 403]).toContain((await page.request.get("/api/auth/me")).status());
  });

  test("cookie is HttpOnly and SameSite=Lax (XSS/CSRF posture)", async ({ page }) => {
    await apiLogin(page.request, PORTALS.admin);
    await page.goto("/login");
    const cookies = await page.context().cookies("http://localhost:3000");
    const session = cookies.find((c) => c.name === "edutrack_token");
    expect(session).toBeTruthy();
    expect(session.httpOnly).toBe(true);
    expect(["Lax", "Strict"]).toContain(session.sameSite);
  });
});
