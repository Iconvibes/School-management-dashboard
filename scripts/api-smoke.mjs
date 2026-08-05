/**
 * Headless behavioral smoke test for the Edutrack API.
 *
 * Drives a RUNNING dev server (demo mode) and asserts the real surface:
 * health, rate limiting on public endpoints, every role gate, the teacher
 * class-scope policy, class-ranking values, and report-card access rules.
 *
 * Usage:  start `npx next dev -p 3213`, then:
 *         node scripts/api-smoke.mjs            # defaults to :3213
 *         BASE=http://localhost:3000 node scripts/api-smoke.mjs
 *
 * Exits non-zero if any check fails. Cookies are tracked manually (fetch has
 * no cookie jar).
 */
const BASE = process.env.BASE || "http://localhost:3213";

let failures = 0;
const jar = new Map(); // name -> cookie header value

function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function req(path, { method = "GET", cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    // first cookie segment is "<name>=<value>"
    const [name, value] = setCookie.split(";")[0].split("=");
    if (value !== "") jar.set(name, setCookie.split(";")[0]);
  }
  return { status: res.status, json, headers: res.headers, setCookie };
}

const is429 = (r) =>
  r.status === 429 &&
  r.json &&
  typeof r.json.error === "string" &&
  r.json.retryAfter > 0 &&
  r.headers.get("Retry-After") === String(r.json.retryAfter);

// ---------------------------------------------------------------------------
console.log("== health & unauthenticated ==");
{
  const h = await req("/api/health");
  check("GET /api/health -> 200", h.status === 200);
  check("health body { status: ok, uptime, isDemo }", h.json?.status === "ok" && typeof h.json?.uptime === "number" && h.json?.isDemo === true, JSON.stringify(h.json));

  const anon = await req("/api/admin/stats");
  check("anonymous /api/admin/stats -> 401", anon.status === 401 && anon.json?.error === "Not authenticated");
}

// ---------------------------------------------------------------------------
console.log("== rate limiting (public endpoints) ==");
{
  // Newsletter allows exactly 10 per IP per window; the 11th must 429.
  let blocked = null;
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const r = await req("/api/newsletter", { method: "POST", body: {} });
    statuses.push(r.status);
    if (r.status === 429) blocked = r;
  }
  check(
    "newsletter: 10 allowed then 429",
    statuses.slice(0, 10).every((s) => s === 400) && blocked !== null,
    `statuses=${statuses.join(",")}`
  );
  check("newsletter 429 has Retry-After + body", blocked !== null && is429(blocked));

  const login = await req("/api/auth/login", {
    method: "POST",
    body: { schoolId: "nope", email: "x@x.com", password: "x" },
  });
  check("login is rate-limited too (returns 400/401, not 429 yet)", login.status === 401 || login.status === 400, String(login.status));
}

// ---------------------------------------------------------------------------
console.log("== demo admin ==");
let adminCookie = "";
let kunleId = "";
let musaId = "";
{
  const demo = await req("/api/auth/demo", { method: "POST", body: {} });
  adminCookie = jar.get("edutrack_token");
  check("POST /api/auth/demo -> 200 + cookie", demo.status === 200 && !!adminCookie);

  const stats = await req("/api/admin/stats", { cookie: adminCookie });
  check("admin /api/admin/stats -> 200", stats.status === 200);
  check("stats totalStudents = 10 (seeded)", stats.json?.stats?.totalStudents === 10, JSON.stringify(stats.json?.stats?.totalStudents));

  const roster = await req("/api/users?role=STUDENT", { cookie: adminCookie });
  const students = roster.json?.users || [];
  kunleId = students.find((s) => s.email === "k.adebayo@edutrack.app")?.id || "";
  musaId = students.find((s) => s.email === "i.musa@edutrack.app")?.id || "";
  check("admin roster -> 10 students", roster.status === 200 && students.length === 10);
  check("found Kunle (SS1 Science) + Musa (SS1 Arts)", !!kunleId && !!musaId);

  const fees = await req("/api/fees", { cookie: adminCookie });
  check("admin /api/fees -> 200 + 10 ledger rows", fees.status === 200 && (fees.json?.ledger || []).length === 10);
  const kunleLedger = (fees.json?.ledger || []).find((l) => l.studentId === kunleId);
  check("Kunle ledger: 185000 billed / 74000 paid / 111000 balance", kunleLedger?.amount === 185000 && kunleLedger?.paid === 74000 && kunleLedger?.balance === 111000, JSON.stringify(kunleLedger));
}

// ---------------------------------------------------------------------------
console.log("== class ranking through the real routes ==");
{
  const r = await req("/api/reports?classArm=SS1%20Science&limit=50", { cookie: adminCookie });
  const rows = r.json?.students || [];
  check("admin /api/reports (SS1 Science) -> 200 + 4 rows", r.status === 200 && rows.length === 4, JSON.stringify(rows.length));
  check(
    "positions 1..4, outOf 4",
    JSON.stringify(rows.map((x) => x.position)) === "[1,2,3,4]" && rows.every((x) => x.outOf === 4)
  );
  check("every average 78.6 (seed design), 5 subjects, grade A", rows.every((x) => x.average === 78.6 && x.subjects === 5 && x.grade === "A"), JSON.stringify(rows.map((x) => x.average)));

  const card = await req(`/api/reports/${kunleId}`, { cookie: adminCookie });
  check("admin report card -> 200", card.status === 200);
  check(
    "card summary: avg 78.6, 5 subjects, position 1 of 4",
    card.json?.summary?.average === 78.6 && card.json?.summary?.subjects === 5 && card.json?.summary?.position === 1 && card.json?.summary?.outOf === 4,
    JSON.stringify(card.json?.summary)
  );
}

