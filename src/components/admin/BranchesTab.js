"use client";

import { useState, useEffect } from "react";
import { Building2, Plus, Users, Wallet, TrendingUp } from "lucide-react";

/**
 * Multi-branch management dashboard.
 * Shows cross-branch metrics comparison for school chains.
 */
export default function BranchesTab({ session }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadBranches();
  }, []);

  async function loadBranches() {
    setLoading(true);
    try {
      // In demo mode, return sample branches
      const res = await fetch("/api/school");
      const data = await res.json();
      // For now, show a single branch (main campus) since multi-branch isn't fully wired
      setBranches([
        {
          id: "main",
          name: "Main Campus",
          code: "MAIN",
          status: "active",
          students: data.school?.studentCount || 0,
          teachers: data.school?.teacherCount || 0,
          feeCollectionRate: 87,
          averageScore: 72,
        },
      ]);
    } catch {}
    setLoading(false);
  }

  async function handleCreate() {
    if (!form.name) {
      setToast("Branch name is required");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setSaving(true);
    try {
      // Placeholder — would POST to /api/school/branches in production
      setBranches((prev) => [
        ...prev,
        {
          id: `branch-${Date.now()}`,
          name: form.name,
          code: form.code || form.name.slice(0, 4).toUpperCase(),
          status: "active",
          students: 0,
          teachers: 0,
          feeCollectionRate: 0,
          averageScore: 0,
        },
      ]);
      setToast("Branch created");
      setCreateOpen(false);
      setForm({ name: "", code: "", address: "", phone: "" });
    } catch {}
    setSaving(false);
    setTimeout(() => setToast(""), 3000);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-navy-400">Loading branches...</div>;
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{toast}</div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy-800">Branches</h2>
          <p className="text-sm text-navy-400">Manage multi-branch operations and compare performance across campuses.</p>
        </div>
        <button
          onClick={() => setCreateOpen(!createOpen)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
        >
          <Plus className="h-4 w-4" /> Add Branch
        </button>
      </div>

      {createOpen && (
        <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-navy-800">Add New Branch</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="Branch name" />
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="Short code (e.g. BRB)" />
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="Address" />
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500" placeholder="Phone" />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleCreate} disabled={saving} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50">
              {saving ? "Creating..." : "Create Branch"}
            </button>
            <button onClick={() => setCreateOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-navy-500 hover:text-navy-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Branch cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((b) => (
          <div key={b.id} className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
                <Building2 className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-navy-800">{b.name}</h3>
                <p className="text-xs text-navy-400">{b.code}</p>
              </div>
              <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                {b.status}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-navy-50 p-3 text-center">
                <Users className="mx-auto h-4 w-4 text-navy-400" />
                <p className="mt-1 text-lg font-bold text-navy-800">{b.students}</p>
                <p className="text-[10px] text-navy-400">Students</p>
              </div>
              <div className="rounded-xl bg-navy-50 p-3 text-center">
                <Users className="mx-auto h-4 w-4 text-navy-400" />
                <p className="mt-1 text-lg font-bold text-navy-800">{b.teachers}</p>
                <p className="text-[10px] text-navy-400">Teachers</p>
              </div>
              <div className="rounded-xl bg-navy-50 p-3 text-center">
                <Wallet className="mx-auto h-4 w-4 text-navy-400" />
                <p className="mt-1 text-lg font-bold text-navy-800">{b.feeCollectionRate}%</p>
                <p className="text-[10px] text-navy-400">Fee Collection</p>
              </div>
              <div className="rounded-xl bg-navy-50 p-3 text-center">
                <TrendingUp className="mx-auto h-4 w-4 text-navy-400" />
                <p className="mt-1 text-lg font-bold text-navy-800">{b.averageScore}%</p>
                <p className="text-[10px] text-navy-400">Avg Score</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Cross-branch comparison */}
      {branches.length > 1 && (
        <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-navy-800">Cross-Branch Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-200 text-left text-xs font-semibold uppercase text-navy-500">
                  <th className="pb-3 pr-4">Branch</th>
                  <th className="pb-3 text-center">Students</th>
                  <th className="pb-3 text-center">Fee Collection</th>
                  <th className="pb-3 text-center">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id} className="border-b border-navy-100">
                    <td className="py-3 pr-4 font-semibold text-navy-800">{b.name}</td>
                    <td className="py-3 text-center text-navy-600">{b.students}</td>
                    <td className="py-3 text-center">
                      <span className={`font-bold ${b.feeCollectionRate >= 80 ? "text-emerald-600" : b.feeCollectionRate >= 50 ? "text-amber-600" : "text-red-500"}`}>
                        {b.feeCollectionRate}%
                      </span>
                    </td>
                    <td className="py-3 text-center font-bold text-navy-800">{b.averageScore}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
