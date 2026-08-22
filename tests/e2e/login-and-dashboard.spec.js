/**
 * End-to-end tests: login flow + dashboard rendering for all 4 portals.
 *
 * Each test logs in as a demo user, navigates to the dashboard, and verifies
 * the key UI elements render without errors. Uses the real dev server on port
 * 3000 (must be running: npm run dev).
 *
 * SEED_DEMO_SCHOOL=1 must be in .env.local for the demo accounts to exist.
 */

import { test, expect } from "@playwright/test";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Navigate to the login page, pick the demo school, select the role,
 * and wait for the dashboard to load.
 *
 * The login flow has two steps:
 *   1. School search/selection — the demo school appears as a clickable card.
 *   2. Role selection — after picking the school, role buttons appear.
 *
 * Each test starts with a clean browser (no cookies) because storageState
 * is set to empty in playwright.config.js.
 */
async function demoLogin(page, { roleButtonLabel, expectedUrl }) {
  await page.goto("/login");

  // Step 1: Pick the demo school.
  // The school card shows the school name + a "Tap to continue →" hint.
  // Use the first matching button (the search result card).
  const schoolCard = page
    .locator("button")
    .filter({ hasText: /Greenfield International/ })
    .first();
  await schoolCard.click();

  // Step 2: Click the demo account button for the desired role.
  const demoBtn = page.locator("button").filter({ hasText: roleButtonLabel });
  await demoBtn.click();

  // Step 3: Submit the sign-in form.
  const submitBtn = page
    .locator("button")
    .filter({ hasText: /Sign in/ })
    .first();
  await submitBtn.click();

  // Wait for navigation to the expected dashboard URL.
  await page.waitForURL(expectedUrl, { timeout: 15_000 });
}

/* ------------------------------------------------------------------ */
/*  Super Admin Dashboard                                             */
/* ------------------------------------------------------------------ */

