import { NextResponse } from "next/server";
import { clearAuthCookie, clearMfaCookie } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ success: true });
  // Drop the session AND any mid-login MFA pending ticket.
  clearMfaCookie(res);
  return clearAuthCookie(res);
}
