import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

export async function GET(req, { params }) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const record = await store.getAlumniRecord(id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ alumni: record });
}

export async function PATCH(req, { params }) {
  const session = await requirePermission(["SUPER_ADMIN"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const existing = await store.getAlumniRecord(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const record = await store.updateAlumni(id, body);

  return NextResponse.json({ alumni: record });
}

export async function DELETE(req, { params }) {
  const session = await requirePermission(["SUPER_ADMIN"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const existing = await store.getAlumniRecord(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await store.deleteAlumni(id);
  return NextResponse.json({ ok: true });
}
