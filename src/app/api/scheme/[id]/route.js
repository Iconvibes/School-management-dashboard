import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

export async function GET(req, { params }) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER", "BURSAR", "REGISTRAR", "STUDENT"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const scheme = await store.getSchemeOfWork(id);
  if (!scheme) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (scheme.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ scheme });
}

export async function PATCH(req, { params }) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const existing = await store.getSchemeOfWork(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const scheme = await store.updateSchemeOfWork(id, {
    ...body,
    updatedBy: session.userId,
  });

  return NextResponse.json({ scheme });
}

export async function DELETE(req, { params }) {
  const session = await requirePermission(["SUPER_ADMIN"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const existing = await store.getSchemeOfWork(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await store.deleteSchemeOfWork?.(id);
  return NextResponse.json({ ok: true });
}
