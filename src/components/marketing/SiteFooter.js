import Link from "next/link";
import { Mail, Phone, MapPin } from "lucide-react";
import Logo from "@/components/Logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/features#report-cards", label: "Report Cards" },
      { href: "/features#grading", label: "Grading Matrix" },
      { href: "/features#attendance", label: "Attendance" },
      { href: "/features#fees", label: "Fee Management" },
      { href: "/features#parents", label: "Parent Portal" },
      { href: "/download", label: "Download the App" },
    ],
  },
  {
    title: "Portals",
    links: [
      { href: "/solutions", label: "Solutions" },
      { href: "/solutions#admin", label: "For School Admins" },
      { href: "/solutions#teacher", label: "For Teachers" },
      { href: "/solutions#student", label: "For Students" },
      { href: "/solutions#parent", label: "For Parents" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/trust", label: "Trust & Security" },
      { href: "/blog", label: "Blog" },
      { href: "/contact", label: "Contact & Demo" },
      { href: "/register", label: "Register School" },
      { href: "/login", label: "School Login" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-navy-950 py-14">
      <div className="mx-auto max-w-7xl px-5">
        <div className="grid gap-10 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo light />
            <p className="mt-4 max-w-sm text-sm leading-6 text-navy-400">
              The all-in-one cloud school management platform for modern
              schools — report cards, grading matrices, attendance, fees and
              payroll in one multi-tenant system.
            </p>
            <div className="mt-5 space-y-2 text-sm text-navy-400">
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-brand-400" /> ferdinardoluwajuwonlo@gmail.com
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-brand-400" /> +234 913 736 0986
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-brand-400" /> Lagos, Nigeria
              </p>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-widest text-navy-300">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-navy-400 transition hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-sm text-navy-500">
            © {new Date().getFullYear()} Edutrack. Built for modern schools.
          </p>
          <div className="flex items-center gap-5 text-sm text-navy-400">
            <Link href="/privacy" className="transition hover:text-white">Privacy Policy</Link>
            <Link href="/trust" className="transition hover:text-white">Trust & Security</Link>
            <Link href="/contact" className="transition hover:text-white">Support</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
