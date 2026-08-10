/**
 * Client-side logo/seal image handling — shared by onboarding and the admin
 * Settings tab.
 *
 * A file under the size cap is stored as-is (SVGs must take this path — the
 * canvas cannot rasterize them reliably). Anything larger is compressed in
 * the browser BEFORE it reaches the server: downscaled to a sane max side,
 * re-encoded as WebP (alpha-preserving; JPEG fallback flattens onto white
 * for engines without WebP canvas output), and progressively shrunk until
 * the stored data URL fits the cap — so a huge PNG shrinks automatically
 * instead of being rejected.
 *
 * Never throws for a valid image: the last (smallest) attempt is always
 * returned, so a pathological file still lands as something renderable.
 */

export const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB file cap (matches the UI copy)
export const MAX_IMAGE_SIDE = 512; // longest side, px, after compression

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error("Could not read that image — please try another file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image — please try another file."));
    };
    img.src = url;
  });
}

/** Draw the image onto a canvas at `side` (longest edge) and re-encode. */
function encode(img, { side, type, quality }) {
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that image in this browser.");
  if (type === "image/jpeg") {
    // JPEG has no alpha channel — flatten onto white instead of black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL(type, quality);
}

/**
 * Resolve an uploaded image file to a data URL, compressing it in the browser
 * when it exceeds the cap. Resolves to the data URL string; rejects only for
 * a non-image file or an unreadable one.
 */
export async function compressImageFile(
  file,
  { maxBytes = MAX_IMAGE_BYTES, maxSide = MAX_IMAGE_SIDE } = {}
) {
  if (!file) throw new Error("No file selected.");
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (PNG, JPG, SVG or WebP).");
  }
  if (file.size <= maxBytes) return readAsDataUrl(file);

  // Over the cap → rasterize and re-encode progressively smaller. The data
  // URL is base64 (~1.37× the binary size), so target the cap in chars to
  // keep the stored field itself small (Mongo docs cap at 16 MB).
  const img = await loadImage(file);
  const attempts = [
    { side: maxSide, type: "image/webp", quality: 0.82 },
    { side: Math.round(maxSide * 0.75), type: "image/webp", quality: 0.75 },
    { side: Math.round(maxSide * 0.5), type: "image/webp", quality: 0.7 },
    { side: Math.round(maxSide * 0.38), type: "image/webp", quality: 0.6 },
    { side: Math.round(maxSide * 0.38), type: "image/jpeg", quality: 0.75 },
    { side: Math.round(maxSide * 0.25), type: "image/jpeg", quality: 0.65 },
  ];
  let last = null;
  for (const attempt of attempts) {
    last = encode(img, attempt);
    if (last.length <= maxBytes) return last;
  }
  return last;
}
