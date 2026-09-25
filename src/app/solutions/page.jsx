import Link from "next/link";
import {
  Crown,
  BookOpen,
  GraduationCap,
  HeartHandshake,
  ArrowRight,
  Sparkles,
  LayoutDashboard,
  FileText,
  CalendarCheck,
  Wallet,
  BarChart3,
  Users,
  ClipboardList,
  ShieldCheck,
  MonitorSmartphone,
  Layers,
  Rocket,
  UserPlus,
  PencilRuler,
  PartyPopper,
} from "lucide-react";
import SiteNav from "@/components/marketing/SiteNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import Reveal from "@/components/marketing/Reveal";
import TiltCard from "@/components/marketing/TiltCard";
import Parallax from "@/components/marketing/Parallax";

const portals = [
  {
    id: "admin",
    icon: Crown,
    color: "#2563eb",
    role: "Super Admin",
    title: "The school command center",
    desc: "Every school's owner or head gets a single dashboard over the entire institution — students, teachers, money and results.",
    cards: [
      { icon: LayoutDashboard, title: "Live dashboard", desc: "Best students by grade, enrolment, fee collection and payroll at a glance." },
      { icon: ClipboardList, title: "Students & classes", desc: "Add students, assign class arms, link parents, and track every record." },
      { icon: FileText, title: "Full report access", desc: "Search any student by name or class and open their report card instantly." },
      { icon: Wallet, title: "Fee ledger", desc: "Structures per class arm, partial payments, receipts, and one-click defaulters." },
      { icon: BarChart3, title: "Payroll", desc: "Teacher directory with paid/pending toggles and payroll summaries." },
      { icon: Users, title: "Staff control", desc: "Invite teachers and control exactly what each role can see." },
    ],
  },
  {
    id: "teacher",
    icon: BookOpen,
    color: "#059669",
    role: "Teacher",
    title: "Built for the classroom",
    desc: "Teachers get exactly the tools they need — nothing that distracts — locked to their own class arm and subjects.",
    cards: [
      { icon: PencilRuler, title: "Grading matrix", desc: "Type CA and exam scores; totals and A–F grades compute live as you type." },
      { icon: CalendarCheck, title: "Attendance register", desc: "One-tap present/absent per student per day, locked to your assigned class." },
      { icon: FileText, title: "Class report cards", desc: "Generate every student's report card for your class in one click." },
      { icon: GraduationCap, title: "Best students", desc: "Your dashboard automatically ranks the top students by grade." },
      { icon: ShieldCheck, title: "Class isolation", desc: "You physically cannot open another teacher's class or another school's data." },
    ],
  },
  {
    id: "student",
    icon: GraduationCap,
    color: "#d97706",
    role: "Student",
    title: "Their results, their portal",
    desc: "Each student logs in and sees their own grades, position, attendance and report card — and nothing else.",
    cards: [
      { icon: FileText, title: "My report card", desc: "Position, average, per-subject remarks and attendance, ready to print." },
      { icon: ClipboardList, title: "My scores", desc: "CA, exam and total per subject, with grade colors that make sense." },
      { icon: CalendarCheck, title: "My attendance", desc: "Days present this term, updated automatically from the register." },
      { icon: ShieldCheck, title: "Own data only", desc: "A student can never view another student's record. Ever." },
    ],
  },
  {
    id: "parent",
    icon: HeartHandshake,
    color: "#0d9488",
    role: "Parent",
    title: "The paying customer, in the loop",
    desc: "Parents log in from any phone and see everything about their children — with a one-tap Pay Now for fees.",
    cards: [
      { icon: FileText, title: "Child's report cards", desc: "Position, remarks and attendance for every linked child, per term." },
      { icon: CalendarCheck, title: "Attendance history", desc: "How many days their child has been present this term." },
      { icon: Wallet, title: "Fee balances", desc: "What's billed, what's paid, what's outstanding — in Naira." },
      { icon: HeartHandshake, title: "Pay Now", desc: "One click to pay the balance and get an instant receipt number." },
      { icon: ShieldCheck, title: "Linked children only", desc: "A parent sees exactly the children their school linked to them." },
    ],
  },
];

const steps = [
  {
    icon: Rocket,
    step: "Step 1",
    title: "Register your school",
    desc: "Create your tenant in under a minute. Your data is instantly isolated from every other school on the platform.",
  },
  {
    icon: UserPlus,
    step: "Step 2",
    title: "Add classes, teachers & students",
    desc: "Set up class arms, add teachers, and enroll students. Link parents so guardians get their own logins.",
  },
  {
    icon: PencilRuler,
    step: "Step 3",
    title: "Teach, grade & mark attendance",
    desc: "Teachers fill the grading matrix and take daily attendance. Everything computes automatically.",
  },
  {
    icon: PartyPopper,
    step: "Step 4",
    title: "Reports, fees & growth",
    desc: "One click generates report cards, the bursar tracks fees and defaulters, and parents pay online.",
  },
];

