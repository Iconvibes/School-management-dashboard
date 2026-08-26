import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/webhooks/deliveries
 * List recent webhook delivery logs.
 * Query: ?limit=20
 */
export async function GET(request) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));

  const deliveries = await store.listDeliveries(limit);
  return Response.json({ deliveries });
}