test.describe("Super Admin portal", () => {
  test("login → admin dashboard renders with key elements", async ({ page }) => {
    await demoLogin(page, {
      roleButtonLabel: "admin@edutrack.app",
      expectedUrl: "**/admin/dashboard",
    });

    // Sidebar should be present
    const sidebar = page.locator("nav, [role='navigation']").first();
    await expect(sidebar).toBeVisible();

    // Metric cards / stat section should render
    await expect(page.locator("text=Students").first()).toBeVisible({
      timeout: 10_000,
    });

    // Overview content loaded — verify the page isn't blank
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(100);

    // No critical console errors
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    const criticalErrors = errors.filter(
      (e) => e.includes("is not defined") || e.includes("is not a function")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Teacher Dashboard                                                 */
/* ------------------------------------------------------------------ */

test.describe("Teacher portal", () => {
  test("login → teacher dashboard renders grading matrix", async ({ page }) => {
    await demoLogin(page, {
      roleButtonLabel: "Mrs. Adaeze Okafor",
      expectedUrl: "**/teacher/dashboard",
    });

    // Teacher sidebar items
    await expect(page.locator("text=Grading Matrix").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("text=Attendance").first()).toBeVisible();

    // Grading matrix: should show student rows with score inputs
    const spinbuttons = page.locator(
      "input[type='number'], [role='spinbutton']"
    );
    await expect(spinbuttons.first()).toBeVisible({ timeout: 10_000 });

    // Class arm selector — use getByLabel which handles various label shapes
    const classArmLabel = page.getByLabel("Class arm");
    await expect(classArmLabel).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/*  Student Dashboard                                                 */
/* ------------------------------------------------------------------ */

test.describe("Student portal", () => {
  test("login → student dashboard shows report card data", async ({ page }) => {
    await demoLogin(page, {
      roleButtonLabel: "k.adebayo@edutrack.app",
      expectedUrl: "**/student/dashboard",
    });

    // Student name should appear
    await expect(page.locator("text=Kunle Adebayo").first()).toBeVisible({
      timeout: 10_000,
    });

    // Overall average stat card
    await expect(page.locator("text=Overall average").first()).toBeVisible();

    // Class position
    await expect(page.locator("text=Class position").first()).toBeVisible();

    // Subject performance section
    await expect(
      page.locator("text=Performance by subject").first()
    ).toBeVisible();

    // At least one subject grade visible
    await expect(page.locator("text=Mathematics").first()).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/*  Parent Dashboard                                                  */
/* ------------------------------------------------------------------ */

test.describe("Parent portal", () => {
  test("login → parent dashboard shows children and fees", async ({ page }) => {
    await demoLogin(page, {
      roleButtonLabel: "Mrs. Folake Adebayo",
      expectedUrl: "**/parent/dashboard",
    });

    // Family balance section
    await expect(page.locator("text=Family balance").first()).toBeVisible({
      timeout: 10_000,
    });

    // Linked children count
    await expect(page.locator("text=linked child").first()).toBeVisible();

    // Children names visible
    await expect(page.locator("text=Kunle Adebayo").first()).toBeVisible();

    // Report card section for selected child
    await expect(page.locator("text=Report card").first()).toBeVisible();

    // Fee balance section
    await expect(page.locator("text=Fee balance").first()).toBeVisible();

    // Attendance section
    await expect(page.locator("text=Attendance").first()).toBeVisible();

    // Messages section
    await expect(page.locator("text=Messages").first()).toBeVisible();

    // GDPR data rights
    await expect(page.locator("text=Your data rights").first()).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/*  Login page basics                                                 */
/* ------------------------------------------------------------------ */

test.describe("Login page", () => {
  test("renders school search and demo accounts", async ({ page }) => {
    await page.goto("/login");

    // Step 1: School search — the page shows "Which school are you from?"
    await expect(
      page.locator("text=Which school are you from?").first()
    ).toBeVisible({ timeout: 10_000 });

    // The demo school should be in the search results
    await expect(
      page.locator("button", { hasText: "Greenfield International" }).first()
    ).toBeVisible();

    // Step 2: Select the school to reveal demo accounts
    await page
      .locator("button", { hasText: "Greenfield International" })
      .first()
      .click();

    // Demo accounts section visible (CSS uppercases the heading)
    await expect(
      page.locator("text=Demo accounts").first()
    ).toBeVisible();

    // All 6 demo accounts listed
    await expect(
      page.locator("button", { hasText: "admin@edutrack.app" })
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: "bursar@edutrack.app" })
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: "registrar@edutrack.app" })
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: "Mrs. Adaeze Okafor" })
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: "k.adebayo@edutrack.app" })
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: "Mrs. Folake Adebayo" })
    ).toBeVisible();
  });

  test("wrong role for a portal bounces back to login", async ({ page }) => {
    // Try to access admin dashboard without auth
    await page.goto("/admin/dashboard");

    // Should redirect to login
    await page.waitForURL("**/login*", { timeout: 10_000 });
    await expect(page.locator("text=Your school").first()).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/*  Cross-portal: no console errors after login                       */
/* ------------------------------------------------------------------ */

test.describe("No runtime errors across portals", () => {
  const portals = [
    { roleButton: "admin@edutrack.app", url: "**/admin/dashboard" },
    { roleButton: "Mrs. Adaeze Okafor", url: "**/teacher/dashboard" },
    { roleButton: "k.adebayo@edutrack.app", url: "**/student/dashboard" },
    { roleButton: "Mrs. Folake Adebayo", url: "**/parent/dashboard" },
  ];

  for (const { roleButton, url } of portals) {
    test(`${url.split("/")[1]} dashboard: zero "is not defined" errors`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await demoLogin(page, {
        roleButtonLabel: roleButton,
        expectedUrl: url,
      });
      // Let the page fully load and settle
      await page.waitForTimeout(3000);

      const critical = errors.filter(
        (e) => e.includes("is not defined") || e.includes("is not a function")
      );
      expect(critical).toEqual([]);
    });
  }
});
