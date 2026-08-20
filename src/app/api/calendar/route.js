import { NextResponse } from "next/server";
import { store } from "@/lib/store";

/**
 * GET /api/calendar — Generate .ics calendar feed for the school.
 *
 * Parents and students can subscribe to this URL in Google Calendar,
 * Apple Calendar, or Outlook. Events include:
 *   - Exam dates (from school settings)
 *   - Term start/end dates
 *   - PTA meetings (if configured)
 *   - School events
 *
 * Query params:
 *   - session: academic session
 *   - term: term name
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const session = searchParams.get("session") || "2025/2026";
  const term = searchParams.get("term") || "First Term";

  // Get school info for the calendar
  // In demo mode, we use a placeholder; in production, this queries the school
  const schoolName = "EduTrack School";
  const brandColor = "#2563EB";

  const events = generateSchoolEvents(session, term, schoolName);
  const ics = buildICS(events, schoolName, brandColor);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="edutrack-${term.toLowerCase().replace(/\s+/g, "-")}.ics"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/**
 * Generate school events for a term.
 */
function generateSchoolEvents(session, term, schoolName) {
  const [startYear] = session.split("/").map(Number);
  const termStarts = {
    "First Term": `${startYear}-09-08`,
    "Second Term": `${startYear + 1}-01-06`,
    "Third Term": `${startYear + 1}-04-20`,
  };

  const startDate = termStarts[term] || `${startYear}-09-08`;
  const start = new Date(startDate);

  return [
    {
      title: `${term} Begins`,
      date: startDate,
      description: `${term} of ${session} academic session begins at ${schoolName}.`,
      type: "term",
    },
    {
      title: "Mid-Term Break",
      date: addDays(start, 35),
      endDate: addDays(start, 42),
      description: "Mid-term break — no classes.",
      type: "holiday",
    },
    {
      title: "First CA Test",
      date: addDays(start, 21),
      description: "Continuous Assessment test 1 begins.",
      type: "exam",
    },
    {
      title: "Second CA Test",
      date: addDays(start, 63),
      description: "Continuous Assessment test 2 begins.",
      type: "exam",
    },
    {
      title: "Terminal Examinations Begin",
      date: addDays(start, 84),
      endDate: addDays(start, 91),
      description: "End-of-term examinations.",
      type: "exam",
    },
    {
      title: `${term} Ends`,
      date: addDays(start, 98),
      description: `${term} of ${session} ends.`,
      type: "term",
    },
    {
      title: "PTA Meeting",
      date: addDays(start, 49),
      description: "Parent-Teacher Association meeting.",
      type: "event",
    },
  ];
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split("T")[0];
}

/**
 * Build an ICS file from events.
 */
function buildICS(events, schoolName, brandColor) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EduTrack//School Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${schoolName} Academic Calendar`,
    "X-WR-TIMEZONE:Africa/Lagos",
  ];

  for (const event of events) {
    const uid = `${event.title.replace(/\s+/g, "-").toLowerCase()}@edutrack.app`;
    const dtStart = event.date.replace(/-/g, "");
    const dtEnd = (event.endDate || event.date).replace(/-/g, "");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${event.description}`,
      `CATEGORIES:${event.type}`,
      `STATUS:CONFIRMED`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * Generate a subscription URL for the calendar feed.
 */
export function getCalendarUrl(schoolId, session, term) {
  const base = typeof window !== "undefined" ? window.location.origin : "https://edutrack.app";
  const params = new URLSearchParams();
  if (session) params.set("session", session);
  if (term) params.set("term", term);
  return `${base}/api/calendar?${params.toString()}`;
}
