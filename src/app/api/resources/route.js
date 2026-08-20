import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

export async function GET(req) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER", "BURSAR", "REGISTRAR", "STUDENT", "PARENT"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const classArm = searchParams.get("classArm") || undefined;
  const subject = searchParams.get("subject") || undefined;
  const type = searchParams.get("type") || undefined;

  let teacherId;
  if (session.role === "TEACHER") {
    teacherId = searchParams.get("my") === "1" ? session.userId : undefined;
  }

  const resources = await store.listClassResources(session.schoolId, {
    classArm: classArm || session.user?.assignedClass,
    subject,
    teacherId,
    type,
  });

  return NextResponse.json({ resources });
}

export async function POST(req) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER"]);
  if (isDenied(session)) return session;

  const body = await req.json();
  const { classArm, subject, type, title, description, content, attachments, dueDate, maxScore, isReadAhead, readAheadDate, ocrSource } = body;

  if (!classArm || !subject || !type || !title) {
    return NextResponse.json({ error: "classArm, subject, type, and title are required" }, { status: 400 });
  }

  const resource = await store.createClassResource({
    schoolId: session.schoolId,
    teacherId: session.userId,
    classArm,
    subject,
    type,
    title,
    description,
    content,
    attachments,
    dueDate,
    maxScore,
    isReadAhead,
    readAheadDate,
    ocrSource,
  });

  return NextResponse.json({ resource }, { status: 201 });
}