// ---------------------------------------------------------------------------
console.log("== teacher class-scope policy ==");
{
  const schools = await req("/api/schools?search=Greenfield");
  const sid = schools.json?.schools?.[0]?.id || "";
  check("school search -> Greenfield id", !!sid);

  const t = await req("/api/auth/login", {
    method: "POST",
    body: { schoolId: sid, email: "a.okafor@edutrack.app", password: "teacher123" },
  });
  const teacherCookie = jar.get("edutrack_token");
  check("teacher login -> 200 + cookie", t.status === 200 && !!teacherCookie);

  const own = await req("/api/scores?classArm=SS1%20Science&subject=Mathematics", { cookie: teacherCookie });
  check("teacher OWN-arm scores -> 200", own.status === 200 && Array.isArray(own.json?.scores));

  const foreign = await req("/api/scores?classArm=SS1%20Arts&subject=Mathematics", { cookie: teacherCookie });
  check(
    "teacher FOREIGN-arm scores -> 403 (scope closed)",
    foreign.status === 403 && foreign.json?.error === "Teachers can only access their assigned class",
    JSON.stringify(foreign.json)
  );

  const foreignReports = await req("/api/reports?classArm=SS1%20Arts", { cookie: teacherCookie });
  check("teacher FOREIGN-arm reports -> 403", foreignReports.status === 403);

  const ownCard = await req(`/api/reports/${kunleId}`, { cookie: teacherCookie });
  check("teacher report card (own arm) -> 200", ownCard.status === 200);
  const foreignCard = await req(`/api/reports/${musaId}`, { cookie: teacherCookie });
  check("teacher report card (foreign arm) -> 403", foreignCard.status === 403);
}

// ---------------------------------------------------------------------------
console.log("== parent scope ==");
{
  const schools = await req("/api/schools?search=Greenfield");
  const sid = schools.json?.schools?.[0]?.id || "";
  const p = await req("/api/auth/login", {
    method: "POST",
    body: { schoolId: sid, email: "p.adebayo@edutrack.app", password: "parent123" },
  });
  const parentCookie = jar.get("edutrack_token");
  check("parent login -> 200 + cookie", p.status === 200 && !!parentCookie);

  const children = await req("/api/parent/children", { cookie: parentCookie });
  const list = children.json?.children || [];
  check("parent /api/parent/children -> 200 + 2 children", children.status === 200 && list.length === 2, JSON.stringify(list.length));
  check(
    "children ranked: position in 1..4, outOf 4, avg 78.6",
    list.every((c) => c.position >= 1 && c.position <= 4 && c.outOf === 4 && c.average === 78.6),
    JSON.stringify(list.map((c) => ({ p: c.position, o: c.outOf, a: c.average })))
  );

  const ownCard = await req(`/api/reports/${kunleId}`, { cookie: parentCookie });
  check("parent own-child report -> 200", ownCard.status === 200);
  const stranger = await req(`/api/reports/${musaId}`, { cookie: parentCookie });
  check("parent non-child report -> 403", stranger.status === 403);
}

// ---------------------------------------------------------------------------
console.log("== student role + marketing endpoints ==");
{
  const schools = await req("/api/schools?search=Greenfield");
  const sid = schools.json?.schools?.[0]?.id || "";
  const s = await req("/api/auth/login", {
    method: "POST",
    body: { schoolId: sid, email: "k.adebayo@edutrack.app", password: "student123" },
  });
  const studentCookie = jar.get("edutrack_token");
  check("student login -> 200 + cookie", s.status === 200 && !!studentCookie);

  const mine = await req("/api/scores/student", { cookie: studentCookie });
  check("student /api/scores/student -> 200", mine.status === 200 && Array.isArray(mine.json?.scores));
  check("student summary avg 78.6", mine.json?.summary?.average === 78.6, JSON.stringify(mine.json?.summary?.average));

  const adminOnly = await req("/api/fees", { cookie: studentCookie });
  check("student on admin /api/fees -> 403", adminOnly.status === 403);

  const lead = await req("/api/leads", {
    method: "POST",
    body: { name: "Trace User", school: "Trace Academy", email: "trace-smoke@example.com" },
  });
  check("valid lead -> 201 stored", lead.status === 201 && lead.json?.stored === true, JSON.stringify(lead.json));

  const bot = await req("/api/leads", {
    method: "POST",
    body: { name: "Bot", school: "X", email: "bot@example.com", company: "spam" },
  });
  check("honeypot lead -> 200 stored:false", bot.status === 200 && bot.json?.stored === false);
}

// ---------------------------------------------------------------------------
console.log("");
if (failures === 0) {
  console.log(`ALL CHECKS PASSED (${BASE})`);
} else {
  console.log(`${failures} CHECK(S) FAILED (${BASE})`);
  process.exitCode = 1;
}
