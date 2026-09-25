"use client";

import { useState, useEffect } from "react";
import { GraduationCap, Plus, Search, TrendingUp, Users } from "lucide-react";

/**
 * Alumni management tab for admin dashboard.
 * Track graduates, their university placements, and career outcomes.
 */
export default function AlumniTab({ session }) {
  const [alumni, setAlumni] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    graduationYear: new Date().getFullYear(),
    classArm: "",
    university: "",
    program: "",
    career: "",
    contactEmail: "",
    contactPhone: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadAlumni();
  }, [yearFilter]);

  async function loadAlumni() {
    setLoading(true);
    try {
      const url = new URL("/api/alumni", window.location.origin);
      if (yearFilter) url.searchParams.set("year", yearFilter);
      if (search) url.searchParams.set("search", search);

      const res = await fetch(url.toString());
      const data = await res.json();
      setAlumni(data.alumni || []);
      setStats(data.stats);
    } catch {}
    setLoading(false);
  }

  async function handleCreate() {
    if (!form.name || !form.graduationYear) {
      setToast("Name and graduation year are required");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/alumni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setToast("Alumni record added");
        setCreateOpen(false);
        setForm({ name: "", graduationYear: new Date().getFullYear(), classArm: "", university: "", program: "", career: "", contactEmail: "", contactPhone: "", notes: "" });
        loadAlumni();
      }
    } catch {}
    setSaving(false);
    setTimeout(() => setToast(""), 3000);
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => currentYear - i);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-navy-400">Loading alumni...</div>;
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{toast}</div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy-800">Alumni Network</h2>
          <p className="text-sm text-navy-400">Track graduates and their outcomes.</p>
        </div>
        <button
          onClick={() => setCreateOpen(!createOpen)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
        >
          <Plus className="h-4 w-4" /> Add Alumni
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm text-center">
            <p className="text-2xl font-bold text-navy-800">{stats.total}</p>
            <p className="text-xs text-navy-400">Total Alumni</p>
          </div>
          <div className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.placementRate}%</p>
            <p className="text-xs text-navy-400">University Placement</p>
          </div>
          <div className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm text-center">
            <p className="text-2xl font-bold text-navy-800">{Object.keys(stats.universities || {}).length}</p>
            <p className="text-xs text-navy-400">Universities</p>
          </div>
          <div className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm text-center">
            <p className="text-2xl font-bold text-navy-800">{Object.keys(stats.byYear || {}).length}</p>
            <p className="text-xs text-navy-400">Graduation Years</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadAlumni()}
            placeholder="Search by name..."
            className="w-full rounded-xl border border-navy-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {createOpen && (
        <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-navy-800">Add Alumni Record</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="Full name" />
            <input type="number" value={form.graduationYear} onChange={(e) => setForm((f) => ({ ...f, graduationYear: Number(e.target.value) }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="Graduation year" />
            <input value={form.university} onChange={(e) => setForm((f) => ({ ...f, university: e.target.value }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="University" />
            <input value={form.program} onChange={(e) => setForm((f) => ({ ...f, program: e.target.value }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="Program / Course" />
            <input value={form.career} onChange={(e) => setForm((f) => ({ ...f, career: e.target.value }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="Career / Current role" />
            <input value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="Contact email" />
            <input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="Contact phone" />
            <input value={form.classArm} onChange={(e) => setForm((f) => ({ ...f, classArm: e.target.value }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="Class arm at graduation" />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleCreate} disabled={saving} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50">
              {saving ? "Saving..." : "Add Record"}
            </button>
            <button onClick={() => setCreateOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-navy-500 hover:text-navy-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {alumni.length === 0 ? (
        <div className="rounded-2xl border border-navy-200/70 bg-white py-12 text-center shadow-sm">
          <GraduationCap className="mx-auto h-10 w-10 text-navy-300" />
          <p className="mt-3 text-sm font-medium text-navy-500">No alumni records yet</p>
          <p className="text-xs text-navy-400">Add graduates to track their university placements and careers.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alumni.map((a) => (
            <div key={a.id} className="flex items-center gap-4 rounded-2xl border border-navy-200/70 bg-white px-6 py-4 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                {a.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-navy-800">{a.name}</p>
                <p className="text-xs text-navy-400">
                  {a.classArm && `${a.classArm} · `}
                  Class of {a.graduationYear}
                  {a.university && ` · ${a.university}`}
                </p>
              </div>
              {a.program && (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{a.program}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
