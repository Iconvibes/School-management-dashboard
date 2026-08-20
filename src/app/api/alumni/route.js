import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

export async function GET(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const graduationYear = searchParams.get("year") ? Number(searchParams.get("year")) : undefined;
  const search = searchParams.get("search") || undefined;

  const alumni = await store.listAlumni(session.schoolId, { graduationYear, search });
  const stats = await store.getAlumniStats(session.schoolId);

  return NextResponse.json({ alumni, stats });
}

export async function POST(req) {
  const session = await requirePermission(["SUPER_ADMIN"]);
  if (isDenied(session)) return session;

  const body = await req.json();
  const { name, graduationYear, classArm, university, program, career, contactEmail, contactPhone, linkedIn, notes } = body;

  if (!name || !graduationYear) {
    return NextResponse.json({ error: "name and graduationYear are required" }, { status: 400 });
  }

  const record = await store.createAlumni({
    schoolId: session.schoolId,
    name,
    graduationYear: Number(graduationYear),
    classArm,
    university,
    program,
    career,
    contactEmail,
    contactPhone,
    linkedIn,
    notes,
  });

  return NextResponse.json({ alumni: record }, { status: 201 });
}
