import { NextResponse } from "next/server.js";
import { clearAuthCookie, getSession } from "@/lib/auth";
import { store } from "@/lib/store";

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie — and when the session is an impersonation
 * session, closes the impersonation record so the platform's audit trail
 * reflects reality ("active" sessions that no longer exist are worse than
 * none: they corrupt the active-session count, avg-duration stats, and the
 * who-is-impersonating-right-now view).
 *
 * The audit log entry records the END of the impersonation explicitly, so
 * "End Session" leaves a trail, not just a silent cookie wipe.
 */
export async function POST() {
  // Read the session BEFORE clearing the cookie — after clearAuthCookie the
  // token is gone and the reason we're logging is unrecoverable.
  const session = await getSession().catch(() => null);
  if (session?.impersonationSessionId) {
    try {
      await store.endImpersonationSession?.(
        session.impersonationSessionId,
        "manual"
      );
      const actor = await store.findUserById?.(session.userId);
      await store.createAuditLog?.({
        action: "impersonation_end",
        actor: actor?.name || "Platform Admin",
        schoolId: session.schoolId,
        schoolName: "",
        description: `Impersonation session ended (manual)`,
        meta: {
          sessionId: session.impersonationSessionId,
          impersonatorId: session.impersonatorId,
          targetUserId: session.userId,
          durationMs: session.impersonatedAt
            ? Date.now() - session.impersonatedAt
            : null,
        },
      });
    } catch {
      // Audit failure must never block logout.
    }
  }

  const res = NextResponse.json({ success: true });
  return clearAuthCookie(res);
}
