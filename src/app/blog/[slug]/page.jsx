import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  CalendarDays,
  Lightbulb,
  Quote,
  Newspaper,
  Check,
} from "lucide-react";
import SiteNav from "@/components/marketing/SiteNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import Reveal from "@/components/marketing/Reveal";
import TiltCard from "@/components/marketing/TiltCard";
import Parallax from "@/components/marketing/Parallax";
import { posts, getPost, getRelated } from "@/lib/blog-posts";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

function Block({ block }) {
  switch (block.type) {
    case "lead":
      return (
        <p className="text-lg leading-8 text-navy-700 sm:text-xl sm:leading-9">
          {block.text}
        </p>
      );
    case "h2":
      return (
        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-navy-800">
          {block.text}
        </h2>
      );
    case "p":
      return <p className="mt-5 text-base leading-8 text-navy-600">{block.text}</p>;
    case "ul":
      return (
        <div className="mt-5 rounded-2xl border border-navy-200/70 bg-navy-50/60 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
            {block.text}
          </p>
          <ul className="mt-4 space-y-3">
            {block.items.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-navy-600">
                <span className="mt-1 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check className="h-3 w-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      );
    case "tip":
      return (
        <div className="mt-8 flex gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-lg shadow-amber-500/30">
            <Lightbulb className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-600">
              School tip
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-900">{block.text}</p>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export default async function BlogArticlePage({ params }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const related = getRelated(post);

  return (
    <main className="flex-1 overflow-x-clip bg-navy-950">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <Parallax speed={0.2} className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-[360px] w-[620px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[140px]" />
        </Parallax>
        <div className="relative mx-auto max-w-3xl px-5 pb-14 pt-16 lg:pt-24">
          <Reveal>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm font-medium text-navy-300 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> All articles
            </Link>
          </Reveal>
          <Reveal delay={60}>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                <Newspaper className="h-3 w-3" /> {post.categoryLabel}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-navy-400">
                <CalendarDays className="h-3.5 w-3.5" /> {post.date}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-navy-400">
                <Clock className="h-3.5 w-3.5" /> {post.readTime}
              </span>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
              {post.title}
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-6 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
                {post.author.initials}
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{post.author.name}</p>
                <p className="text-xs text-navy-400">{post.author.role}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Body */}
      <section className="bg-white py-14">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal variant="up">
            <article>
              {post.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </article>
          </Reveal>

          {/* Author box */}
          <div className="mt-12 flex items-start gap-5 rounded-2xl border border-navy-200/70 bg-navy-50/60 p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white shadow-lg shadow-brand-600/30">
              {post.author.initials}
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">
                Written by
              </p>
              <p className="mt-1 font-bold text-navy-800">{post.author.name}</p>
              <p className="mt-0.5 text-sm text-navy-500">{post.author.role}</p>
              <p className="mt-2 text-sm leading-6 text-navy-500">
                {post.author.role} — and a member of the community building
                better-run schools across Nigeria.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-10 rounded-2xl bg-navy-900 p-8 text-center text-white">
            <Quote className="mx-auto h-6 w-6 text-brand-400" />
            <h3 className="mt-3 text-xl font-bold">Want to put this into practice?</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-navy-300">
              Edutrack is the platform behind these playbooks. Explore the live
              demo or register your school and run a full term free.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
              >
                Register your school <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Explore the live demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="bg-navy-50 py-16">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-navy-800">
              Keep reading
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p, i) => (
              <Reveal key={p.slug} delay={i * 80}>
                <TiltCard maxTilt={8} className="h-full">
                  <Link
                    href={`/blog/${p.slug}`}
                    className="group flex h-full flex-col rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm transition-shadow hover:shadow-xl hover:shadow-brand-600/10"
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
                      {p.categoryLabel}
                    </span>
                    <h3 className="mt-2 flex-1 font-bold leading-snug text-navy-800 transition-colors group-hover:text-brand-600">
                      {p.title}
                    </h3>
                    <p className="mt-3 flex items-center gap-2 text-xs text-navy-400">
                      <CalendarDays className="h-3.5 w-3.5" /> {p.date} · {p.readTime}
                    </p>
                  </Link>
                </TiltCard>
              </Reveal>
            ))}
          </div>
          <Reveal delay={120}>
            <div className="mt-10 text-center">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 rounded-xl border border-navy-200/70 bg-white px-6 py-3 text-sm font-semibold text-navy-700 transition hover:border-brand-300 hover:text-brand-600"
              >
                <ArrowLeft className="h-4 w-4" /> Back to all articles
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
