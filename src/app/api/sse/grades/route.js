import { isDenied, requirePermission } from "@/lib/policy";
import { registerClient } from "@/lib/sse-manager";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER", "PARENT", "STUDENT"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId");

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const fakeRes = {
        write(data) {
          try {
            controller.enqueue(encoder.encode(data));
          } catch {}
        },
      };

      const client = registerClient(session.schoolId, session.userId, fakeRes);
      fakeRes.write(`event: connected\ndata: ${JSON.stringify({ userId: session.userId, studentId })}\n\n`);

      req.signal?.addEventListener("abort", () => {
        client.close();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
