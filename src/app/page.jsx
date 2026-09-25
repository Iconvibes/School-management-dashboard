import Link from "next/link";
import {
  GraduationCap,
  FileText,
  Layers,
  Wallet,
  ShieldCheck,
  ClipboardList,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  BarChart3,
  Users,
  School,
  CalendarCheck,
  HeartHandshake,
  MonitorSmartphone,
  Award,
  Quote,
  Star,
  ChevronRight,
  Download,
  Smartphone,
  Monitor,
} from "lucide-react";
import SiteNav from "@/components/marketing/SiteNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import Reveal from "@/components/marketing/Reveal";
import TiltCard from "@/components/marketing/TiltCard";
import Parallax from "@/components/marketing/Parallax";
import DemoLoginButton from "@/components/DemoLoginButton";
import InstallPwaButton from "@/components/InstallPwaButton";

const modules = [
  {
    id: "report-cards",
    icon: FileText,
    title: "Automated Report Cards",
    desc: "Polished A4-printable report cards with class positions, subject remarks, attendance and signature blocks — generated in one click and downloadable as PDF.",
    tag: "Headline feature",
    color: "#2563eb",
  },
  {
    id: "grading",
    icon: ClipboardList,
    title: "Instant Grading Matrix",
    desc: "Enter CA (out of 40) and Exam (out of 60) scores. Totals and letter grades compute live as teachers type — with dirty/saved indicators and batch save.",
    tag: "Teachers",
    color: "#059669",
  },
  {
    id: "attendance",
    icon: CalendarCheck,
    title: "Daily Attendance",
    desc: "Mark daily registers per class arm with one tap. Attendance summaries flow automatically onto every report card.",
    tag: "Daily use",
    color: "#d97706",
  },
  {
    id: "fees",
    icon: Wallet,
    title: "Fee Management",
    desc: "Fee structures per class arm, termly billing, partial payments with live balances, auto-receipts and a defaulter list. Parents can Pay Now online.",
    tag: "Revenue",
    color: "#ea580c",
  },
  {
    id: "payroll",
    icon: BarChart3,
    title: "Teacher Payroll",
    desc: "Keep staff compensation transparent with paid/pending toggles, payroll metrics and a complete teacher directory.",
    tag: "Staff",
    color: "#7c3aed",
  },
  {
    id: "parents",
    icon: HeartHandshake,
    title: "Parent Portal",
    desc: "Parents log in to track report cards, attendance and fee balances for all their children — with one-click Pay Now and receipts.",
    tag: "Parents",
    color: "#0d9488",
  },
  {
    id: "multitenant",
    icon: ShieldCheck,
    title: "Multi-Tenant Isolation",
    desc: "Every school is a fully isolated tenant. School A can never see School B's students, scores or payroll — enforced at the data layer.",
    tag: "Security",
    color: "#1e293b",
  },
  {
    id: "pwa",
    icon: MonitorSmartphone,
    title: "Installable App",
    desc: "Install Edutrack on Android phones and Windows PCs like a native app — or keep using the website, it works exactly the same.",
    tag: "Any device",
    color: "#0f172a",
  },
];

const steps = [
  {
    n: "01",
    title: "Register your school",
    desc: "Create a tenant in under a minute and onboard your class arms, session and branding.",
  },
  {
    n: "02",
    title: "Add staff, students & parents",
    desc: "Create teachers, learners and link parents. Set fee structures per class arm.",
  },
  {
    n: "03",
    title: "Grade, mark & collect",
    desc: "Teachers grade and mark attendance daily. Parents see everything and pay online.",
  },
  {
    n: "04",
    title: "Print & grow",
    desc: "Publish branded PDF report cards and watch your school run itself.",
  },
];

const testimonials = [
  {
    quote:
      "We moved 480 students onto Edutrack in one term. Report cards that used to take two weeks now print in minutes.",
    name: "Mrs. Adaeze Okafor",
    role: "Principal, Greenfield International School",
    initials: "AO",
  },
  {
    quote:
      "The fee ledger alone paid for itself — parents pay online and the defaulter list keeps our cash flow healthy.",
    name: "Mr. Tunde Bakare",
    role: "Bursar, Lakeside Academy",
    initials: "TB",
  },
  {
    quote:
      "My teachers grade, mark attendance and generate report cards from one portal. Adoption was instant.",
    name: "Dr. Ifeoma Nwosu",
    role: "Proprietress, Sunrise College",
    initials: "IN",
  },
];

