"""One-off codemod: split src/app/platform/schools/[id]/page.jsx.

Extracts the SVG chart components + format helpers into reusable modules,
leaving the page as the data-fetching + layout shell. Idempotent via the
marker check at the top.
"""
import re
from pathlib import Path

PAGE = Path("src/app/platform/schools/[id]/page.jsx")
OUT_DIR = Path("src/app/platform/schools/[id]")
CHARTS = OUT_DIR / "charts.jsx"
HELPERS = OUT_DIR / "format.js"

src = PAGE.read_text(encoding="utf-8")

if "from \"./charts\"" in src or "from \"./format\"" in src:
    raise SystemExit("already split — aborting")

# ── Locate the seams ────────────────────────────────────────────────────
i_helpers = src.index("/* ── Helpers ──")
i_charts = src.index("/* ── SVG Mini Charts ──")
i_section = src.index("function SectionCard(")
i_main = src.index("export default function SchoolDetailPage()")

helpers_block = src[i_helpers:i_charts]
charts_block = src[i_charts:i_section]
section_card_block = src[i_section:i_main]

# ── charts.jsx ──────────────────────────────────────────────────────────
charts_src = (
    '"use client";\n'
    "\n"
    "/**\n"
    " * SVG mini-charts for the platform school-detail page — extracted from\n"
    " * page.jsx (file-hygiene split). Pure presentational components.\n"
    " */\n"
    + charts_block
        .replace("/* ── SVG Mini Charts ────────────────────────────────────────── */\n", "")
        .replace("\r\n", "\n")
    + "\n"
    + section_card_block.replace("\r\n", "\n")
    + "\n"
      "export { SparkAreaChart, BarChart, ForecastChart, SectionCard };\n"
)
CHARTS.write_text(charts_src, encoding="utf-8", newline="\n")

# ── format.js ───────────────────────────────────────────────────────────
format_src = (
    "/**\n"
    " * Formatting helpers for the platform school-detail page — extracted from\n"
    " * page.jsx (file-hygiene split). Pure functions, no React.\n"
    " */\n"
    + helpers_block
        .replace("/* ── Helpers ────────────────────────────────────────────────── */\n", "")
        .replace("\r\n", "\n")
    + "\n"
      "export {\n"
      "  formatCurrency,\n"
      "  formatFullCurrency,\n"
      "  formatTimeAgo,\n"
      "  formatDate,\n"
      "  getDateKey,\n"
      "  ACTIVITY_COLORS,\n"
      "};\n"
)
HELPERS.write_text(format_src, encoding="utf-8", newline="\n")

# ── Rewrite the page ────────────────────────────────────────────────────
new_page = (
    src[:i_helpers]
    + 'import { SparkAreaChart, BarChart, ForecastChart, SectionCard } from "./charts";\n'
      'import {\n'
      '  formatCurrency,\n'
      '  formatFullCurrency,\n'
      '  formatTimeAgo,\n'
      '  formatDate,\n'
      '  getDateKey,\n'
      '  ACTIVITY_COLORS,\n'
      '} from "./format";\n\n'
    + src[i_main:]
)
PAGE.write_text(new_page, encoding="utf-8", newline="\n")
print("page.jsx:", new_page.count("\n"), "lines")
print("charts.jsx:", charts_src.count("\n"), "lines")
print("format.js:", format_src.count("\n"), "lines")
