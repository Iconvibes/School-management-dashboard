#!/usr/bin/env node
/**
 * Renders EduTrack-Traffic-Audit.md as a self-contained, print-optimized
 * HTML report — the stakeholder version of the traffic audit. Run:
 *
 *   npm run audit-html
 *
 * Output: EduTrack-Traffic-Audit.html (project root, next to the .md).
 *
 * No external dependencies: a tiny markdown block parser (headings, tables,
 * code fences, lists, blockquotes, rules, paragraphs) plus inline **bold**
 * and `code` rendering, styled for A4 print — each section starts on a new
 * page, code blocks and table rows never split across pages, and the file is
 * 100% self-contained so it prints/PDFs from any browser.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MD = path.join(ROOT, "EduTrack-Traffic-Audit.md");
const OUT = path.join(ROOT, "EduTrack-Traffic-Audit.html");

if (!fs.existsSync(MD)) {
  console.error(`Source not found: ${MD}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Markdown → blocks                                                    */
/* ------------------------------------------------------------------ */

const escapeHtml = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Inline rendering: escaped text + `code` + **bold** (code first, so code
 * contents are never reprocessed as bold). */
function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

function parse(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }
    if (/^\s*---+/.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    if (h1) {
      blocks.push({ type: "h1", text: h1[1] });
      i += 1;
      continue;
    }
    if (h2) {
      blocks.push({ type: "h2", text: h2[1] });
      i += 1;
      continue;
    }
    if (h3) {
      blocks.push({ type: "h3", text: h3[1] });
      i += 1;
      continue;
    }
    // Table: current line starts with | and the NEXT line is a separator row.
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i]
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        if (!/^:?-{2,}:?$/.test(cells[0]) || rows.length === 0) {
          rows.push(cells);
        }
        i += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }
    // Code fence.
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      i += 1;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push({ type: "code", lang, text: code.join("\n") });
      continue;
    }
    // Blockquote: consecutive > lines.
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "blockquote", text: quote.join(" ") });
      continue;
    }
    // Bullet list: consecutive - lines.
    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    // Numbered list: consecutive 1. lines.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    blocks.push({ type: "p", text: line });
    i += 1;
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/* HTML rendering                                                        */
/* ------------------------------------------------------------------ */

function render(blocks) {
  const html = [];
  let inCover = false; // first H1 + following blocks form the cover block

  for (let b = 0; b < blocks.length; b += 1) {
    const block = blocks[b];
    if (block.type === "h1") {
      inCover = true;
      html.push(`<header class="cover"><h1>${inline(block.text)}</h1>`);
      continue;
    }
    if (inCover) {
      if (block.type === "rule") {
        inCover = false;
        html.push("</header>");
        continue;
      }
      if (block.type === "p") html.push(`<p class="cover-meta">${inline(block.text)}</p>`);
      else if (block.type === "blockquote") html.push(`<blockquote class="disclaimer">${inline(block.text)}</blockquote>`);
      else if (block.type === "ul") html.push(renderList(block));
      continue;
    }
    switch (block.type) {
      case "h2":
        html.push(`<section><h2>${inline(block.text)}</h2>`);
        break;
      case "h3":
        html.push(`<h3>${inline(block.text)}</h3>`);
        break;
      case "p":
        html.push(`<p>${inline(block.text)}</p>`);
        break;
      case "ul":
        html.push(renderList(block));
        break;
      case "ol":
        html.push(
          `<ol>${block.items.map((it) => `<li>${inline(it)}</li>`).join("")}</ol>`
        );
        break;
      case "blockquote":
        html.push(`<blockquote>${inline(block.text)}</blockquote>`);
        break;
      case "code": {
        const lang = block.lang ? ` language-${escapeHtml(block.lang)}` : "";
        html.push(`<pre${lang}><code>${escapeHtml(block.text)}</code></pre>`);
        break;
      }
      case "table": {
        const [head, ...body] = block.rows;
        html.push(
          `<table><thead><tr>${head
            .map((c) => `<th>${inline(c)}</th>`)
            .join("")}</tr></thead><tbody>${body
            .map(
              (r) =>
                `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`
            )
            .join("")}</tbody></table>`
        );
        break;
      }
      case "rule":
        html.push("<hr>");
        break;
      default:
        break;
    }
  }
  if (inCover) html.push("</header>");
  html.push("</section>");
  return html.join("\n");
}

