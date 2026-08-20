import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { broadcastToUser } from "@/lib/sse-manager";

/**
 * GET /api/messages — list conversations or get a specific conversation
 * POST /api/messages — send a message
 */
export async function GET(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER", "PARENT", "STUDENT"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const partnerId = searchParams.get("partnerId");

  if (partnerId) {
    // Get conversation with a specific partner
    const messages = await store.getConversation(session.schoolId, session.userId, partnerId);
    // Mark as read
    await store.markConversationRead(session.schoolId, session.userId, partnerId);
    return NextResponse.json({ messages });
  }

  // List all conversations
  const conversations = await store.listConversations(session.schoolId, session.userId);
  const unread = await store.getUnreadMessageCount(session.schoolId, session.userId);

  return NextResponse.json({ conversations, unread });
}

export async function POST(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER", "PARENT", "STUDENT"]);
  if (isDenied(session)) return session;

  const body = await req.json();
  const { to, studentId, subject, message, replyTo } = body;

  if (!to || !message) {
    return NextResponse.json({ error: "to and message are required" }, { status: 400 });
  }

  const msg = await store.sendMessage({
    schoolId: session.schoolId,
    from: session.userId,
    to,
    studentId: studentId || null,
    subject: subject || "",
    body: message,
    type: "direct",
    replyTo: replyTo || null,
  });

  // Broadcast real-time update to recipient
  broadcastToUser(session.schoolId, to, {
    type: "new_message",
    data: {
      id: msg.id,
      from: session.userId,
      fromName: session.user?.name || "Someone",
      subject: subject || "",
      preview: message.slice(0, 100),
    },
  });

  return NextResponse.json({ message: msg }, { status: 201 });
}
