import { NextResponse } from "next/server";

/**
 * GET /api/push/vapid-key — returns the VAPID public key for push subscription.
 * The client uses this key to subscribe to Web Push notifications.
 */
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ publicKey: null, configured: false });
  }
  return NextResponse.json({ publicKey, configured: true });
}
