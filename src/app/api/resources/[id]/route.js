import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

export async function GET(req, { params }) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER", "BURSAR", "REGISTRAR", "STUDENT", "PARENT"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const resource = await store.getClassResource(id);
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (resource.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ resource });
}

export async function PATCH(req, { params }) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const existing = await store.getClassResource(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const resource = await store.updateClassResource(id, body);

  return NextResponse.json({ resource });
}

export async function DELETE(req, { params }) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const existing = await store.getClassResource(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await store.deleteClassResource(id);
  return NextResponse.json({ ok: true });
}
