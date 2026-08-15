import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { checkRateLimit } from "@/lib/rate-limit";
import { newsletterSchema, firstValidationMessage } from "@/lib/validation";

/**
 * POST /api/newsletter — public. Stores a newsletter subscription from the
 * blog. Honeypot + idempotent dedupe behave the same as /api/leads: bots are
 * silently dropped, and an existing subscription still reports success.
 */
export async function POST(request) {
  // Public signup guard: 10 subscriptions per IP per 15 minutes.
  const limited = await checkRateLimit({
    request,
    windowMs: 15 * 60 * 1000,
    max: 10,
    prefix: "newsletter",
  });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { email = "", website = "" } = body; // website = honeypot

  if (website) {
    return Response.json({ success: true, stored: false });
  }

  const cleanEmail = String(email || "").trim().toLowerCase();
  const invalid = firstValidationMessage(newsletterSchema, { email: cleanEmail });
  if (invalid) return jsonError(invalid);

  let lead;
  try {
    lead = await store.createLead({
      kind: "newsletter",
      email: cleanEmail,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
      userAgent: request.headers.get("user-agent") || "",
    });
  } catch {
    return jsonError("Could not save your subscription. Please try again later.", 500);
  }

  return Response.json(
    { success: true, stored: !!lead, id: lead?.id || null },
    lead ? { status: 201 } : { status: 200 }
  );
}
