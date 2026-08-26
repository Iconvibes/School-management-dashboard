import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission, requireClassScope } from "@/lib/policy";

/**
 * PATCH /api/resources/[id]/submissions/[submissionId]
 * Teacher grades a submission
 */
export async function PATCH(req, { params }) {
  const session = await requirePermission(["TEACHER", "SUPER_ADMIN"]);
  if (isDenied(session)) return session;

  const { id, submissionId } = await params;
  const resource = await store.getClassResource(id);
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (resource.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { score, grade, feedback } = body;

  const submission = await store.gradeSubmission(submissionId, {
    score,
    grade,
    feedback,
    gradedBy: session.userId,
  });

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  return NextResponse.json({ submission });
}

/**
 * GET /api/resources/[id]/submissions/[submissionId]
 * View a specific submission (teacher or the student who owns it)
 */
export async function GET(req, { params }) {
  const session = await requirePermission(["TEACHER", "STUDENT", "SUPER_ADMIN"]);
  if (isDenied(session)) return session;

  const { id, submissionId } = await params;
  const resource = await store.getClassResource(id);
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (resource.schoolId !== session.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const submissions = await store.getSubmissionsForResource(id);
  const submission = submissions.find((s) => s.id === submissionId);

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Students can only see their own submissions
  if (session.role === "STUDENT" && submission.studentId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ submission });
}
