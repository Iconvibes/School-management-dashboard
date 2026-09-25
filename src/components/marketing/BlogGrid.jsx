"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Wallet,
  ClipboardList,
  CalendarCheck,
  HeartHandshake,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import Reveal from "@/components/marketing/Reveal";
import TiltCard from "@/components/marketing/TiltCard";
import { categories } from "@/lib/blog-posts";

const CATEGORY_META = {
  "report-cards": { label: "Report Cards", color: "#2563eb", icon: FileText },
  fees: { label: "Fees & Finance", color: "#ea580c", icon: Wallet },
  exams: { label: "Exams & Grading", color: "#059669", icon: ClipboardList },
  attendance: { label: "Attendance", color: "#d97706", icon: CalendarCheck },
  parents: { label: "Parent Engagement", color: "#0d9488", icon: HeartHandshake },
  "getting-started": { label: "Getting Started", color: "#7c3aed", icon: BookOpen },
};

// Filters come from the shared data module so the blog index and the
// grid can never drift apart.
const FILTERS = categories;

/**
 * Client-side filterable blog grid. Receives plain post metadata only
 * (no components), so it is safe to pass from a server component.
 */
export default function BlogGrid({ posts }) {
  const [active, setActive] = useState("all");
  const visible = active === "all" ? posts : posts.filter((p) => p.category === active);

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {FILTERS.map((f) => {
          const isActive = active === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setActive(f.id)}
              aria-pressed={isActive}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-navy-800 text-white shadow-lg shadow-navy-800/20"
                  : "border border-navy-200/70 bg-white text-navy-500 hover:border-brand-300 hover:text-navy-800"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p, i) => {
          const meta = CATEGORY_META[p.category] || CATEGORY_META["report-cards"];
          const Icon = meta.icon;
          return (
            <Reveal key={p.slug} delay={(i % 3) * 80}>
              <TiltCard maxTilt={8} className="h-full">
                <Link
                  href={`/blog/${p.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm transition-shadow hover:shadow-xl hover:shadow-brand-600/10"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white"
                      style={{ background: meta.color }}
                    >
                      <Icon className="h-3 w-3" /> {p.categoryLabel}
                    </span>
                    <span className="text-xs text-navy-400">{p.readTime}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold leading-snug text-navy-800 transition-colors group-hover:text-brand-600">
                    {p.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-navy-500">{p.excerpt}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-navy-100 pt-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}99)` }}
                      >
                        {p.author.initials}
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-navy-700">{p.author.name}</p>
                        <p className="text-[11px] text-navy-400">{p.date}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-navy-300 transition-transform group-hover:translate-x-1 group-hover:text-brand-600" />
                  </div>
                </Link>
              </TiltCard>
            </Reveal>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-navy-200 bg-white/60 p-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-navy-300" />
          <p className="mt-3 text-sm text-navy-500">
            No posts in this category yet — check back soon.
          </p>
        </div>
      )}
    </div>
  );
}
