import Link from "next/link";
import {
  Check,
  Sparkles,
  ArrowRight,
  School,
  GraduationCap,
  Building2,
  Layers,
  BadgeCheck,
} from "lucide-react";
import SiteNav from "@/components/marketing/SiteNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import Reveal from "@/components/marketing/Reveal";
import TiltCard from "@/components/marketing/TiltCard";
import Parallax from "@/components/marketing/Parallax";
import DemoLoginButton from "@/components/DemoLoginButton";

const plans = [
  {
    name: "Starter",
    icon: GraduationCap,
    tagline: "For small schools getting digital",
    price: "₦1,000",
    per: "per student / year",
    features: [
      "Up to 150 students",
      "Grading matrix & automated report cards",
      "Attendance register",
      "Fee tracking & receipts",
      "Teacher & student portals",
      "Email support",
    ],
    cta: "Start free pilot",
    featured: false,
  },
  {
    name: "Standard",
    icon: Building2,
    tagline: "For growing private schools",
    price: "₦2,500",
    per: "per student / year",
    features: [
      "Up to 500 students",
      "Everything in Starter",
      "Multiple class arms & sessions",
      "Fee structures + defaulter tracking",
      "Report card PDF export & printing",
      "WhatsApp priority support",
    ],
    cta: "Book a demo",
    featured: true,
  },
  {
    name: "Enterprise",
    icon: Layers,
    tagline: "For academies & school groups",
    price: "Custom",
    per: "tailored to your school",
    features: [
      "Unlimited students",
      "Everything in Standard",
      "Multiple branches / campuses",
      "Bulk CSV import & migration help",
      "Dedicated onboarding & training",
      "Custom branding & SLA support",
    ],
    cta: "Talk to us",
    featured: false,
  },
];

const faqs = [
  {
    q: "Can I try Edutrack before paying?",
    a: "Yes — every school gets a free pilot. Explore the live demo on this page or register your school and onboard a class to see it for real.",
  },
  {
    q: "How does pricing work?",
    a: "You pay per student per year, so cost scales with your enrolment — never a surprise flat fee. Fees are charged per term or annually on your preferred plan.",
  },
  {
    q: "Who owns the data?",
    a: "Your school owns its data entirely. You can export or delete it at any time, and we back up daily.",
  },
  {
    q: "Do parents need the app?",
    a: "No. Parents get a simple portal link — it works in any browser on any phone, and your school can print or send PDF report cards directly.",
  },
];

export default function PricingPage() {
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
              <Sparkles className="h-3.5 w-3.5" /> Simple, per-student pricing
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Pricing that scales with{" "}
              <span className="animate-gradient-text bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
                your school
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-navy-300">
              No setup fees, no hidden costs. Pay per enrolled student per year,
              and switch plans whenever your school grows.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Plans */}
      <section className="bg-navy-50 py-16">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((p, i) => (
              <Reveal key={p.name} delay={i * 100}>
                <TiltCard maxTilt={6} className="h-full">
                  <div
                    className={`relative flex h-full flex-col rounded-2xl border bg-white p-8 shadow-sm transition-shadow ${
                      p.featured
                        ? "border-brand-300 shadow-xl shadow-brand-600/10"
                        : "border-navy-200/70 hover:shadow-lg"
                    }`}
                  >
                    {p.featured && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-lg">
                        Most popular
                      </span>
                    )}
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          p.featured
                            ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                            : "bg-navy-100 text-navy-600"
                        }`}
                      >
                        <p.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-navy-800">{p.name}</h3>
                        <p className="text-sm text-navy-400">{p.tagline}</p>
                      </div>
                    </div>
                    <p className="mt-5">
                      <span className="text-4xl font-extrabold text-navy-800">{p.price}</span>
                      <span className="ml-2 text-sm text-navy-400">{p.per}</span>
                    </p>
                    <ul className="mt-6 flex-1 space-y-3">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm text-navy-600">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/register"
                      className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
                        p.featured
                          ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30 hover:bg-brand-500"
                          : "bg-navy-800 text-white hover:bg-navy-700"
                      }`}
                    >
                      {p.cta} <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>

          <Reveal delay={150}>
            <div className="mx-auto mt-12 max-w-3xl rounded-2xl bg-navy-900 p-8 text-center text-white">
              <School className="mx-auto h-8 w-8 text-brand-400" />
              <h3 className="mt-4 text-xl font-bold">Free pilot for your first term</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-navy-300">
                Register your school today and run a full term free. Only pay when
                you decide to stay — no card required.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-xl shadow-brand-600/40 transition hover:bg-brand-500"
                >
                  Register your school <ArrowRight className="h-5 w-5" />
                </Link>
                <DemoLoginButton />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal className="text-center">
            <BadgeCheck className="mx-auto h-8 w-8 text-brand-600" />
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-800">
              Common questions
            </h2>
          </Reveal>
          <div className="mt-8 space-y-4">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <div className="rounded-2xl border border-navy-200/70 bg-navy-50/50 p-6 transition hover:border-brand-200">
                  <h3 className="font-bold text-navy-800">{f.q}</h3>
                  <p className="mt-2 text-sm leading-6 text-navy-500">{f.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
