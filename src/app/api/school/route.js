import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requireAuth, requirePermission } from "@/lib/policy";
import { DAYS } from "@/lib/timetable";

export async function GET() {
  // Any authenticated user may read their school's name/branding — this is
  // not a role gate, so it stays an open requireAuth (no matrix action).
  const session = await requireAuth();
  if (isDenied(session)) return session;
  const school = await store.getSchoolById(session.schoolId);
  if (!school) return jsonError("School not found", 404);
  return Response.json({ school });
}

export async function PATCH(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "school.edit");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  // The bell schedule drives the class-alert alarms — only a well-formed
  // override is accepted (period 1-8 with real "HH:MM" start/end times).
  let periodTimes;
  if (body.periodTimes !== undefined) {
    if (!Array.isArray(body.periodTimes)) {
      return jsonError("periodTimes must be an array", 400);
    }
    periodTimes = body.periodTimes.map((p) => ({
      period: Number(p?.period),
      start: String(p?.start || ""),
      end: String(p?.end || ""),
    }));
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    const wellFormed = periodTimes.every(
      (p) =>
        Number.isInteger(p.period) &&
        p.period >= 1 &&
        p.period <= 8 &&
        hhmm.test(p.start) &&
        hhmm.test(p.end)
    );
    if (!wellFormed) {
      return jsonError("periodTimes entries need a period 1-8 and start/end times as HH:MM", 400);
    }
  }

  // The mid-day break (between periods 4 and 5) — same HH:MM rules. It is a
  // display/alert concept, never a timetable entry.
  let breakTimes;
  if (body.breakTimes !== undefined) {
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    const b = body.breakTimes || {};
    breakTimes = { start: String(b.start || ""), end: String(b.end || "") };
    if (!hhmm.test(breakTimes.start) || !hhmm.test(breakTimes.end)) {
      return jsonError("breakTimes needs start and end times as HH:MM", 400);
    }
  }

  // Per-weekday bell-schedule overrides: { [day]: { periodTimes?, breakTimes? } }.
  // A null value clears that day's override (it falls back to the school-wide
  // schedule); a day not mentioned keeps whatever it had. Periods must be
  // contiguous 1..N — that's what makes a short day like "Friday ends at
  // period 6" well-formed.
  let dailySchedules;
  if (body.dailySchedules !== undefined) {
    if (!body.dailySchedules || Array.isArray(body.dailySchedules) || typeof body.dailySchedules !== "object") {
      return jsonError("dailySchedules must be an object keyed by weekday", 400);
    }
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    dailySchedules = {};
    for (const [day, override] of Object.entries(body.dailySchedules)) {
      if (!DAYS.includes(day)) {
        return jsonError(`dailySchedules key "${day}" is not a school day`, 400);
      }
      if (override === null) continue; // clear this day's override
      if (!override || typeof override !== "object" || Array.isArray(override)) {
        return jsonError(`dailySchedules.${day} must be an object or null`, 400);
      }
      const cleaned = {};
      if (override.periodTimes !== undefined) {
        if (!Array.isArray(override.periodTimes)) {
          return jsonError(`dailySchedules.${day}.periodTimes must be an array`, 400);
        }
        const pts = override.periodTimes.map((p) => ({
          period: Number(p?.period),
          start: String(p?.start || ""),
          end: String(p?.end || ""),
        }));
        const wellFormed = pts.every(
          (p) =>
            Number.isInteger(p.period) &&
            p.period >= 1 &&
            p.period <= 8 &&
            hhmm.test(p.start) &&
            hhmm.test(p.end)
        );
        const contiguous =
          pts.map((p) => p.period).join(",") ===
          Array.from({ length: pts.length }, (_, i) => i + 1).join(",");
        if (!wellFormed || !contiguous || pts.length === 0) {
          return jsonError(
            `dailySchedules.${day}.periodTimes must be contiguous periods 1-N with start/end times as HH:MM`,
            400
          );
        }
        cleaned.periodTimes = pts;
      }
      if (override.breakTimes !== undefined) {
        const b = override.breakTimes || {};
        const bt = { start: String(b.start || ""), end: String(b.end || "") };
        if (!hhmm.test(bt.start) || !hhmm.test(bt.end)) {
          return jsonError(`dailySchedules.${day}.breakTimes needs start and end times as HH:MM`, 400);
        }
        cleaned.breakTimes = bt;
      }
      if (Object.keys(cleaned).length) dailySchedules[day] = cleaned;
    }
  }

  const school = await store.updateSchool(session.schoolId, {
    name: body.name,
    logoUrl: body.logoUrl,
    brandColor: body.brandColor,
    activeArms: body.activeArms,
    currentSession: body.currentSession,
    currentTerm: body.currentTerm,
    // First-run wizard state — the onboarding save flips this to mark the
    // setup complete; /onboarding then skips to the dashboard. Strict ===
    // keeps both stores consistent (Mongoose would cast the string "false",
    // the demo store would not).
    onboardingComplete: body.onboardingComplete === true,
    // undefined when the body omitted it — updateSchool's allowlist skips it.
    periodTimes,
    breakTimes,
    dailySchedules,
  });

  if (!school) return jsonError("School not found", 404);
  return Response.json({ school });
}
