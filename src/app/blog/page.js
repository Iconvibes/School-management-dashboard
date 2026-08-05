import Link from "next/link";
import {
  Newspaper,
  ArrowRight,
  Sparkles,
  CalendarDays,
  BookOpen,
  Mail,
} from "lucide-react";
import SiteNav from "@/components/marketing/SiteNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import Reveal from "@/components/marketing/Reveal";
import TiltCard from "@/components/marketing/TiltCard";
import Parallax from "@/components/marketing/Parallax";
import BlogGrid from "@/components/marketing/BlogGrid";
import NewsletterForm from "@/components/marketing/NewsletterForm";
import { posts } from "@/lib/blog-posts";

const FEATURED = posts[0];
const GRID_POSTS = posts.slice(1);

export default function BlogPage() {
  return (
    <main className="flex-1 overflow-x-clip bg-navy-950">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <Parallax speed={0.2} className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-[400px] w-[680px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[140px]" />
        </Parallax>
        <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-20 text-center lg:pt-28">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-300">
              <Newspaper className="h-3.5 w-3.5" /> The Edutrack Blog
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Ideas for{" "}
              <span className="animate-gradient-text bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
                modern schools
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-navy-300">
              Practical playbooks for school leaders, bursars and teachers —
              exams, report cards, fees, attendance and the parent experience.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Featured post */}
      <section className="bg-navy-950 pb-16">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal variant="scale">
            <TiltCard maxTilt={5}>
              <Link
                href={`/blog/${FEATURED.slug}`}
                className="group relative block overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-navy-800 to-brand-900 p-8 shadow-2xl sm:p-12"
              >
                <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
                <div className="relative grid items-center gap-8 lg:grid-cols-5">
                  <div className="lg:col-span-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                        <Sparkles className="h-3 w-3" /> Featured
                      </span>
                      <span className="text-xs text-navy-300">
                        {FEATURED.categoryLabel} · {FEATURED.readTime}
                      </span>
                    </div>
                    <h2 className="mt-4 text-2xl font-extrabold leading-tight text-white sm:text-4xl">
                      {FEATURED.title}
                    </h2>
                    <p className="mt-4 max-w-xl text-navy-300">{FEATURED.excerpt}</p>
                    <div className="mt-6 flex items-center gap-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
                        {FEATURED.author.initials}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">{FEATURED.author.name}</p>
                        <p className="text-xs text-navy-400">
                          {FEATURED.author.role} · {FEATURED.date}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <div className="flex h-full flex-col items-start justify-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur">
                      <BookOpen className="h-7 w-7 text-brand-400" />
                      <p className="text-sm leading-6 text-navy-200">
                        New guides every week for school leaders across Nigeria.
                        Read the latest, then explore the platform behind the ideas.
                      </p>
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-300 transition group-hover:text-brand-200">
                        Read the article
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      {/* Grid */}
      <section className="bg-navy-50 py-16">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="text-center">
            <CalendarDays className="mx-auto h-7 w-7 text-brand-600" />
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-800">
              All articles
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-navy-500">
              Filter by topic to find the playbook you need.
            </p>
          </Reveal>
          <BlogGrid posts={GRID_POSTS} />
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="bg-navy-950 py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <Reveal variant="scale">
            <Mail className="mx-auto h-9 w-9 text-brand-400" />
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              The monthly school playbook
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-navy-300">
              One email a month: a practical idea for your school, a fee or
              exam tip, and the latest from the Edutrack team. No spam.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <NewsletterForm />
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
