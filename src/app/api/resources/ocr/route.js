import { NextResponse } from "next/server";
import { isDenied, requirePermission } from "@/lib/policy";
import { extractText, isOcrConfigured } from "@/lib/ocr";

export async function POST(req) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER"]);
  if (isDenied(session)) return session;

  if (!isOcrConfigured()) {
    return NextResponse.json({
      error: "OCR not configured. Set GOOGLE_CLOUD_VISION_API_KEY in your environment.",
      text: "",
      confidence: 0,
      success: false,
    }, { status: 503 });
  }

  const body = await req.json();
  const { image, mimeType } = body;

  if (!image) {
    return NextResponse.json({ error: "image (base64) is required" }, { status: 400 });
  }

  if (image.length > 10 * 1024 * 1024 * 1.37) {
    return NextResponse.json({ error: "Image too large (max 10MB)" }, { status: 400 });
  }

  const result = await extractText(image, mimeType || "image/jpeg");
  return NextResponse.json(result);
}
