import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDenied, requirePermission, ROLES } from "@/lib/policy";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/leads — public. Stores a "demo request" lead from the marketing
 * contact form. Honeypot: bots that fill the hidden "company" field are
 * silently dropped (the response still says success, so the bot moves on).
 * Duplicate emails for the same kind are ignored (idempotent success).
 */
export async function POST(request) {
  // Public form guard: 10 demo requests per IP per 15 minutes.
  const limited = checkRateLimit({
    request,
    windowMs: 15 * 60 * 1000,
    max: 10,
    prefix: "leads",
  });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const {
    name = "",
    school = "",
    email = "",
    phone = "",
    size = "",
    interest = "",
    message = "",
    company = "", // honeypot — humans never see this field
  } = body;

  // Honeypot triggered → pretend success, store nothing.
  if (company) {
    return Response.json({ success: true, stored: false });
  }

  const cleanName = String(name || "").trim();
  const cleanSchool = String(school || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!cleanName || !cleanSchool) {
    return jsonError("Please provide your name and school name");
  }
  // A name that contains no letters is almost certainly garbage/bot data.
  if (!/\p{L}/u.test(cleanName)) {
    return jsonError("Please provide a valid name");
  }
  if (!EMAIL_RE.test(cleanEmail)) {
    return jsonError("Please provide a valid email address");
  }

  let lead;
  try {
    lead = await store.createLead({
      kind: "demo",
      name: cleanName,
      school: cleanSchool,
      email: cleanEmail,
      phone: String(phone || "").trim(),
      size: String(size || "").trim(),
      interest: String(interest || "").trim(),
      message: String(message || "").trim(),
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
      userAgent: request.headers.get("user-agent") || "",
    });
  } catch {
    return jsonError("Could not save your request. Please try again later.", 500);
  }

  return Response.json(
    { success: true, stored: !!lead, id: lead?.id || null },
    lead ? { status: 201 } : { status: 200 }
  );
}

/**
 * GET /api/leads — platform-level leads review.
 *
 * Leads belong to the Edutrack platform, not to any tenant, so the default
 * SUPER_ADMIN gate would let any school admin read every lead. Production
 * deployments should set LEADS_VIEW_KEY and pass it as `x-leads-key`;
 * demo mode (no key configured) falls back to the SUPER_ADMIN gate.
 */
export async function GET(request) {
  const viewKey = process.env.LEADS_VIEW_KEY;
  if (viewKey) {
    if (request.headers.get("x-leads-key") !== viewKey) {
      return jsonError("Forbidden", 403);
    }
  } else {
    // Demo fallback: only a (still-)Super Admin may read leads. requireAuth
    // re-validates against the store, so a demoted admin's old token stops
    // working the moment the role changes — not at the 7-day token expiry.
    const session = await requirePermission([ROLES.SUPER_ADMIN], "leads.view");
    if (isDenied(session)) return session;
  }

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") || undefined;
  let leads;
  try {
    leads = await store.listLeads(kind);
  } catch {
    return jsonError("Could not load leads. Please try again later.", 500);
  }

  return Response.json({ leads });
}
