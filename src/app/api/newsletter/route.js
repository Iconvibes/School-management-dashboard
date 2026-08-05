import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/newsletter — public. Stores a newsletter subscription from the
 * blog. Honeypot + idempotent dedupe behave the same as /api/leads: bots are
 * silently dropped, and an existing subscription still reports success.
 */
export async function POST(request) {
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
  if (!EMAIL_RE.test(cleanEmail)) {
    return jsonError("Please provide a valid email address");
  }

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
