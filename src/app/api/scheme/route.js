import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

export async function GET(req) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER", "BURSAR", "REGISTRAR", "STUDENT"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const subject = searchParams.get("subject") || undefined;
  const classArm = searchParams.get("classArm") || undefined;
  const sessionTerm = searchParams.get("session") || session.school?.currentSession || undefined;
  const term = searchParams.get("term") || session.school?.currentTerm || undefined;

  const schemes = await store.getSchemesOfWork(session.schoolId, { subject, classArm, session: sessionTerm, term });
  return NextResponse.json({ schemes });
}

export async function POST(req) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER"]);
  if (isDenied(session)) return session;

  const body = await req.json();
  const { subject, classArm, topics } = body;

  if (!subject || !classArm) {
    return NextResponse.json({ error: "subject and classArm are required" }, { status: 400 });
  }

  const sess = body.session || session.school?.currentSession;
  const term = body.term || session.school?.currentTerm;

  const scheme = await store.createSchemeOfWork({
    schoolId: session.schoolId,
    subject,
    classArm,
    session: sess,
    term,
    topics: topics || [],
    createdBy: session.userId,
  });

  return NextResponse.json({ scheme });
}
