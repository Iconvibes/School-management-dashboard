import Link from "next/link";
import {
  Mail,
  Phone,
  MapPin,
  Globe,
  MessageCircle,
  CalendarDays,
  Headset,
  Sparkles,
  ArrowRight,
  Check,
} from "lucide-react";
import SiteNav from "@/components/marketing/SiteNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import Reveal from "@/components/marketing/Reveal";
import TiltCard from "@/components/marketing/TiltCard";
import Parallax from "@/components/marketing/Parallax";
import DemoLoginButton from "@/components/DemoLoginButton";
import DemoRequestForm from "@/components/marketing/DemoRequestForm";

const channels = [
  {
    icon: CalendarDays,
    title: "Book a live demo",
    desc: "A 20-minute walkthrough with a real school's data — report cards, attendance, fees and the parent portal.",
    action: "Use the form below",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp",
    desc: "Talk to Ferdinard during school hours. Fastest for quick questions about onboarding or pricing.",
    action: "+234 913 736 0986",
  },
  {
    icon: Headset,
    title: "Support portal",
    desc: "Existing schools get priority support, onboarding help and migration assistance from your old files.",
    action: "ferdinardoluwajuwonlo@gmail.com",
  },
];

const faqs = [
  {
    q: "How long does onboarding take?",
    a: "Most schools are fully set up in a single afternoon — register, add classes and teachers, enroll students, and you're grading the same week.",
  },
  {
    q: "Can you help us migrate from Excel or another system?",
    a: "Yes. On Standard and Enterprise plans we import your existing student lists, scores and fee records, and we'll help you do it cleanly.",
  },
  {
    q: "Do you train our teachers?",
    a: "Every plan includes onboarding guides; Enterprise includes dedicated training sessions for your whole staff.",
  },
];

export default function ContactPage() {
  return (
    <main className="flex-1 overflow-x-clip bg-navy-950">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <Parallax speed={0.2} className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-100 w-170 -translate-x-1/2 rounded-full bg-brand-600/20 blur-[140px]" />
        </Parallax>
        <div className="relative mx-auto max-w-4xl px-5 pb-14 pt-20 text-center lg:pt-28">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-300">
              <Sparkles className="h-3.5 w-3.5" /> Let&apos;s talk
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Book a demo,{" "}
              <span className="animate-gradient-text bg-linear-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
                ask a question
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-navy-300">
              Tell us about your school and we&apos;ll show you exactly how
              Edutrack fits — your classes, your term calendar, your fees.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Channels */}
      <section className="bg-navy-950 pb-16">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid gap-5 md:grid-cols-3">
            {channels.map((c, i) => (
              <Reveal key={c.title} delay={i * 90}>
                <TiltCard maxTilt={8} className="h-full">
                  <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur transition-colors hover:border-brand-400/30">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
                      <c.icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 font-bold text-white">{c.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-navy-300">{c.desc}</p>
                    <p className="mt-3 text-sm font-semibold text-brand-300">{c.action}</p>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Form + details */}
      <section className="bg-navy-50 py-16">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid gap-10 lg:grid-cols-5">
            {/* Form */}
            <Reveal variant="left" className="lg:col-span-3">
              <div className="rounded-2xl border border-navy-200/70 bg-white p-8 shadow-sm">
                <h2 className="text-2xl font-extrabold tracking-tight text-navy-800">
                  Request a demo
                </h2>
                <p className="mt-1.5 text-sm text-navy-400">
                  We reply within one school day.
                </p>
                <DemoRequestForm />
              </div>
            </Reveal>

            {/* Side details */}
            <div className="space-y-5 lg:col-span-2">
              <Reveal variant="right" delay={100}>
                <div className="rounded-2xl bg-navy-900 p-7 text-white">
                  <h3 className="text-lg font-bold">Prefer to explore first?</h3>
                  <p className="mt-2 text-sm leading-6 text-navy-300">
                    Jump into the live demo school and click through every portal
                    before you even talk to us.
                  </p>
                  <div className="mt-5">
                    <DemoLoginButton className="w-full justify-center" />
                  </div>
                </div>
              </Reveal>
              <Reveal variant="right" delay={180}>
                <div className="rounded-2xl border border-navy-200/70 bg-white p-7">
                  <h3 className="text-lg font-bold text-navy-800">Direct contact</h3>
                  <ul className="mt-4 space-y-3 text-sm text-navy-500">
                    <li className="flex items-center gap-2.5">
                      <Mail className="h-4 w-4 shrink-0 text-brand-600" />
                      ferdinardoluwajuwonlo@gmail.com
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Phone className="h-4 w-4 shrink-0 text-brand-600" />
                      +234 913 736 0986
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Globe className="h-4 w-4 shrink-0 text-brand-600" />
                      ferdinardashonibare.com
                    </li>
                    <li className="flex items-center gap-2.5">
                      <MapPin className="h-4 w-4 shrink-0 text-brand-600" />
                      Lagos, Nigeria
                    </li>
                  </ul>
                </div>
              </Reveal>
              <Reveal variant="right" delay={260}>
                <div className="rounded-2xl border border-navy-200/70 bg-white p-7">
                  <h3 className="text-lg font-bold text-navy-800">Before you ask</h3>
                  <ul className="mt-4 space-y-3">
                    {faqs.map((f) => (
                      <li key={f.q} className="rounded-xl bg-navy-50/60 p-4">
                        <p className="flex items-start gap-2 font-semibold text-navy-700">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          {f.q}
                        </p>
                        <p className="mt-1.5 pl-6 text-sm leading-6 text-navy-500">{f.a}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy-950 py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <Reveal variant="scale">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Not sure where to start?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-navy-300">
              Register your school free and run a full pilot term — no card
              required, no obligation.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <Link
              href="/register"
              className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-xl shadow-brand-600/40 transition hover:-translate-y-0.5 hover:bg-brand-500"
            >
              Register your school free
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
