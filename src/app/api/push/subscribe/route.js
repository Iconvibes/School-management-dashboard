import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

export async function POST(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER", "PARENT", "STUDENT"]);
  if (isDenied(session)) return session;

  const body = await req.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "endpoint, keys.p256dh, and keys.auth are required" }, { status: 400 });
  }

  const sub = await store.savePushSubscription({
    schoolId: session.schoolId,
    userId: session.userId,
    endpoint,
    keys,
    userAgent: req.headers.get("user-agent") || "",
  });

  return NextResponse.json({ subscription: sub });
}

export async function DELETE(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER", "PARENT", "STUDENT"]);
  if (isDenied(session)) return session;

  const body = await req.json();
  const { endpoint } = body;

  if (!endpoint) {
    return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
  }

  await store.deletePushSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
