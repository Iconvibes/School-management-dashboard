import Link from "next/link";
import {
  FileText,
  ClipboardList,
  CalendarCheck,
  Wallet,
  BarChart3,
  HeartHandshake,
  ShieldCheck,
  MonitorSmartphone,
  ArrowRight,
  Check,
  Sparkles,
  Layers,
} from "lucide-react";
import SiteNav from "@/components/marketing/SiteNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import Reveal from "@/components/marketing/Reveal";
import TiltCard from "@/components/marketing/TiltCard";
import Parallax from "@/components/marketing/Parallax";

const sections = [
  {
    id: "report-cards",
    icon: FileText,
    color: "#2563eb",
    kicker: "Headline feature",
    title: "Automated Report Cards",
    desc: "The days of manual result computation are over. Edutrack generates polished, A4-printable report cards for every student in one click.",
    points: [
      "Class position (1st, 2nd, 3rd…) computed automatically within each arm",
      "Per-subject remarks generated from letter grades",
      "Attendance summary printed on every card",
      "School logo watermark on the lower-right corner",
      "Signature blocks for class teacher and principal",
      "Download as branded PDF, or print directly",
    ],
    stat: { value: "1 click", label: "to a full class of report cards" },
  },
  {
    id: "grading",
    icon: ClipboardList,
    color: "#059669",
    kicker: "For teachers",
    title: "Instant Grading Matrix",
    desc: "A spreadsheet-style grid built for the way teachers actually work — type, watch grades compute live, then batch-save.",
    points: [
      "CA scores out of 40, Exam out of 60 — bounds enforced automatically",
      "Totals and A–F letter grades compute as you type",
      "Dirty / Saved indicators so nothing is lost",
      "Per-class, per-subject matrices with student lookup",
      "Auto-ranked best-students leaderboard",
    ],
    stat: { value: "0s", label: "for grades to appear as you type" },
  },
  {
    id: "attendance",
    icon: CalendarCheck,
    color: "#d97706",
    kicker: "Daily use",
    title: "Daily Attendance",
    desc: "Teachers mark daily registers per class arm with one tap. Administrators see patterns; parents see their child's record.",
    points: [
      "Date-based registers with Present / Absent toggles",
      "Teachers locked to their assigned class arm",
      "Live marked / present / absent counters",
      "Term attendance summary on every report card",
      "High-absence flags surfaced to parents",
    ],
    stat: { value: "1 tap", label: "per student, per day" },
  },
  {
    id: "fees",
    icon: Wallet,
    color: "#ea580c",
    kicker: "For the bursar",
    title: "Fee Management",
    desc: "Turn fee collection from a spreadsheet nightmare into a live ledger with balances, receipts and defaulters.",
    points: [
      "Fee structures per class arm, per term",
      "Partial payments with automatically updating balances",
      "Unique receipt numbers on every payment",
      "Billed / collected / outstanding dashboard",
      "One-click defaulter list",
      "Parents pay online via the Pay Now portal",
    ],
    stat: { value: "₦", label: "live balances in Naira, no manual math" },
  },
  {
    id: "payroll",
    icon: BarChart3,
    color: "#7c3aed",
    kicker: "For the administrator",
    title: "Teacher Payroll",
    desc: "Keep staff compensation transparent and current with a complete teacher directory and payroll metrics.",
    points: [
      "Teacher directory with class arm assignments",
      "Paid / Pending status toggles",
      "Payroll summary right on the dashboard",
      "Add teachers in one click",
    ],
    stat: { value: "1 click", label: "to update any teacher's payroll status" },
  },
  {
    id: "parents",
    icon: HeartHandshake,
    color: "#0d9488",
    kicker: "For guardians",
    title: "Parent Portal",
    desc: "The paying customer gets visibility. Parents log in once and see everything about their children.",
    points: [
      "Admins link parents to one or many children",
      "Live report cards with position and remarks",
      "Attendance history per child",
      "Fee balances in Naira with one-click Pay Now",
      "Instant receipt numbers on online payments",
      "Works on any phone — no app install needed",
    ],
    stat: { value: "Pay Now", label: "from the parent's phone, in seconds" },
  },
  {
    id: "multitenant",
    icon: ShieldCheck,
    color: "#1e293b",
    kicker: "Security",
    title: "Multi-Tenant Isolation",
    desc: "Edutrack is built for many schools on one platform. Your data is never visible to another tenant — guaranteed at the data layer.",
    points: [
      "Every school is a fully isolated tenant",
      "School A can never see School B's data",
      "School-scoped emails: no global clashes",
      "Role-based access on every API route",
      "Passwords hashed, sessions in HTTP-only cookies",
    ],
    stat: { value: "100%", label: "tenant isolation enforced server-side" },
  },
  {
    id: "pwa",
    icon: MonitorSmartphone,
    color: "#0f172a",
    kicker: "Any device",
    title: "Installable App + Website",
    desc: "Install Edutrack on Android phones and Windows PCs like a native app — or use it as a plain website. Same data, same experience.",
    points: [
      "Installable on Android & Windows (Chrome/Edge)",
      "Works identically in any browser on any device",
      "Offline shell for key pages",
      "No app store, no downloads for parents",
    ],
    stat: { value: "1 tap", label: "to install the app, or just use the web" },
  },
];

