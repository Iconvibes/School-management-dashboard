import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission, requireClassScope } from "@/lib/policy";

/**
 * GET /api/resources/[id]/submissions
 * - TEACHER: list all submissions for this resource (their class)
 * - STUDENT: get own submission for this resource
 */
export async function GET(req, { params }) {
  const session = await requirePermission(["TEACHER", "STUDENT"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const resource = await store.getClassResource(id);
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (resource.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (session.role === "TEACHER") {
    // Teachers see all submissions for their resource
    const submissions = await store.getSubmissionsForResource(id);
    return NextResponse.json({ submissions });
  }

  // Students see only their own submission
  const submission = await store.getSubmissionForResourceAndStudent(id, session.userId);
  return NextResponse.json({ submission });
}

/**
 * POST /api/resources/[id]/submissions
 * Student submits work for an assignment
 */
export async function POST(req, { params }) {
  const session = await requirePermission(["STUDENT"]);
  if (isDenied(session)) return session;

  const { id } = await params;
  const resource = await store.getClassResource(id);
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (resource.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { content, attachments } = body;

  if (!content && (!attachments || attachments.length === 0)) {
    return NextResponse.json({ error: "Please provide content or attachments" }, { status: 400 });
  }

  const submission = await store.createSubmission({
    schoolId: session.schoolId,
    resourceId: id,
    studentId: session.userId,
    classArm: resource.classArm,
    subject: resource.subject,
    content: content || "",
    attachments: attachments || [],
  });

  return NextResponse.json({ submission }, { status: 201 });
}
