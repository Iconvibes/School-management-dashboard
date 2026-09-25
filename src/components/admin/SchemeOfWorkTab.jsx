"use client";

import { useState, useEffect } from "react";
import { BookOpen, Plus, ChevronDown, ChevronRight, Check, Clock, X, Upload, FileText, Download, ExternalLink } from "lucide-react";

/**
 * Scheme of Work management tab for admin dashboard.
 * Create and manage term-by-term schemes of work per subject/class.
 */
export default function SchemeOfWorkTab({ session }) {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedScheme, setSelectedScheme] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    classArm: "",
    topics: [],
  });
  const [topicForm, setTopicForm] = useState({ week: 1, title: "", objectives: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);

  const subjects = [
    "Mathematics", "English Language", "Civic Education", "Further Mathematics",
    "Physics", "Chemistry", "Biology", "Economics", "Government", "Literature in English",
    "Christian Religious Studies", "Islamic Religious Studies", "History", "Geography",
    "Agricultural Science", "Computer Studies", "Technical Drawing",
  ];

  const arms = session?.school?.activeArms || [];

  useEffect(() => {
    loadSchemes();
  }, []);

  async function loadSchemes() {
    setLoading(true);
    try {
      const res = await fetch("/api/scheme");
      const data = await res.json();
      setSchemes(data.schemes || []);
    } catch {}
    setLoading(false);
  }

  function handlePdfSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setToast("Only PDF files are allowed");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setToast("PDF must be under 10MB");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setPdfFile(file);
    // Read as base64 for storage
    const reader = new FileReader();
    reader.onload = () => setPdfPreview(reader.result);
    reader.readAsDataURL(file);
  }

  function removePdf() {
    setPdfFile(null);
    setPdfPreview(null);
  }

  async function handleCreate() {
    if (!form.subject || !form.classArm || form.topics.length === 0) {
      setToast("Please fill in subject, class, and add at least one topic");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (pdfPreview) {
        payload.fileUrl = pdfPreview;
        payload.fileName = pdfFile.name;
        payload.fileType = pdfFile.type;
        payload.fileSize = pdfFile.size;
      }
      const res = await fetch("/api/scheme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setToast("Scheme of work created");
        setCreateOpen(false);
        setForm({ subject: "", classArm: "", topics: [] });
        setPdfFile(null);
        setPdfPreview(null);
        loadSchemes();
      }
    } catch {}
    setSaving(false);
    setTimeout(() => setToast(""), 3000);
  }

  function addTopic() {
    if (!topicForm.title) return;
    setForm((f) => ({
      ...f,
      topics: [...f.topics, { ...topicForm, objectives: topicForm.objectives.split(",").map((o) => o.trim()).filter(Boolean) }],
    }));
    setTopicForm((t) => ({ ...t, week: t.week + 1, title: "", objectives: "" }));
  }

  function removeTopic(idx) {
    setForm((f) => ({ ...f, topics: f.topics.filter((_, i) => i !== idx) }));
  }

  const grouped = {};
  for (const s of schemes) {
    const key = `${s.classArm} — ${s.subject}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-navy-400">Loading schemes...</div>;
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{toast}</div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy-800">Scheme of Work</h2>
          <p className="text-sm text-navy-400">Plan and track topics across subjects and classes for this term.</p>
        </div>
        <button
          onClick={() => setCreateOpen(!createOpen)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
        >
          <Plus className="h-4 w-4" /> New Scheme
        </button>
      </div>

      {createOpen && (
        <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-navy-800">Create Scheme of Work</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-600">Subject</label>
              <select
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">Select subject</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-600">Class Arm</label>
              <select
                value={form.classArm}
                onChange={(e) => setForm((f) => ({ ...f, classArm: e.target.value }))}
                className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">Select class</option>
                {arms.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-navy-600">Topics</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={topicForm.week}
                onChange={(e) => setTopicForm((t) => ({ ...t, week: Number(e.target.value) }))}
                className="w-20 rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-brand-500"
                placeholder="Week"
              />
              <input
                value={topicForm.title}
                onChange={(e) => setTopicForm((t) => ({ ...t, title: e.target.value }))}
                className="flex-1 rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm text-navy-800 outline-none focus:border-brand-500"
                placeholder="Topic title"
              />
              <input
                value={topicForm.objectives}
                onChange={(e) => setTopicForm((t) => ({ ...t, objectives: e.target.value }))}
                className="flex-1 rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm text-navy-800 outline-none focus:border-brand-500"
                placeholder="Objectives (comma-separated)"
              />
              <button onClick={addTopic} className="rounded-xl bg-navy-100 px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-200">
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {form.topics.length > 0 && (
              <div className="mt-3 space-y-2">
                {form.topics.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-navy-50 px-3 py-2 text-sm">
                    <span className="font-mono text-navy-400">W{t.week}</span>
                    <span className="flex-1 text-navy-700">{t.title}</span>
                    <button onClick={() => removeTopic(i)} className="text-navy-400 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-navy-600">Scheme Document (PDF)</label>
            {pdfPreview ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <FileText className="h-5 w-5 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-emerald-800">{pdfFile?.name}</p>
                  <p className="text-xs text-emerald-600">{pdfFile ? (pdfFile.size / 1024).toFixed(0) + " KB" : ""}</p>
                </div>
                <button onClick={removePdf} className="text-emerald-600 hover:text-red-500 transition">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-navy-200 px-4 py-6 text-center transition hover:border-brand-400 hover:bg-brand-50/50">
                <Upload className="mx-auto h-6 w-6 text-navy-400" />
                <div>
                  <p className="text-sm font-medium text-navy-600">Click to upload a PDF</p>
                  <p className="text-xs text-navy-400">Max 10MB. This will be visible to teachers of this subject.</p>
                </div>
                <input type="file" accept=".pdf" className="hidden" onChange={handlePdfSelect} />
              </label>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create Scheme"}
            </button>
            <button onClick={() => setCreateOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-navy-500 hover:text-navy-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-2xl border border-navy-200/70 bg-white py-12 text-center shadow-sm">
          <BookOpen className="mx-auto h-10 w-10 text-navy-300" />
          <p className="mt-3 text-sm font-medium text-navy-500">No schemes of work yet</p>
          <p className="text-xs text-navy-400">Create your first scheme to start planning topics for the term.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([key, items]) => (
            <div key={key} className="rounded-2xl border border-navy-200/70 bg-white shadow-sm">
              <div className="border-b border-navy-100 px-6 py-4">
                <h3 className="font-bold text-navy-800">{key}</h3>
                <p className="text-xs text-navy-400">{items[0]?.session} · {items[0]?.term}</p>
              </div>
              <div className="divide-y divide-navy-100">
                {items[0]?.fileUrl && (
                <div className="border-b border-navy-100 px-6 py-3 bg-navy-50/50">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-blue-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy-700">{items[0].fileName || "Scheme Document"}</p>
                      <p className="text-xs text-navy-400">{items[0].fileSize ? (items[0].fileSize / 1024).toFixed(0) + " KB" : "PDF document"}</p>
                    </div>
                    <a
                      href={items[0].fileUrl}
                      download={items[0].fileName || "scheme.pdf"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-100"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                    <a
                      href={items[0].fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-navy-600 ring-1 ring-navy-200 transition hover:bg-navy-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> View
                    </a>
                  </div>
                </div>
              )}
              {items[0]?.topics?.map((topic, i) => (
                  <div key={topic.id || i} className="flex items-center gap-4 px-6 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-600">
                      W{topic.week}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy-800">{topic.title}</p>
                      {topic.objectives?.length > 0 && (
                        <p className="text-xs text-navy-400">{topic.objectives.join(" · ")}</p>
                      )}
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      topic.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                      topic.status === "in_progress" ? "bg-amber-50 text-amber-700" :
                      "bg-navy-50 text-navy-500"
                    }`}>
                      {topic.status === "completed" ? <Check className="h-3 w-3" /> :
                       topic.status === "in_progress" ? <Clock className="h-3 w-3" /> : null}
                      {topic.status?.replace("_", " ") || "planned"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
