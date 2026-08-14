#!/usr/bin/env node
/**
 * Generates docs/Project-Defense-Document.{pdf,docx} from the source of truth
 * docs/Project-Defense-Document.md — run `npm run defense-docs` after any
 * code change (see the AUTO-UPDATE rule in the document's Changelog).
 *
 * No external toolchain required:
 *  - PDF  via jspdf (already a project dependency; text-only rendering)
 *  - DOCX via a minimal OOXML package built with a hand-rolled zip writer
 *    (node:zlib deflate + CRC32) — a .docx IS a zip with well-known parts.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MD = path.join(ROOT, "docs", "Project-Defense-Document.md");
const OUT_PDF = path.join(ROOT, "docs", "Project-Defense-Document.pdf");
const OUT_DOCX = path.join(ROOT, "docs", "Project-Defense-Document.docx");

if (!fs.existsSync(MD)) {
  console.error(`Source not found: ${MD}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Markdown → blocks                                                    */
/* ------------------------------------------------------------------ */

/**
 * Blocks: { type: "h1"|"h2"|"h3"|"p"|"li"|"code"|"rule"|"spacer", text }
 * Inline **bold** markers are left in text for the PDF (stripped) and
 * parsed into bold runs for the DOCX.
 */
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
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    if (h1) { blocks.push({ type: "h1", text: h1[1] }); i += 1; continue; }
    if (h2) { blocks.push({ type: "h2", text: h2[1] }); i += 1; continue; }
    if (h3) { blocks.push({ type: "h3", text: h3[1] }); i += 1; continue; }
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) { blocks.push({ type: "li", text: bullet[1] }); i += 1; continue; }
    const num = line.match(/^\s*\d+\.\s+(.*)$/);
    if (num) { blocks.push({ type: "li", text: num[1] }); i += 1; continue; }
    if (/^```/.test(line.trim())) {
      i += 1;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    blocks.push({ type: "p", text: line });
    i += 1;
  }
  return blocks;
}

const stripInline = (t) => t.replace(/\*\*/g, "").replace(/`/g, "");

/* ------------------------------------------------------------------ */
/* PDF (jspdf)                                                          */
/* ------------------------------------------------------------------ */