export default function SolutionsPage() {
  return (
    <main className="flex-1 overflow-x-clip bg-navy-950">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <Parallax speed={0.2} className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/4 h-[380px] w-[560px] rounded-full bg-violet-600/20 blur-[140px]" />
          <div className="absolute -right-24 top-40 h-[320px] w-[480px] rounded-full bg-brand-600/20 blur-[130px]" />
        </Parallax>
        <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-20 text-center lg:pt-28">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-300">
              <Sparkles className="h-3.5 w-3.5" /> Four portals, one platform
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Every role gets a portal{" "}
              <span className="animate-gradient-text bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
                that fits
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-navy-300">
              School owner, teacher, student or parent — you log in and see your
              world. No clutter, no cross-access, no training manual.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {portals.map((p) => (
                <a
                  key={p.id}
                  href={`#${p.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-navy-200 backdrop-blur transition hover:border-brand-400/40 hover:text-white"
                >
                  <p.icon className="h-3.5 w-3.5" style={{ color: p.color }} />
                  For {p.role}
                </a>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Portal sections */}
      <div className="bg-navy-50">
        {portals.map((p, idx) => (
          <section
            key={p.id}
            id={p.id}
            className={`scroll-mt-24 py-16 lg:py-20 ${idx % 2 === 1 ? "bg-white" : "bg-navy-50"}`}
          >
            <div className="mx-auto max-w-7xl px-5">
              <div className="grid items-center gap-12 lg:grid-cols-5">
                {/* Intro */}
                <Reveal variant={idx % 2 === 0 ? "left" : "right"} className="lg:col-span-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white"
                    style={{ background: p.color }}
                  >
                    <p.icon className="h-3.5 w-3.5" /> {p.role}
                  </span>
                  <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-navy-800 sm:text-4xl">
                    {p.title}
                  </h2>
                  <p className="mt-4 text-lg leading-8 text-navy-500">{p.desc}</p>
                  <Link
                    href="/login"
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
                  >
                    Sign in as {p.role} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Reveal>

                {/* Cards */}
                <div className="lg:col-span-3">
                  <div className={`grid gap-4 sm:grid-cols-2 ${idx % 2 === 0 ? "lg:pl-8" : "lg:pr-8"}`}>
                    {p.cards.map((c, ci) => (
                      <Reveal key={c.title} variant="up" delay={ci * 70}>
                        <TiltCard maxTilt={10}>
                          <div
                            className="h-full rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm transition-shadow hover:shadow-xl"
                            style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
                          >
                            <div
                              className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
                              style={{ background: `${p.color}`, boxShadow: `0 6px 16px ${p.color}33` }}
                            >
                              <c.icon className="h-5 w-5" />
                            </div>
                            <h3 className="mt-4 font-bold text-navy-800">{c.title}</h3>
                            <p className="mt-1.5 text-sm leading-6 text-navy-500">{c.desc}</p>
                          </div>
                        </TiltCard>
                      </Reveal>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* How it works */}
      <section className="relative overflow-hidden bg-navy-950 py-20">
        <Parallax speed={0.15} className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 right-1/4 h-72 w-72 rounded-full bg-brand-600/20 blur-[120px]" />
        </Parallax>
        <div className="relative mx-auto max-w-7xl px-5">
          <Reveal className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-300">
              <Layers className="h-3.5 w-3.5" /> From signup to report day
            </span>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              How it works
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-navy-300">
              A school can go from registration to printed report cards in an
              afternoon. Four steps, no training course required.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 100}>
                <TiltCard maxTilt={10} className="h-full">
                  <div className="relative h-full rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-colors hover:border-brand-400/30">
                    <span className="absolute right-4 top-4 text-4xl font-extrabold text-white/10">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-[11px] font-bold uppercase tracking-widest text-brand-300">
                      {s.step}
                    </p>
                    <h3 className="mt-1 font-bold text-white">{s.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-navy-300">{s.desc}</p>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Multi-tenant + devices strip */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid gap-5 lg:grid-cols-3">
            <Reveal>
              <div className="h-full rounded-2xl border border-navy-200/70 bg-navy-50/60 p-7">
                <ShieldCheck className="h-6 w-6 text-emerald-600" />
                <h3 className="mt-3 text-lg font-bold text-navy-800">Safe for every school</h3>
                <p className="mt-2 text-sm leading-6 text-navy-500">
                  Each school is a fully isolated tenant. Your students&apos; records
                  are never visible to any other school on the platform.
                </p>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="h-full rounded-2xl border border-navy-200/70 bg-navy-50/60 p-7">
                <MonitorSmartphone className="h-6 w-6 text-brand-600" />
                <h3 className="mt-3 text-lg font-bold text-navy-800">Any device, any time</h3>
                <p className="mt-2 text-sm leading-6 text-navy-500">
                  Installable on Android and Windows, or use it straight from any
                  browser. Parents don&apos;t need to install anything.
                </p>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="h-full rounded-2xl border border-navy-200/70 bg-navy-50/60 p-7">
                <GraduationCap className="h-6 w-6 text-violet-600" />
                <h3 className="mt-3 text-lg font-bold text-navy-800">Built for growth</h3>
                <p className="mt-2 text-sm leading-6 text-navy-500">
                  From one arm of SS1 to a multi-campus academy — class arms,
                  sessions and terms all scale without rework.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy-950 py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <Reveal variant="scale">
            <Layers className="mx-auto h-10 w-10 text-brand-400" />
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              See every portal in action
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-navy-300">
              Jump into the live demo school and click through the admin,
              teacher, student and parent dashboards for yourself.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-xl shadow-brand-600/40 transition hover:-translate-y-0.5 hover:bg-brand-500"
              >
                Explore the live demo
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 font-semibold text-white backdrop-blur transition hover:bg-white/10"
              >
                Register your school <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
