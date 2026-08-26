/**
 * Capture screenshots of all EduTrack dashboards for the brochure.
 * Run: node scripts/capture-screenshots.js
 * Requires: dev server running on port 3000, Playwright installed.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "public", "brochure-screenshots");

const TARGETS = [
  {
    name: "admin",
    url: `${BASE}/admin/dashboard`,
    email: "admin@edutrack.app",
    password: "admin123",
    schoolId: "sch_101",
    role: "SUPER_ADMIN",
  },
  {
    name: "teacher",
    url: `${BASE}/teacher/dashboard`,
    email: "a.okafor@edutrack.app",
    password: "teacher123",
    schoolId: "sch_101",
    role: "TEACHER",
  },
  {
    name: "student",
    url: `${BASE}/student/dashboard`,
    email: "k.adebayo@edutrack.app",
    password: "student123",
    schoolId: "sch_101",
    role: "STUDENT",
  },
  {
    name: "parent",
    url: `${BASE}/parent/dashboard`,
    email: "f.adebayo@edutrack.app",
    password: "parent123",
    schoolId: "sch_101",
    role: "PARENT",
  },
];

async function loginAndCapture(page, target) {
  console.log(`Capturing ${target.name}...`);

  // Navigate to login page
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);

  // Check if there's a school picker — if so, select the school
  const schoolCard = page.locator(`text=Greenfield`).first();
  if (await schoolCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await schoolCard.click();
    await page.waitForTimeout(500);
  }

  // Click the role tab
  const roleTab = page.locator(`button:has-text("${target.role === "SUPER_ADMIN" ? "Super Admin" : target.role.charAt(0) + target.role.slice(1).toLowerCase()}")`).first();
  if (await roleTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await roleTab.click();
    await page.waitForTimeout(500);
  }

  // Click the demo account button
  const demoBtn = page.locator(`button:has-text("${target.email}")`).first();
  if (await demoBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoBtn.click();
    await page.waitForTimeout(500);
  }

  // Click Sign In
  const signInBtn = page.locator('button:has-text("Sign in")').first();
  if (await signInBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signInBtn.click();
    await page.waitForTimeout(3000);
  }

  // Navigate to the target dashboard
  await page.goto(target.url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Take screenshot
  const filePath = path.join(OUT_DIR, `${target.name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  Saved: ${filePath} (${(fs.statSync(filePath).size / 1024).toFixed(0)} KB)`);
}

async function captureAll() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  for (const target of TARGETS) {
    const page = await context.newPage();
    try {
      await loginAndCapture(page, target);
    } catch (err) {
      console.error(`  Error capturing ${target.name}:`, err.message);
    }
    await page.close();
  }

  await browser.close();
  console.log(`\nAll screenshots saved to ${OUT_DIR}`);
}

captureAll().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
