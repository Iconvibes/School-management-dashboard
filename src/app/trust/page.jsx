import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  Database,
  Users,
  Cloud,
  FileCheck2,
  Headset,
  ArrowRight,
  ServerCog,
  Sparkles,
  BadgeCheck,
} from "lucide-react";
import SiteNav from "@/components/marketing/SiteNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import Reveal from "@/components/marketing/Reveal";
import TiltCard from "@/components/marketing/TiltCard";
import Parallax from "@/components/marketing/Parallax";
import DemoLoginButton from "@/components/DemoLoginButton";

const pillars = [
  {
    icon: Lock,
    title: "Encryption everywhere",
    desc: "All data is encrypted in transit (TLS) and at rest. Passwords are hashed — never stored in plain text.",
  },
  {
    icon: Users,
    title: "Strict role-based access",
    desc: "Super admins, teachers and students each see exactly what their role allows. A teacher can never access another class — or another school.",
  },
  {
    icon: Database,
    title: "Multi-tenant isolation",
    desc: "Every school is a fully isolated tenant. School A's data is physically and logically separated from School B's.",
  },
  {
    icon: Cloud,
    title: "Daily backups",
    desc: "Your records — transcripts, scores, attendance and fee history — are backed up daily with recovery procedures in place.",
  },
  {
    icon: FileCheck2,
    title: "You own your data",
    desc: "Export or delete your school's data at any time. There is no lock-in, and we never sell student information.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy-compliant",
    desc: "Designed with data protection principles in mind (NDPR-aligned): consent, transparency and data minimization.",
  },
];

export default function TrustPage() {
  return (
    <main className="flex-1 overflow-x-clip bg-navy-950">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <Parallax speed={0.2} className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[140px]" />
        </Parallax>
        <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-20 text-center lg:pt-28">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-300">
              <ShieldCheck className="h-3.5 w-3.5" /> Trust & Security
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Your school&apos;s data,{" "}
              <span className="animate-gradient-text bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
                protected
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-navy-300">
              Schools guard years of student transcripts and financial records.
              We built Edutrack to treat that trust as the product&apos;s foundation.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Pillars */}
      <section className="bg-navy-50 py-16">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {pillars.map((p, i) => (
              <Reveal key={p.title} delay={(i % 3) * 90}>
                <TiltCard maxTilt={8} className="h-full">
                  <div className="group h-full rounded-2xl border border-navy-200/70 bg-white p-7 shadow-sm transition-shadow hover:shadow-xl hover:shadow-brand-600/10">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-600/10 transition group-hover:bg-brand-600 group-hover:text-white">
                      <p.icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-navy-800">{p.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-navy-500">{p.desc}</p>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>

          {/* Operations */}
          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <Reveal variant="left">
              <div className="h-full rounded-2xl bg-navy-900 p-8 text-white">
                <ServerCog className="h-6 w-6 text-brand-300" />
                <h3 className="mt-3 text-lg font-bold">Reliable infrastructure</h3>
                <p className="mt-2 text-sm leading-6 text-navy-300">
                  Edutrack runs on modern cloud infrastructure with automated
                  monitoring, daily backups, and a 99.9% uptime target. We schedule
                  maintenance outside school hours so exam-week grading is never interrupted.
                </p>
              </div>
            </Reveal>
            <Reveal variant="right" delay={100}>
              <div className="h-full rounded-2xl border border-navy-200/70 bg-white p-8">
                <Headset className="h-6 w-6 text-brand-600" />
                <h3 className="mt-3 text-lg font-bold text-navy-800">Support when it matters</h3>
                <p className="mt-2 text-sm leading-6 text-navy-500">
                  Real humans, reachable during school hours. Onboarding help, data
                  migration from your old Excel files, and training videos so your
                  teachers are comfortable from week one.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <Reveal variant="scale">
            <BadgeCheck className="mx-auto h-9 w-9 text-brand-600" />
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-navy-800">
              See the platform your data deserves
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-navy-500">
              Explore the live demo school, or register your own school and
              experience tenant-isolated security firsthand.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-xl shadow-brand-600/40 transition hover:-translate-y-0.5 hover:bg-brand-500"
              >
                Register your school <ArrowRight className="h-5 w-5" />
              </Link>
              <DemoLoginButton />
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
