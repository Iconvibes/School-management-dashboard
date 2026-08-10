import { isDemoMode } from "@/lib/db";
import { demoSeedEnabled } from "@/lib/demo-store.js";

/**
 * GET /api/auth/demo-status — { enabled: boolean }
 *
 * Reports whether the seeded demo school exists and may be signed into. The
 * demo school is an explicit opt-in (SEED_DEMO_SCHOOL=1, demo mode only), so
 * client components must NOT hardcode on NODE_ENV — the login page's demo
 * boxes and the marketing "Explore the live demo" button render only when
 * this says enabled. Default (no env, or production) → clean slate, no demo.
 */
export async function GET() {
  return Response.json({
    enabled: isDemoMode() && demoSeedEnabled(),
  });
}
