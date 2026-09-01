"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Search,
  ArrowRight,
  Users,
  GraduationCap,
  Filter,
  Trash2,
  RotateCcw,
  CheckSquare,
  Square,
} from "lucide-react";

/**
 * Tenant Directory — dark control-center design.
 * Unique from school dashboards.
 */
export default function SchoolsPage() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/platform/overview");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (!cancelled) setSchools(data.schools || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = schools.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || s.status === filter;
    return matchesSearch && matchesFilter;
  });
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const filteredIds = filtered.map((s) => s.id);
    setSelectedIds((prev) => {
      const allSelected = filteredIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(filteredIds);
    });
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    const count = ids.length;
    if (!window.confirm(`Delete ${count} school(s)? They will be recoverable for 30 days.`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/platform/schools/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolIds: ids }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Bulk delete failed");
      }
      const result = await res.json();
      setSchools((prev) => prev.filter((s) => !ids.includes(s.id)));
      setSelectedIds(new Set());
      if (result.skipped.length > 0) {
        alert(`Deleted ${result.deleted} school(s). ${result.skipped.length} were skipped.`);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setBulkDeleting(false);
    }
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));
  const someSelected = selectedIds.size > 0;



  async function handleQuickDelete(schoolId, schoolName, e) {
    e.preventDefault(); // prevent card navigation
    e.stopPropagation();
    if (!window.confirm(`Delete "${schoolName}"? This will mark it for deletion (recoverable for 30 days).`)) return;
    try {
      const res = await fetch(`/api/platform/schools/${schoolId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "soft" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete school");
      }
      setSchools((prev) => prev.filter((s) => s.id !== schoolId));
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRestore(schoolId, schoolName, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Restore "${schoolName}"? All logins will resume immediately.`)) return;
    try {
      const res = await fetch(`/api/platform/schools/${schoolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to restore school");
      }
      setSchools((prev) => prev.map((s) => s.id === schoolId ? { ...s, status: "active" } : s));
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenant Management</h1>
          <p className="mt-1 text-sm text-gray-400">{schools.length} registered tenants</p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            {allFilteredSelected ? (
              <CheckSquare className="h-4 w-4 text-cyan-400" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {allFilteredSelected ? "Deselect All" : "Select All"}
          </button>
        )}
      </div>

      {/* Filters — Dark pill design */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenants..."
            className="w-full rounded-xl border border-white/10 bg-[#12161f] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
          />
        </div>
        <div className="flex gap-1 rounded-xl bg-[#12161f] p-1">
          {["all", "active", "frozen", "deleted"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "bg-cyan-500/10 text-cyan-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Schools Grid — Unique card design */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-[#0f1219] py-20 text-center">
          <Building2 className="mx-auto h-12 w-12 text-gray-600" />
          <p className="mt-4 text-sm text-gray-400">No tenants found</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((school) => (
            <Link
              key={school.id}
              href={`/platform/schools/${school.id}`}
              className="group relative overflow-hidden rounded-xl border border-white/5 bg-[#0f1219] p-5 transition-all hover:border-white/10 hover:bg-[#12161f]"
            >
              {/* Top accent line */}
              <div
                className="absolute left-0 top-0 h-0.5 w-full opacity-50 transition-opacity group-hover:opacity-100"
                style={{ background: `linear-gradient(to right, ${school.brandColor || "#2563EB"}, transparent)` }}
              />

              {/* Selection checkbox */}
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(school.id); }}
                className="absolute left-3 top-3 z-10 rounded-md p-0.5 transition hover:bg-white/10"
              >
                {selectedIds.has(school.id) ? (
                  <CheckSquare className="h-4 w-4 text-cyan-400" />
                ) : (
                  <Square className="h-4 w-4 text-gray-600" />
                )}
              </button>

              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                  style={{ backgroundColor: school.brandColor || "#2563EB" }}
                >
                  {school.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-white">{school.name}</h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        school.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : school.status === "frozen"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {school.status?.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {school.currentSession} · {school.currentTerm}
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  { label: "STUDENTS", value: school.studentCount || 0, icon: GraduationCap },
                  { label: "TEACHERS", value: school.teacherCount || 0, icon: Users },
                  { label: "PARENTS", value: school.parentCount || 0, icon: Users },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-white/[0.03] p-2.5 text-center">
                    <p className="text-lg font-bold text-white">{stat.value}</p>
                    <p className="text-[9px] font-bold tracking-wider text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[10px] text-gray-600">
                  Created {new Date(school.createdAt).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  {school.status === "deleted" ? (
                    <button
                      onClick={(e) => handleRestore(school.id, school.name, e)}
                      className="rounded-md p-1.5 text-gray-600 transition hover:bg-emerald-500/10 hover:text-emerald-400 opacity-0 group-hover:opacity-100"
                      title="Restore school"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => handleQuickDelete(school.id, school.name, e)}
                      className="rounded-md p-1.5 text-gray-600 transition hover:bg-red-500/10 hover:text-red-400 opacity-0 group-hover:opacity-100"
                      title="Delete school"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <ArrowRight className="h-4 w-4 text-gray-600 transition group-hover:text-cyan-400" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {/* Bulk Action Bar */}
      {someSelected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-2xl border border-white/10 bg-[#111827] px-6 py-4 shadow-2xl">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">{selectedIds.size} selected</span>
          </div>
          <div className="h-6 w-px bg-white/10" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-400 transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            {bulkDeleting ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {bulkDeleting ? "Deleting..." : `Delete ${selectedIds.size} School${selectedIds.size > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