function renderList(block) {
  return `<ul>${block.items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`;
}

/* ------------------------------------------------------------------ */
/* Styles                                                                */
/* ------------------------------------------------------------------ */

const STYLE = `
:root {
  --ink: #1e293b;
  --muted: #64748b;
  --accent: #1d4ed8;
  --accent-soft: #eff6ff;
  --warn: #b45309;
  --warn-soft: #fffbeb;
  --code-bg: #f1f5f9;
  --line: #e2e8f0;
  --head-bg: #0f172a;
  --head-ink: #f8fafc;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  color: var(--ink);
  line-height: 1.55;
  font-size: 12.5px;
}
/* ---- Cover ---- */
.cover {
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
  color: #f8fafc;
  padding: 56px 48px 48px;
  border-radius: 10px;
  margin-bottom: 24px;
}
.cover h1 {
  margin: 0 0 8px;
  font-size: 30px;
  line-height: 1.15;
  letter-spacing: -0.02em;
}
.cover-meta { margin: 6px 0; color: #cbd5e1; font-size: 13px; }
.cover-meta strong { color: #f8fafc; }
.disclaimer {
  margin: 20px 0 0;
  padding: 14px 18px;
  border-left: 4px solid #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  color: #fde68a;
  border-radius: 0 8px 8px 0;
  font-style: italic;
}
/* ---- Sections ---- */
section { padding: 8px 0 4px; }
h2 {
  font-size: 20px;
  color: var(--accent);
  border-bottom: 2px solid var(--line);
  padding-bottom: 8px;
  margin: 28px 0 14px;
}
h2::before {
  content: "";
  display: inline-block;
  width: 10px; height: 18px;
  background: var(--accent);
  border-radius: 2px;
  margin-right: 10px;
  vertical-align: -2px;
}
h3 { font-size: 15.5px; margin: 22px 0 8px; color: var(--ink); }
p { margin: 8px 0; }
ul, ol { margin: 8px 0; padding-left: 22px; }
li { margin: 4px 0; }
strong { color: #0f172a; }
code {
  font-family: "Cascadia Code", "Consolas", "SF Mono", Menlo, monospace;
  font-size: 0.92em;
  background: var(--code-bg);
  padding: 1px 5px;
  border-radius: 4px;
  color: #0f766e;
  word-break: break-word;
}
pre {
  font-family: "Cascadia Code", "Consolas", "SF Mono", Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  background: var(--code-bg);
  border: 1px solid var(--line);
  border-left: 4px solid var(--accent);
  border-radius: 6px;
  padding: 12px 14px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 10px 0;
}
pre code { background: none; padding: 0; color: #0f172a; }
/* ---- Tables ---- */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 12px;
}
th, td {
  border: 1px solid var(--line);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
thead th {
  background: var(--head-bg);
  color: var(--head-ink);
  font-weight: 600;
}
tbody tr:nth-child(even) { background: #f8fafc; }
tbody tr { break-inside: avoid; }
/* ---- Blockquotes in the body (verdicts, flags) ---- */
blockquote {
  margin: 12px 0;
  padding: 12px 16px;
  border-left: 4px solid var(--warn);
  background: var(--warn-soft);
  border-radius: 0 6px 6px 0;
  color: #78350f;
}
hr { border: none; border-top: 1px solid var(--line); margin: 24px 0; }
/* ---- Print ---- */
@page { size: A4; margin: 16mm 14mm; }
@media print {
  body { font-size: 11px; }
  section h2 { break-before: page; margin-top: 0; }
  h2, h3 { break-after: avoid; }
  pre, table, blockquote { break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}
`;

/* ------------------------------------------------------------------ */

const blocks = parse(fs.readFileSync(MD, "utf8"));
const body = render(blocks);

const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EduTrack — Traffic Readiness Audit</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;

fs.writeFileSync(OUT, doc);
console.log(`HTML -> ${OUT} (${fs.statSync(OUT).size.toLocaleString()} bytes)`);
