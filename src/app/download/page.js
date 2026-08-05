import Link from "next/link";
import {
  Smartphone,
  Monitor,
  Apple,
  Globe,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Zap,
  LayoutGrid,
  HelpCircle,
  ChevronRight,
} from "lucide-react";
import SiteNav from "@/components/marketing/SiteNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import Reveal from "@/components/marketing/Reveal";
import TiltCard from "@/components/marketing/TiltCard";
import Parallax from "@/components/marketing/Parallax";
import InstallPwaButton from "@/components/InstallPwaButton";

export const metadata = {
  title: "Download & Install the App — Edutrack",
  description:
    "Install Edutrack on Android phones and Windows PCs like a native app — or keep using the website. Same data, same experience, no app store required.",
};

const platforms = [
  {
    icon: Smartphone,
    name: "Android",
    device: "Phone or tablet",
    steps: [
      "Open this site in the Chrome browser (or any Chromium browser like Opera, Brave or Edge).",
      "Tap the ⋮ menu (top-right corner), then choose Install app — or tap the small install icon that appears in the address bar.",
      "Confirm when prompted. Edutrack is added to your home screen with its own app icon.",
    ],
    tip: "Opens fullscreen like a native app. Teachers can mark attendance and parents can pay fees even on a slow connection.",
  },
  {
    icon: Monitor,
    name: "Windows PC",
    device: "Desktop or laptop",
    steps: [
      "Open this site in Microsoft Edge or Google Chrome.",
      "Click the install icon in the address bar (or the ⋮ menu → Apps → Install this site as an app).",
      "Click Install. Edutrack is added to your Start menu, taskbar and desktop as its own app window.",
    ],
    tip: "Runs in its own resizable window with no browser tabs. Ideal for bursars and admins who work in Edutrack all day.",
  },
  {
    icon: Apple,
    name: "iPhone & iPad",
    device: "iOS",
    steps: [
      "Open this site in Safari.",
      "Tap the Share button (the square with an up arrow), then scroll down and tap Add to Home Screen.",
      "Tap Add. An Edutrack icon appears on your home screen, ready to open.",
    ],
    tip: "iOS opens it in a dedicated fullscreen window. Note: Apple limits some web-app features, so the website works just as well here.",
  },
];

const perks = [
  {
    icon: LayoutGrid,
    title: "App icon, fullscreen window",
    desc: "Sits on your home screen or desktop like any other app — no browser address bar.",
  },
  {
    icon: Zap,
    title: "Faster to open",
    desc: "Launch straight into your school portal with one tap instead of typing a URL.",
  },
  {
    icon: RefreshCw,
    title: "Always up to date",
    desc: "The app updates itself automatically. No app store, no downloads, no reinstall.",
  },
  {
    icon: ShieldCheck,
    title: "Same login, same data",
    desc: "It is the same Edutrack account — school data, report cards and fees are identical on app and web.",
  },
];

const faqs = [
  {
    q: "Is this a Play Store / Microsoft Store app?",
    a: "Not yet. Edutrack installs as a Progressive Web App (PWA), which behaves like a native app on Android and Windows — your own icon, fullscreen window and offline shell — but needs no app store and updates itself. Native store listings can be published later without changing how the product works.",
  },
  {
    q: "Do teachers and parents have to install anything?",
    a: "No. Everyone can use Edutrack from any browser on any device. Installing the app is completely optional — teachers, students and parents get the exact same experience on the website.",
  },
  {
    q: "Will installing the app change or risk my data?",
    a: "Never. The app and the website are the same platform with the same database — installing only adds a shortcut-like launcher to your device.",
  },
  {
    q: "How do updates work?",
    a: "Automatically. Every time you open the app it checks for the latest version in the background, so your school is always on the current release with no action needed.",
  },
];

