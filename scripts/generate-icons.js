/**
 * Generates Edutrack PWA icons as PNGs using only Node's stdlib
 * (zlib + a minimal PNG encoder). No external image libraries required.
 *
 * Output: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
 *
 * Run: node scripts/generate-icons.js
 */

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

/* ---------------- Minimal PNG encoder ---------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // raw scanlines, each prefixed with filter byte 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------------- Tiny rasterizer ---------------- */

function inPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function inCircle(px, py, cx, cy, r) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function inRoundedRect(px, py, w, h, r) {
  const nx = Math.max(r - px, px - (w - r), 0);
  const ny = Math.max(r - py, py - (h - r), 0);
  return nx * nx + ny * ny <= r * r;
}

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/* ---------------- Icon renderer ---------------- */

function renderIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const top = hex("#3b82f6");
  const bottom = hex("#1d4ed8");
  const white = [255, 255, 255, 255];
  const corner = Math.round(size * 0.18);

  const S = size;
  // Graduation cap coordinates normalized to 512 then scaled
  const k = S / 512;
  const diamond = [
    [256 * k, 168 * k],
    [424 * k, 264 * k],
    [256 * k, 360 * k],
    [88 * k, 264 * k],
  ];
  const baseTrap = [
    [204 * k, 308 * k],
    [308 * k, 308 * k],
    [336 * k, 352 * k],
    [176 * k, 352 * k],
  ];
  const button = { cx: 256 * k, cy: 300 * k, r: 15 * k };
  // tassel: a thin bar from the diamond's right tip down + a knot circle
  const tasselBar = {
    x0: 408 * k,
    y0: 258 * k,
    x1: 420 * k,
    y1: 352 * k,
    w: 10 * k,
  };
  const tasselKnot = { cx: 414 * k, cy: 356 * k, r: 12 * k };

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // Background
      if (!maskable && !inRoundedRect(x, y, S, S, corner)) {
        px[i + 3] = 0; // transparent corners (non-maskable)
        continue;
      }
      const t = y / S;
      px[i] = Math.round(top[0] + (bottom[0] - top[0]) * t);
      px[i + 1] = Math.round(top[1] + (bottom[1] - top[1]) * t);
      px[i + 2] = Math.round(top[2] + (bottom[2] - top[2]) * t);
      px[i + 3] = 255;

      // Cap shapes (white)
      const onCap =
        inPolygon(x, y, diamond) ||
        inPolygon(x, y, baseTrap) ||
        inCircle(x, y, button.cx, button.cy, button.r) ||
        (x >= tasselBar.x0 && x <= tasselBar.x1 && y >= tasselBar.y0 && y <= tasselBar.y1) ||
        inCircle(x, y, tasselKnot.cx, tasselKnot.cy, tasselKnot.r);
      if (onCap) {
        px[i] = white[0];
        px[i + 1] = white[1];
        px[i + 2] = white[2];
        px[i + 3] = white[3];
      }
    }
  }
  return encodePNG(S, S, px);
}

/* ---------------- Main ---------------- */

const outDir = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, opts: {} },
  { file: "icon-512.png", size: 512, opts: {} },
  { file: "icon-maskable-512.png", size: 512, opts: { maskable: true } },
  { file: "apple-touch-icon.png", size: 180, opts: {} },
];

for (const t of targets) {
  const png = renderIcon(t.size, t.opts);
  const file = path.join(outDir, t.file);
  fs.writeFileSync(file, png);
  console.log(`✓ wrote ${t.file} (${t.size}x${t.size}, ${png.length} bytes)`);
}