function renderPdf(blocks) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16;
  const BOTTOM = 297 - 16;
  let y = 14;

  const ensure = (needed) => {
    if (y + needed > BOTTOM) {
      doc.addPage();
      y = 14;
    }
  };

  for (const b of blocks) {
    if (b.type === "rule") {
      ensure(6);
      doc.setDrawColor(203, 213, 225);
      doc.line(M, y, W - M, y);
      y += 4;
      continue;
    }
    if (b.type === "code") {
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(13, 118, 110);
      for (const line of b.text.split("\n")) {
        const wrapped = doc.splitTextToSize(line || " ", W - M * 2 - 8);
        ensure(wrapped.length * 3.4);
        doc.text(wrapped, M + 4, y);
        y += wrapped.length * 3.4;
      }
      y += 2;
      continue;
    }
    if (b.type === "h1") {
      ensure(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(19);
      doc.setTextColor(30, 41, 59);
      const wrapped = doc.splitTextToSize(stripInline(b.text), W - M * 2);
      doc.text(wrapped, M, y);
      y += wrapped.length * 7.5 + 2;
      continue;
    }
    if (b.type === "h2") {
      ensure(10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13.5);
      doc.setTextColor(15, 23, 42);
      const wrapped = doc.splitTextToSize(stripInline(b.text), W - M * 2);
      doc.text(wrapped, M, y);
      y += wrapped.length * 6 + 2;
      continue;
    }
    if (b.type === "h3") {
      ensure(8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      const wrapped = doc.splitTextToSize(stripInline(b.text), W - M * 2);
      doc.text(wrapped, M, y);
      y += wrapped.length * 5 + 1.5;
      continue;
    }
    const fontSize = 9.5;
    const leading = 5.2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(51, 65, 85);
    const indent = b.type === "li" ? 6 : 0;
    const prefix = b.type === "li" ? "•  " : "";
    const wrapped = doc.splitTextToSize(prefix + stripInline(b.text), W - M * 2 - indent);
    ensure(wrapped.length * leading);
    doc.text(wrapped, M + indent, y);
    y += wrapped.length * leading + (b.type === "li" ? 0.5 : 1.2);
  }

  fs.writeFileSync(OUT_PDF, Buffer.from(doc.output("arraybuffer")));
  console.log(`PDF  -> ${OUT_PDF} (${fs.statSync(OUT_PDF).size.toLocaleString()} bytes)`);
}

/* ------------------------------------------------------------------ */
/* DOCX (minimal OOXML + hand-rolled zip writer)                       */
/* ------------------------------------------------------------------ */

const xmlEsc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Split on **bold** markers into [{t, b}] segments. */
function segments(text) {
  const out = [];
  const parts = text.split(/\*\*(.+?)\*\*/g);
  for (let i = 0; i < parts.length; i += 1) {
    if (!parts[i]) continue;
    out.push({ t: parts[i].replace(/`/g, ""), b: i % 2 === 1 });
  }
  return out;
}

function runXml(seg, { bold = false, mono = false, size = 20, color = null } = {}) {
  const rpr = ["<w:rPr>"];
  if (bold || seg.b) rpr.push("<w:b/>");
  if (mono) rpr.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>');
  rpr.push(`<w:sz w:val="${size}"/>`);
  if (color) rpr.push(`<w:color w:val="${color}"/>`);
  rpr.push("</w:rPr>");
  return `<w:r>${rpr.join("")}<w:t xml:space="preserve">${xmlEsc(seg.t)}</w:t></w:r>`;
}

function paraXml(children, { spacing = 80, indent = null } = {}) {
  const ppr = [`<w:pPr><w:spacing w:after="${spacing}" w:line="276" w:lineRule="auto"/>`];
  if (indent) ppr.push(`<w:ind w:left="${indent}"/>`);
  ppr.push("</w:pPr>");
  return `<w:p>${ppr.join("")}${children}</w:p>`;
}

function documentXml(blocks) {
  const body = [];
  for (const b of blocks) {
    if (b.type === "rule") {
      body.push(paraXml([], { spacing: 60 }));
      continue;
    }
    if (b.type === "h1") {
      body.push(paraXml(segments(b.text).map((s) => runXml(s, { bold: true, size: 34 })), { spacing: 160 }));
      continue;
    }
    if (b.type === "h2") {
      body.push(paraXml(segments(b.text).map((s) => runXml(s, { bold: true, size: 26 })), { spacing: 120 }));
      continue;
    }
    if (b.type === "h3") {
      body.push(paraXml(segments(b.text).map((s) => runXml(s, { bold: true, size: 22 })), { spacing: 100 }));
      continue;
    }
    if (b.type === "code") {
      for (const line of b.text.split("\n")) {
        body.push(paraXml([runXml({ t: line || " ", b: false }, { mono: true, size: 16 })], { indent: 360 }));
      }
      continue;
    }
    const text = b.type === "li" ? `•  ${b.text}` : b.text;
    body.push(
      paraXml(
        segments(text).map((s) => runXml(s)),
        { indent: b.type === "li" ? 360 : null }
      )
    );
  }
  body.push(
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>'
  );
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body.join("")}</w:body></w:document>`
  );
}

/* CRC32 + minimal zip (deflate, UTF-8 names) — a .docx is a zip. */
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const data = Buffer.from(f.data, "utf8");
    const crc = crc32(data);
    const comp = zlib.deflateRawSync(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(f.name.length, 26);
    chunks.push(lh, Buffer.from(f.name, "utf8"), comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(f.name.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, Buffer.from(f.name, "utf8"));
    offset += lh.length + f.name.length + comp.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, eocd]);
}

function renderDocx(blocks) {
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";
  const buf = zip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: documentXml(blocks) },
  ]);
  fs.writeFileSync(OUT_DOCX, buf);
  console.log(`DOCX -> ${OUT_DOCX} (${fs.statSync(OUT_DOCX).size.toLocaleString()} bytes)`);
}

/* ------------------------------------------------------------------ */

const blocks = parse(fs.readFileSync(MD, "utf8"));
renderPdf(blocks);
renderDocx(blocks);
console.log("Done — defense document regenerated from docs/Project-Defense-Document.md");
