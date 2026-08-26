import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/webhooks
 * List all webhook configurations.
 */
export async function GET() {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  const webhooks = await store.listWebhooks();
  return Response.json({ webhooks });
}

/**
 * POST /api/platform/webhooks
 * Create a new webhook configuration.
 * Body: { name, url, format, events, secret, enabled }
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

  if (!body.name || !body.url) {
    return Response.json({ error: "name and url are required" }, { status: 400 });
  }

  const validFormats = ["slack", "discord", "generic"];
  if (body.format && !validFormats.includes(body.format)) {
    return Response.json(
      { error: "format must be slack, discord, or generic" },
      { status: 400 }
    );
  }

  try {
    const webhook = await store.createWebhook({
      name: body.name,
      url: body.url,
      format: body.format || "generic",
      events: body.events || [],
      secret: body.secret || null,
      enabled: body.enabled !== false,
    });

    return Response.json({ webhook }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
