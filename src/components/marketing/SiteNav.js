"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowRight, ChevronDown } from "lucide-react";
import { useCallback } from "react";
import Logo from "@/components/Logo";
import DemoLoginButton from "@/components/DemoLoginButton";

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/solutions", label: "Solutions" },
  { href: "/blog", label: "Blog" },
  { href: "/pricing", label: "Pricing" },
  { href: "/download", label: "Download" },
  { href: "/trust", label: "Trust" },
  { href: "/contact", label: "Contact" },
];

/**
 * Shared marketing-site navigation. Sticky, translucent, with a mobile
 * menu. "Products" items are the module pages; auth actions on the right.
 */
export default function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Close the mobile menu when the route changes — the React-recommended
  // "adjust state during render" pattern instead of an effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu with the Escape key.
  const onKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") setOpen(false);
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onKeyDown]);

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-navy-950/85 shadow-lg shadow-navy-950/40 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Link href="/" aria-label="Edutrack home" className="transition-opacity hover:opacity-80">
          <Logo light />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-navy-200 hover:bg-white/5 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <div className="group relative ml-2">
            <button
              aria-haspopup="true"
              aria-expanded="false"
              className="flex items-center gap-1 rounded-lg px-3.5 py-2 text-sm font-medium text-navy-200 transition hover:bg-white/5 hover:text-white"
            >
              Product <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <div className="invisible absolute right-0 top-full w-64 translate-y-2 rounded-2xl border border-white/10 bg-navy-900/95 p-2 opacity-0 shadow-2xl backdrop-blur-xl transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
              {[
                { href: "/features#report-cards", label: "Report Cards" },
                { href: "/features#grading", label: "Grading Matrix" },
                { href: "/features#attendance", label: "Attendance" },
                { href: "/features#fees", label: "Fee Management" },
                { href: "/features#payroll", label: "Payroll" },
                { href: "/features#parents", label: "Parent Portal" },
              ].map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm text-navy-200 transition hover:bg-white/10 hover:text-white"
                >
                  {i.label}
                  <ArrowRight className="h-3.5 w-3.5 text-navy-400" />
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 lg:flex">
          <DemoLoginButton className="!px-4 !py-2" />
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-navy-100 transition hover:bg-white/10"
          >
            School Login
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
          >
            Register School <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-navy-200 transition hover:bg-white/10 lg:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div id="mobile-menu" className="border-t border-white/10 bg-navy-950/95 backdrop-blur-xl lg:hidden">
          <nav className="mx-auto max-w-7xl space-y-1 px-5 py-4">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  pathname === l.href
                    ? "bg-white/10 text-white"
                    : "text-navy-200 hover:bg-white/5 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <div className="pt-2">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-navy-400">
                Product modules
              </p>
              {[
                { href: "/features#report-cards", label: "Report Cards" },
                { href: "/features#grading", label: "Grading Matrix" },
                { href: "/features#attendance", label: "Attendance" },
                { href: "/features#fees", label: "Fee Management" },
                { href: "/features#payroll", label: "Payroll" },
                { href: "/features#parents", label: "Parent Portal" },
              ].map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-navy-200 transition hover:bg-white/5 hover:text-white"
                >
                  {i.label}
                  <ArrowRight className="h-3.5 w-3.5 text-navy-400" />
                </Link>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-4">
              <Link
                href="/login"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-center text-sm font-semibold text-white"
              >
                School Login
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-brand-600/30"
              >
                Register School
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
