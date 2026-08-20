import { NextResponse } from "next/server";
import { isDenied, requirePermission } from "@/lib/policy";
import { isWhatsAppConfigured, getAccountInfo } from "@/lib/transports/whatsapp";

/**
 * GET /api/whatsapp/status — Check WhatsApp integration status.
 * Returns configuration state and account info (if connected).
 */
export async function GET() {
  const session = await requirePermission(["SUPER_ADMIN"]);
  if (isDenied(session)) return session;

  const configured = isWhatsAppConfigured();
  let accountInfo = null;

  if (configured) {
    accountInfo = await getAccountInfo();
  }

  return NextResponse.json({
    configured,
    accountInfo,
    enabled: configured && accountInfo?.status !== "restricted",
  });
}