export default function FeaturesPage() {
  return (
    <main className="flex-1 overflow-x-clip bg-navy-950">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <Parallax speed={0.2} className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[140px]" />
        </Parallax>
        <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-20 text-center lg:pt-28">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-300">
              <Sparkles className="h-3.5 w-3.5" /> Every module, one platform
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Eight modules.{" "}
              <span className="animate-gradient-text bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
                One login.
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-navy-300">
              From the classroom to the bursar&apos;s office to the parent&apos;s
              phone — Edutrack covers the full lifecycle of running a school.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-navy-200 backdrop-blur transition hover:border-brand-400/40 hover:text-white"
                >
                  <s.icon className="h-3.5 w-3.5" style={{ color: s.color }} />
                  {s.title.split(" ")[0]}
                </a>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Module sections */}
      <div className="bg-navy-50">
        {sections.map((s, idx) => (
          <section
            key={s.id}
            id={s.id}
            className={`scroll-mt-24 py-16 lg:py-20 ${idx % 2 === 1 ? "bg-white" : "bg-navy-50"}`}
          >
            <div className="mx-auto max-w-7xl px-5">
              <div className="grid items-center gap-12 lg:grid-cols-2">
                <Reveal variant={idx % 2 === 0 ? "left" : "right"}>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white"
                    style={{ background: s.color }}
                  >
                    <s.icon className="h-3.5 w-3.5" /> {s.kicker}
                  </span>
                  <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-navy-800 sm:text-4xl">
                    {s.title}
                  </h2>
                  <p className="mt-4 text-lg leading-8 text-navy-500">{s.desc}</p>
                  <ul className="mt-6 space-y-3">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-navy-600">
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                          style={{ background: `${s.color}18`, color: s.color }}
                        >
                          <Check className="h-3 w-3" />
                        </span>
                        <span className="text-sm leading-6">{p}</span>
                      </li>
                    ))}
                  </ul>
                </Reveal>

                <Reveal variant={idx % 2 === 0 ? "right" : "left"} delay={120}>
                  <TiltCard maxTilt={8} className="perspective-1200">
                    <div
                      className="relative overflow-hidden rounded-2xl p-8 text-white shadow-2xl"
                      style={{ background: `linear-gradient(135deg, #0f172a 0%, ${s.color}dd 140%)` }}
                    >
                      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                      <div className="relative">
                        <div
                          className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg"
                          style={{ background: `${s.color}`, border: "1px solid rgba(255,255,255,0.25)" }}
                        >
                          <s.icon className="h-7 w-7" />
                        </div>
                        <p className="mt-6 text-5xl font-extrabold tracking-tight">{s.stat.value}</p>
                        <p className="mt-2 text-sm text-navy-200">{s.stat.label}</p>
                        <div className="mt-8 rounded-xl bg-white/10 p-4 backdrop-blur">
                          <p className="text-xs font-semibold uppercase tracking-wider text-navy-200">
                            Included in
                          </p>
                          <p className="mt-1 text-sm font-bold">
                            {idx === 5 ? "Starter, Standard & Enterprise" : "Every plan"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </TiltCard>
                </Reveal>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* CTA */}
      <section className="bg-navy-950 py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <Reveal variant="scale">
            <Layers className="mx-auto h-10 w-10 text-brand-400" />
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Every module, working together
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-navy-300">
              Grading feeds report cards. Attendance feeds report cards. Fees
              feed parents. One platform, one login, zero spreadsheets.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="group inline-flex items-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-xl shadow-brand-600/40 transition hover:-translate-y-0.5 hover:bg-brand-500"
              >
                Register your school
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/solutions"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 font-semibold text-white backdrop-blur transition hover:bg-white/10"
              >
                See the portals <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
