/**
 * CSS Isolation Tests — catch style leakage between platform and school dashboards.
 *
 * The platform admin portal uses a dark theme (platform.css) while school
 * dashboards use a light theme (globals.css). If platform styles leak into
 * school pages (or vice versa), the UI breaks silently — dark text on dark
 * backgrounds, invisible sidebars, wrong scrollbars.
 *
 * These tests parse the CSS files directly and enforce structural rules
 * that prevent leakage. They run with `node --test` and need no browser.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PLATFORM_CSS = path.join(ROOT, "src/app/platform/platform.css");
const GLOBALS_CSS = path.join(ROOT, "src/app/globals.css");
// Pages/layouts render JSX and were renamed .js → .jsx (file-hygiene pass).
const PLATFORM_LAYOUT = path.join(ROOT, "src/app/platform/layout.jsx");

function read(relPath) {
  // JSX files live as .jsx; fall back to .js for pure-logic modules.
  const p = path.join(ROOT, relPath);
  return fs.readFileSync(fs.existsSync(p) ? p : p.replace(/\.js$/, ".jsx"), "utf-8");
}

function readAbsolute(absPath) {
  return fs.readFileSync(absPath, "utf-8");
}

// ── Platform CSS must not override body ────────────────────────────────

describe("platform.css — no body overrides", () => {
  const css = readAbsolute(PLATFORM_CSS);

  it("must NOT contain a body selector (leaks to all routes)", () => {
    // Match "body {" or "body." or "body " at the start of a rule — but NOT
    // inside a comment or a string like "body { ... }" in a comment block.
    const lines = css.split("\n");
    const bodyRules = lines.filter((line) => {
      const trimmed = line.trim();
      // Skip comments
      if (trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("//")) return false;
      // Match body selector at start of a rule (with optional modifiers)
      return /^body[\s.{:]/.test(trimmed);
    });

    assert.equal(
      bodyRules.length,
      0,
      `platform.css contains body selectors that leak to all routes:\n${bodyRules.join("\n")}`
    );
  });

  it("must NOT use !important (indicates desperate overrides that leak)", () => {
    const lines = css.split("\n");
    const importantLines = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(({ line }) => line.includes("!important") && !line.startsWith("/*") && !line.startsWith("*"));

    assert.equal(
      importantLines.length,
      0,
      `platform.css uses !important which likely overrides global styles:\n${importantLines.map((l) => `  L${l.num}: ${l.line}`).join("\n")}`
    );
  });
});

// ── Platform CSS selectors must be scoped ──────────────────────────────

describe("platform.css — scoped selectors", () => {
  const css = readAbsolute(PLATFORM_CSS);

  it("all class selectors must use .platform- prefix (except inside media queries)", () => {
    // Extract all class selectors (lines with ".something" that define rules)
    const lines = css.split("\n");
    const selectors = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip comments and empty lines
      if (!line || line.startsWith("/*") || line.startsWith("*") || line.startsWith("//")) continue;
      // Skip @media, @keyframes
      if (line.startsWith("@")) continue;
      // Match class selectors: .className or .className:hover etc.
      const classMatch = line.match(/^\.([a-zA-Z_-][a-zA-Z0-9_-]*)/);
      if (classMatch) {
        selectors.push({ selector: classMatch[0], line: i + 1, full: line });
      }
    }

    const unscoped = selectors.filter((s) => !s.selector.startsWith(".platform-"));

    assert.equal(
      unscoped.length,
      0,
      `platform.css has unscoped selectors that may leak:\n${unscoped.map((s) => `  L${s.line}: ${s.full}`).join("\n")}`
    );
  });
});

// ── Scrollbar styles must be scoped to .platform-root ──────────────────

describe("platform.css — scrollbar isolation", () => {
  const css = readAbsolute(PLATFORM_CSS);

  it("scrollbar styles must be scoped under .platform-root", () => {
    const lines = css.split("\n");
    const scrollbarLines = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(({ line }) => line.includes("::-webkit-scrollbar") || line.includes("scrollbar-width") || line.includes("scrollbar-color"));

    for (const { line, num } of scrollbarLines) {
      assert.ok(
        line.includes(".platform-root"),
        `L${num}: Scrollbar style "${line}" is not scoped under .platform-root — will leak to school dashboards`
      );
    }
  });
});

// ── Globals.css body must remain light-themed ──────────────────────────

describe("globals.css — light theme body", () => {
  const css = readAbsolute(GLOBALS_CSS);

  it("body background must be light (navy-50 or white)", () => {
    const bodyMatch = css.match(/body\s*\{[^}]*background[^}]*\}/s);
    assert.ok(bodyMatch, "globals.css must define body background");
    // Should contain a light color, not dark
    const bg = bodyMatch[0];
    assert.ok(
      bg.includes("navy-50") || bg.includes("#fff") || bg.includes("white") || bg.includes("background-color: var"),
      `globals.css body background appears dark: ${bg.slice(0, 100)}`
    );
  });

  it("body color must be dark text (navy-800 or similar)", () => {
    const bodyMatch = css.match(/body\s*\{[^}]*color[^}]*\}/s);
    assert.ok(bodyMatch, "globals.css must define body color");
    const color = bodyMatch[0];
    assert.ok(
      color.includes("navy-800") || color.includes("#1e293b") || color.includes("color: var"),
      `globals.css body text color appears light (would be invisible on light bg): ${color.slice(0, 100)}`
    );
  });
});

// ── Platform layout must use .platform-root wrapper ────────────────────

describe("platform/layout.js — uses platform-root wrapper", () => {
  const layout = readAbsolute(PLATFORM_LAYOUT);

  it("outermost div must have .platform-root class", () => {
    assert.ok(
      layout.includes("platform-root"),
      "platform/layout.js does not use .platform-root class — scrollbar and theme styles won't be scoped"
    );
  });

  it("must NOT import globals.css directly (would apply school theme)", () => {
    // The platform layout should NOT import globals.css — it uses its own theme
    // via Tailwind classes on the wrapper div.
    // Next.js may auto-import globals.css from the root layout, but the platform
    // layout should not re-import it.
    const imports = layout.match(/import\s+["'][^"']*globals\.css["']/g);
    assert.equal(
      imports?.length || 0,
      0,
      "platform/layout.js imports globals.css directly — this applies school dashboard theme to platform pages"
    );
  });
});

// ── School dashboards must not use platform CSS classes ────────────────

describe("school dashboards — no platform CSS classes", () => {
  const DASHBOARD_FILES = [
    "src/app/admin/dashboard/page.jsx",
    "src/app/teacher/dashboard/page.jsx",
    "src/app/parent/dashboard/page.jsx",
    "src/app/student/dashboard/page.jsx",
  ];

  for (const file of DASHBOARD_FILES) {
    it(`${file} must not use .platform-* CSS classes`, () => {
      const content = read(file);
      const platformClasses = content.match(/className[^"]*platform-[a-z]+/g);
      assert.equal(
        platformClasses?.length || 0,
        0,
        `${file} uses platform CSS classes: ${platformClasses?.join(", ")}`
      );
    });
  }
});

// ── Sidebar component must not reference platform CSS ──────────────────

describe("Sidebar — no platform CSS references", () => {
  const sidebar = read("src/components/Sidebar.jsx");

  it("must not use .platform-* CSS classes", () => {
    const matches = sidebar.match(/className[^"]*platform-[a-z]+/g);
    assert.equal(
      matches?.length || 0,
      0,
      `Sidebar.jsx uses platform CSS classes: ${matches?.join(", ")}`
    );
  });

  it("must not import platform.css", () => {
    assert.ok(
      !sidebar.includes("platform.css"),
      "Sidebar.jsx imports platform.css — would apply dark theme to school dashboards"
    );
  });
});

// ── Platform pages must not use school-only Tailwind colors ────────────

describe("platform pages — no school-only Tailwind colors in inline styles", () => {
  const PLATFORM_PAGES = [
    "src/app/platform/dashboard/page.jsx",
    "src/app/platform/layout.jsx",
  ];

  for (const file of PLATFORM_PAGES) {
    it(`${file} must not use navy-* Tailwind classes (school theme)`, () => {
      const content = read(file);
      // Look for navy- in className strings (not in comments)
      const lines = content.split("\n");
      const violations = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) continue;
        if (line.includes("className") && /navy-\d/.test(line)) {
          violations.push({ line: i + 1, content: line.slice(0, 120) });
        }
      }

      assert.equal(
        violations.length,
        0,
        `${file} uses navy-* colors (school theme) in platform context:\n${violations.map((v) => `  L${v.line}: ${v.content}`).join("\n")}`
      );
    });
  }
});
