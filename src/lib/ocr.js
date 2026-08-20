/**
 * OCR service — Google Cloud Vision API for teacher note capture.
 *
 * Teachers photograph handwritten notes → system extracts text → teacher
 * reviews/corrects → publishes as PDF for students.
 *
 * Required env vars:
 *   GOOGLE_CLOUD_VISION_API_KEY — Google Cloud Vision API key
 *
 * Cost: ~₦0.005 per image (~$0.0035 USD).
 * Fallback: if no API key, falls back to a basic "image uploaded" message.
 */

const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

/**
 * Extract text from an image using Google Cloud Vision OCR.
 *
 * @param {string|Buffer} image — base64-encoded image data or Buffer
 * @param {string} [mimeType="image/jpeg"] — MIME type of the image
 * @returns {Promise<{ text: string, confidence: number, success: boolean, error?: string }>}
 */
export async function extractText(image, mimeType = "image/jpeg") {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    return {
      text: "",
      confidence: 0,
      success: false,
      error: "Google Cloud Vision API key not configured",
    };
  }

  // Convert Buffer to base64 if needed
  const base64Data = Buffer.isBuffer(image) ? image.toString("base64") : image;

  try {
    const res = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64Data },
            features: [
              { type: "TEXT_DETECTION", maxResults: 1 },
              { type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 },
            ],
          },
        ],
      }),
    });

    const data = await res.json();

    if (data.error) {
      return {
        text: "",
        confidence: 0,
        success: false,
        error: data.error.message || "Vision API error",
      };
    }

    const annotation = data.responses?.[0]?.fullTextAnnotation;
    const text = annotation?.text || data.responses?.[0]?.textAnnotations?.[0]?.description || "";
    const confidence = annotation?.confidence || 0;

    return {
      text: text.trim(),
      confidence: Math.round(confidence * 100),
      success: Boolean(text.trim()),
    };
  } catch (err) {
    return {
      text: "",
      confidence: 0,
      success: false,
      error: err?.message || "OCR request failed",
    };
  }
}

/**
 * Check if OCR is configured.
 */
export function isOcrConfigured() {
  return Boolean(process.env.GOOGLE_CLOUD_VISION_API_KEY);
}