const stats = [
  { value: "500+", label: "Schools onboarded" },
  { value: "42K", label: "Students managed" },
  { value: "98.9%", label: "Report card delivery" },
  { value: "60%", label: "Faster fee collection" },
];

export default function Home() {
  return (
    <main className="flex-1 overflow-x-clip bg-navy-950">
      <SiteNav />

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
        {/* 3D parallax backdrop */}
        <Parallax speed={0.2} className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[150px]" />
        </Parallax>
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(148,163,184,.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,.35) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
        </div>
        {/* floating orbs */}
        <div className="animate-drift pointer-events-none absolute right-[8%] top-24 h-40 w-40 rounded-full bg-brand-500/20 blur-[80px]" />
        <div className="animate-drift-slow pointer-events-none absolute left-[6%] top-1/2 h-52 w-52 rounded-full bg-violet-500/15 blur-[90px]" />

        <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-20 lg:pt-28">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            {/* Copy */}
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-300">
                  <span className="animate-ping-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <Sparkles className="h-3.5 w-3.5" />
                  The all-in-one school management platform
                </span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl">
                  Run your entire school from{" "}
                  <span className="animate-gradient-text bg-gradient-to-r from-brand-400 via-brand-300 to-violet-400 bg-clip-text text-transparent">
                    one cloud platform
                  </span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className="mt-6 max-w-xl text-lg leading-8 text-navy-300">
                  Edutrack unifies <strong className="text-white">report cards</strong>,{" "}
                  <strong className="text-white">grading matrices</strong>,{" "}
                  <strong className="text-white">attendance</strong>,{" "}
                  <strong className="text-white">fee management</strong>,{" "}
                  <strong className="text-white">payroll</strong> and a{" "}
                  <strong className="text-white">parent portal</strong> — in a single
                  multi-tenant system built for modern schools.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/register"
                    className="group inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-brand-600/40 transition hover:-translate-y-0.5 hover:bg-brand-500"
                  >
                    Get started free
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <DemoLoginButton />
                </div>
              </Reveal>
              <Reveal delay={320}>
                <div className="mt-8 flex flex-wrap items-center gap-5 text-sm text-navy-400">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Free pilot term
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" /> No card required
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Installable app
                  </span>
                </div>
              </Reveal>
            </div>

            {/* 3D hero visual */}
            <Reveal variant="scale" delay={200} className="perspective-2000">
              <div className="relative">
                {/* spinning dashed ring */}
                <div className="animate-spin-slow absolute -inset-6 rounded-full border-2 border-dashed border-brand-400/20" />
                <TiltCard maxTilt={10} className="preserve-3d">
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-navy-900/80 shadow-2xl shadow-navy-950/60 backdrop-blur">
                    {/* window chrome */}
                    <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      <span className="ml-3 text-xs font-medium text-navy-300">
                        admin.greenfield.edu — Super Admin Dashboard
                      </span>
                    </div>
                    {/* metric cards */}
                    <div className="grid gap-3 p-4 sm:grid-cols-4">
                      {[
                        { label: "Total Students", value: "1,248", icon: Users, color: "text-brand-300" },
                        { label: "Active Teachers", value: "96", icon: GraduationCap, color: "text-emerald-300" },
                        { label: "Fee Collection", value: "84%", icon: Wallet, color: "text-amber-300" },
                        { label: "Payroll Paid", value: "41/96", icon: BarChart3, color: "text-violet-300" },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-xl border border-white/10 bg-navy-800/60 p-4 transition-transform duration-300"
                          style={{ transform: "translateZ(24px)" }}
                        >
                          <s.icon className={`h-4 w-4 ${s.color}`} />
                          <p className="mt-3 text-2xl font-bold text-white">{s.value}</p>
                          <p className="mt-0.5 text-xs text-navy-300">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {/* grading mock */}
                    <div className="grid gap-3 p-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-navy-800/60 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-navy-300">
                          Grading matrix · SS1 Science
                        </p>
                        {[
                          ["Kunle Adebayo", "Maths", 34, 52, "A"],
                          ["Chidinma Obi", "Physics", 30, 44, "B"],
                          ["Emeka Nwosu", "Chem", 28, 40, "C"],
                          ["Fatima Bello", "Biology", 36, 50, "A"],
                        ].map(([name, subj, ca, ex, g]) => (
                          <div
                            key={name}
                            className="mt-2.5 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs"
                            style={{ transform: "translateZ(12px)" }}
                          >
                            <span className="font-medium text-navy-100">{name}</span>
                            <span className="text-navy-300">
                              {ca}+{ex}={ca + ex}
                            </span>
                            <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 font-bold text-emerald-300">
                              {g}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-navy-800/60 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-navy-300">
                          Fee ledger
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-navy-200">SS1 Science</span>
                          <span className="font-bold text-white">₦185,000</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full w-[74%] rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300" />
                        </div>
                        <p className="mt-2 text-[11px] text-navy-400">Collected this term</p>
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span className="text-navy-200">Attendance</span>
                          <span className="inline-flex items-center gap-1.5 text-emerald-300">
                            <CalendarCheck className="h-3.5 w-3.5" /> 92%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-brand-500 to-brand-300" />
                        </div>
                        <div className="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/20">
                          <HeartHandshake className="mr-1.5 inline h-3.5 w-3.5" />
                          Parent paid online · RCT-1012
                        </div>
                      </div>
                    </div>
                  </div>
                </TiltCard>

                {/* floating badge cards */}
                <div className="animate-float-y absolute -left-8 top-10 hidden rounded-2xl border border-white/10 bg-navy-900/90 px-4 py-3 shadow-2xl backdrop-blur sm:block">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                      <Award className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-white">Kunle Adebayo</p>
                      <p className="text-[11px] text-navy-400">Position · 1st of 42</p>
                    </div>
                  </div>
                </div>
                <div
                  className="animate-float-y absolute -right-6 bottom-8 hidden rounded-2xl border border-white/10 bg-navy-900/90 px-4 py-3 shadow-2xl backdrop-blur sm:block"
                  style={{ animationDelay: "1.4s" }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/20 text-brand-300">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-white">Report card</p>
                      <p className="text-[11px] text-navy-400">A4 PDF · ready to print</p>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Stats strip */}
          <Reveal delay={120}>
            <div className="mt-16 grid grid-cols-2 gap-6 rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-3xl font-extrabold text-white">{s.value}</p>
                  <p className="mt-1 text-xs font-medium text-navy-400">{s.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ MODULES GRID ============ */}
      <section id="features" className="bg-navy-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Everything in one place
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-800 sm:text-5xl">
              Eight modules. One login.
            </h2>
            <p className="mt-4 text-lg text-navy-500">
              Edutrack covers the full lifecycle of running a school — from the
              classroom to the bursar&apos;s office to the parent&apos;s phone.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((m, i) => (
              <Reveal key={m.id} delay={(i % 4) * 70}>
                <TiltCard maxTilt={7} className="h-full">
                  <Link
                    href={`/features#${m.id}`}
                    className="group flex h-full flex-col rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm transition hover:border-brand-200 hover:shadow-xl hover:shadow-brand-600/10"
                  >
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-white ring-1 ring-white/20 transition group-hover:scale-110"
                      style={{ background: m.color }}
                    >
                      <m.icon className="h-5 w-5" />
                    </div>
                    <span className="mt-4 text-[10px] font-bold uppercase tracking-widest text-navy-400">
                      {m.tag}
                    </span>
                    <h3 className="mt-1 text-lg font-bold text-navy-800">{m.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-navy-500">{m.desc}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100">
                      Explore module <ChevronRight className="h-4 w-4" />
                    </span>
                  </Link>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" className="relative overflow-hidden bg-white py-20 lg:py-28">
        <Parallax speed={0.15} className="pointer-events-none absolute right-0 top-1/3">
          <div className="h-72 w-72 rounded-full bg-brand-200/40 blur-[100px]" />
        </Parallax>
        <div className="relative mx-auto max-w-7xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              How it works
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-800 sm:text-5xl">
              Live in four simple steps
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div className="group relative">
                  <span className="bg-gradient-to-br from-brand-600 to-brand-400 bg-clip-text text-6xl font-extrabold text-transparent transition group-hover:from-brand-500 group-hover:to-violet-400">
                    {s.n}
                  </span>
                  <h3 className="mt-3 text-lg font-bold text-navy-800">{s.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-navy-500">{s.desc}</p>
                  {i < steps.length - 1 && (
                    <div className="absolute -right-4 top-8 hidden text-navy-200 lg:block">
                      <ChevronRight className="h-5 w-5" />
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      <section className="bg-navy-900 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-400">
              Loved by schools
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              Schools that switched, stayed
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={i * 90}>
                <TiltCard maxTilt={6} className="h-full">
                  <figure className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur transition hover:bg-white/10">
                    <Quote className="h-7 w-7 text-brand-400" />
                    <div className="mt-3 flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <blockquote className="mt-4 flex-1 text-sm leading-7 text-navy-200">
                      “{t.quote}”
                    </blockquote>
                    <figcaption className="mt-6 flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/20 text-sm font-bold text-brand-300">
                        {t.initials}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-white">{t.name}</p>
                        <p className="text-xs text-navy-400">{t.role}</p>
                      </div>
                    </figcaption>
                  </figure>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ INSTALL THE APP ============ */}
      <section id="install" className="relative overflow-hidden bg-navy-900 py-20 lg:py-24">
        <Parallax speed={0.18} className="pointer-events-none absolute inset-0">
          <div className="animate-drift absolute -left-24 top-0 h-80 w-80 rounded-full bg-brand-600/20 blur-[110px]" />
        </Parallax>
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-2">
          <Reveal>
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-400">
              Use it as an app or a website
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              Take Edutrack anywhere
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-8 text-navy-300">
              Install the app on Android phones and Windows PCs with one tap — it opens
              fullscreen with its own icon, works offline and updates itself. Everyone
              else can simply keep using the website. Same data, same login, same
              experience.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <InstallPwaButton className="px-6 py-3 text-base" />
              <Link
                href="/download"
                className="group inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-base font-semibold text-white backdrop-blur transition hover:bg-white/10"
              >
                <Download className="h-4 w-4" />
                How to install
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-400">
              <span className="flex items-center gap-1.5">
                <Smartphone className="h-4 w-4 text-emerald-400" /> Android phones
              </span>
              <span className="flex items-center gap-1.5">
                <Monitor className="h-4 w-4 text-emerald-400" /> Windows PCs
              </span>
              <span className="flex items-center gap-1.5">
                <MonitorSmartphone className="h-4 w-4 text-emerald-400" /> Works on any device
              </span>
            </div>
          </Reveal>

          <Reveal variant="scale" delay={160} className="perspective-2000">
            <TiltCard maxTilt={8} className="preserve-3d">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-navy-950/80 shadow-2xl backdrop-blur">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-3 flex items-center gap-1.5 text-xs font-medium text-navy-300">
                    <Smartphone className="h-3.5 w-3.5" />
                    Edutrack App — installed on Android &amp; Windows
                  </span>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {[
                    { icon: GraduationCap, label: "1,248 students", sub: "live this term" },
                    { icon: FileText, label: "Report cards", sub: "A4 PDF, one click" },
                    { icon: Wallet, label: "Fees collected", sub: "₦142M · 84%" },
                    { icon: CalendarCheck, label: "Attendance", sub: "92% this week" },
                  ].map((t) => (
                    <div
                      key={t.label}
                      className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                      style={{ transform: "translateZ(20px)" }}
                    >
                      <t.icon className="h-4 w-4 text-brand-300" />
                      <p className="mt-2.5 text-lg font-bold text-white">{t.label}</p>
                      <p className="text-xs text-navy-400">{t.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-navy-400">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Installed &amp; up to date
                  </span>
                  <span className="font-semibold text-navy-200">Edutrack · v0.1</span>
                </div>
              </div>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section id="cta" className="relative overflow-hidden bg-navy-950 py-24">
        <Parallax speed={0.25} className="pointer-events-none absolute inset-0">
          <div className="animate-drift absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/25 blur-[120px]" />
          <div className="animate-drift-slow absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />
        </Parallax>
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <Reveal variant="scale">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/15 ring-1 ring-brand-400/30">
              <School className="h-8 w-8 text-brand-400" />
            </div>
            <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              Ready to modernize your school?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-navy-300">
              Register your school in under a minute, run a full term free, and
              see why schools never go back to paper.
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
              <DemoLoginButton />
            </div>
            <p className="mt-5 text-sm text-navy-400">
              Free pilot term · No card required · Cancel anytime
            </p>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
