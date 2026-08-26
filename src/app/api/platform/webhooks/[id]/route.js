import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/webhooks/[id]
 * Get a single webhook config.
 */
export async function GET(_req, { params }) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  const { id } = await params;
  const webhook = await store.getWebhook(id);
  if (!webhook) {
    return Response.json({ error: "Webhook not found" }, { status: 404 });
  }
  return Response.json({ webhook });
}

/**
 * PATCH /api/platform/webhooks/[id]
 * Update a webhook config.
 */
export async function PATCH(request, { params }) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.manage");
  if (isDenied(session)) return session;

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const webhook = await store.updateWebhook(id, body);
  if (!webhook) {
    return Response.json({ error: "Webhook not found" }, { status: 404 });
  }
  return Response.json({ webhook });
}

/**
 * DELETE /api/platform/webhooks/[id]
 * Delete a webhook config.
 */
export async function DELETE(_req, { params }) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.manage");
  if (isDenied(session)) return session;

  const { id } = await params;
  const deleted = await store.deleteWebhook(id);
  if (!deleted) {
    return Response.json({ error: "Webhook not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
