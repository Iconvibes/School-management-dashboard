import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * POST /api/platform/webhooks/test
 * Send a test notification to a specific webhook.
 * Body: { webhookId }
 */
export async function POST(request) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.manage");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.webhookId) {
    return Response.json({ error: "webhookId is required" }, { status: 400 });
  }

  const webhook = await store.getWebhook(body.webhookId);
  if (!webhook) {
    return Response.json({ error: "Webhook not found" }, { status: 404 });
  }

  // Send a test event through the dispatcher
  const results = await store.dispatchWebhook({
    type: "test_notification",
    severity: "info",
    title: "🔔 Test Notification",
    message: `This is a test webhook from EduTrack Platform. Sent at ${new Date().toLocaleString()}.`,
    schoolId: null,
    schoolName: "EduTrack Platform",
    meta: { test: true, webhookName: webhook.name },
    createdAt: new Date().toISOString(),
  });

  const result = results[0];
  return Response.json({
    success: result?.success || false,
    statusCode: result?.statusCode,
    error: result?.error,
  });
}