export default function DownloadPage() {
  return (
    <main className="flex-1 overflow-x-clip bg-navy-950">
      <SiteNav />

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
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

        <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-20 lg:pt-28">
          <Reveal className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-300">
              <Sparkles className="h-3.5 w-3.5" />
              Download &amp; install the app
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl">
              Edutrack, as an app on{" "}
              <span className="animate-gradient-text bg-gradient-to-r from-brand-400 via-brand-300 to-violet-400 bg-clip-text text-transparent">
                any device
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-navy-300">
              Install Edutrack on your Android phone or Windows PC like a native app —
              or keep using the website. Same data, same login, same everything.
            </p>
          </Reveal>

          <Reveal delay={140} className="mt-10 text-center">
            <div className="inline-flex flex-col items-center gap-3">
              <InstallPwaButton className="px-8 py-4 text-base shadow-2xl" />
              <p className="text-sm text-navy-400">
                <span className="font-semibold text-navy-200">One tap</span> if your
                browser supports it — or follow the steps for your device below.
              </p>
            </div>
          </Reveal>

          <Reveal delay={220}>
            <div className="mx-auto mt-10 flex max-w-lg flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-navy-400">
              <span className="flex items-center gap-1.5">
                <Smartphone className="h-4 w-4 text-emerald-400" /> Android
              </span>
              <span className="flex items-center gap-1.5">
                <Monitor className="h-4 w-4 text-emerald-400" /> Windows
              </span>
              <span className="flex items-center gap-1.5">
                <Apple className="h-4 w-4 text-emerald-400" /> iPhone &amp; iPad
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-emerald-400" /> or just use the website
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ PLATFORM STEPS ============ */}
      <section className="bg-navy-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Step by step
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-800 sm:text-5xl">
              Install on your device in under a minute
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {platforms.map((p, i) => (
              <Reveal key={p.name} delay={i * 90}>
                <TiltCard maxTilt={6} className="h-full">
                  <div className="flex h-full flex-col rounded-2xl border border-navy-200/70 bg-white p-7 shadow-sm transition hover:shadow-xl hover:shadow-brand-600/10">
                    <div className="flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
                        <p.icon className="h-6 w-6" />
                      </div>
                      <span className="rounded-full bg-navy-100 px-3 py-1 text-xs font-semibold text-navy-500">
                        {p.device}
                      </span>
                    </div>
                    <h3 className="mt-5 text-xl font-bold text-navy-800">{p.name}</h3>
                    <ol className="mt-4 space-y-3">
                      {p.steps.map((s, j) => (
                        <li key={j} className="flex gap-3 text-sm leading-6 text-navy-500">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-xs font-bold text-brand-600">
                            {j + 1}
                          </span>
                          {s}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-700 ring-1 ring-emerald-600/10">
                      <span className="font-semibold">Tip:</span> {p.tip}
                    </p>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ WHAT YOU GET ============ */}
      <section className="relative overflow-hidden bg-white py-20 lg:py-28">
        <Parallax speed={0.15} className="pointer-events-none absolute right-0 top-1/3">
          <div className="h-72 w-72 rounded-full bg-brand-200/40 blur-[100px]" />
        </Parallax>
        <div className="relative mx-auto max-w-7xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              App or website — your choice
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-800 sm:text-5xl">
              Everything the app gives you
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {perks.map((perk, i) => (
              <Reveal key={perk.title} delay={(i % 4) * 70}>
                <TiltCard maxTilt={7} className="h-full">
                  <div className="flex h-full flex-col rounded-2xl border border-navy-200/70 bg-navy-50 p-6 transition hover:border-brand-200 hover:bg-white hover:shadow-xl hover:shadow-brand-600/10">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-800 text-white">
                      <perk.icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-navy-800">{perk.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-navy-500">{perk.desc}</p>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <div className="mx-auto mt-12 flex max-w-3xl items-start gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-6">
              <Globe className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              <p className="text-sm leading-7 text-navy-600">
                <strong className="text-navy-800">Prefer not to install?</strong>{" "}
                That&apos;s perfectly fine — the website does everything the app does. No
                downloads, no storage used, works on any phone, laptop or shared
                computer. Everyone at your school — teachers, students, parents — can use
                it straight from the browser.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="bg-navy-900 py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal className="text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-400">
              Questions
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              About installing Edutrack
            </h2>
          </Reveal>

          <div className="mt-12 space-y-4">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:bg-white/10">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-bold text-white">
                    <span className="flex items-center gap-3">
                      <HelpCircle className="h-5 w-5 shrink-0 text-brand-400" />
                      {f.q}
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-navy-400 transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-4 text-sm leading-7 text-navy-300">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative overflow-hidden bg-navy-950 py-24">
        <Parallax speed={0.25} className="pointer-events-none absolute inset-0">
          <div className="animate-drift absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/25 blur-[120px]" />
        </Parallax>
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <Reveal variant="scale">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              Install it, or just start using it
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-navy-300">
              Either way, your school is up and running in minutes.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <InstallPwaButton />
              <Link
                href="/register"
                className="group inline-flex items-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-xl shadow-brand-600/40 transition hover:-translate-y-0.5 hover:bg-brand-500"
              >
                Register your school
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <p className="mt-5 flex items-center justify-center gap-1.5 text-sm text-navy-400">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Free pilot term · No card required
            </p>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
