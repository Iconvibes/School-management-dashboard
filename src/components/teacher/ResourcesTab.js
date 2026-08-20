"use client";

import { useState, useEffect } from "react";
import { FileText, Plus, Upload, Camera, X, Send, BookOpen } from "lucide-react";
import ReadAheadPanel from "@/components/teacher/ReadAheadPanel";

/**
 * Teacher resources management tab.
 * Create notes, assignments, and reading materials for students.
 */
export default function ResourcesTab({ classArm, subject, session }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    type: "note",
    title: "",
    description: "",
    content: "",
  });
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadResources();
  }, [classArm, subject]);

  async function loadResources() {
    if (!classArm || !subject) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/resources?classArm=${encodeURIComponent(classArm)}&subject=${encodeURIComponent(subject)}&my=1`);
      const data = await res.json();
      setResources(data.resources || []);
    } catch {}
    setLoading(false);
  }

  async function handleCreate() {
    if (!form.title) {
      setToast("Title is required");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          classArm,
          subject,
        }),
      });
      if (res.ok) {
        setToast("Resource published");
        setCreateOpen(false);
        setForm({ type: "note", title: "", description: "", content: "" });
        loadResources();
      }
    } catch {}
    setSaving(false);
    setTimeout(() => setToast(""), 3000);
  }

  async function handleOcrUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(",")[1];
        const res = await fetch("/api/resources/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mimeType: file.type }),
        });
        const data = await res.json();
        setOcrResult(data);
        if (data.success) {
          setForm((f) => ({ ...f, content: data.text }));
        }
        setOcrLoading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setOcrLoading(false);
    }
  }

  const typeIcons = {
    note: FileText,
    assignment: BookOpen,
    reading: BookOpen,
    video: FileText,
    other: FileText,
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-navy-400">Loading resources...</div>;
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{toast}</div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy-800">Class Resources</h2>
          <p className="text-sm text-navy-400">Post notes, assignments, and reading materials for {classArm} — {subject}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setOcrOpen(!ocrOpen)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 transition hover:border-brand-300 hover:bg-brand-50/50"
          >
            <Camera className="h-4 w-4" /> Capture Note
          </button>
          <button
            onClick={() => setCreateOpen(!createOpen)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" /> New Resource
          </button>
        </div>
      </div>

      {ocrOpen && (
        <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
          <h3 className="mb-3 font-bold text-navy-800">Capture Handwritten Notes</h3>
          <p className="mb-4 text-sm text-navy-400">
            Take a photo of your handwritten notes. The system will extract the text using OCR, and you can review it before publishing.
          </p>
          <div className="flex items-center gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-navy-300 bg-navy-50 px-6 py-4 text-sm font-medium text-navy-600 transition hover:border-brand-400 hover:bg-brand-50">
              <Camera className="h-5 w-5" />
              {ocrLoading ? "Processing..." : "Choose or take a photo"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleOcrUpload} />
            </label>
            {ocrResult && (
              <span className={`text-sm font-medium ${ocrResult.success ? "text-emerald-600" : "text-red-500"}`}>
                {ocrResult.success ? `${ocrResult.confidence}% confidence` : ocrResult.error}
              </span>
            )}
          </div>
          {ocrResult?.text && (
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-navy-600">Extracted text (edit before publishing):</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={10}
                className="w-full rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-navy-800">New Resource</h3>
          <div className="space-y-4">
            <div className="flex gap-2">
              {["note", "assignment", "reading"].map((type) => (
                <button
                  key={type}
                  onClick={() => setForm((f) => ({ ...f, type }))}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    form.type === type ? "bg-brand-100 text-brand-700" : "bg-navy-50 text-navy-500 hover:bg-navy-100"
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="Title"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="Description (optional)"
              rows={2}
            />
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="Content (supports markdown)"
              rows={8}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> {saving ? "Publishing..." : "Publish"}
              </button>
              <button onClick={() => setCreateOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-navy-500 hover:text-navy-700">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {resources.length === 0 ? (
        <div className="rounded-2xl border border-navy-200/70 bg-white py-12 text-center shadow-sm">
          <FileText className="mx-auto h-10 w-10 text-navy-300" />
          <p className="mt-3 text-sm font-medium text-navy-500">No resources posted yet</p>
          <p className="text-xs text-navy-400">Post notes, assignments, or reading materials for your students.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {resources.map((r) => {
            const Icon = typeIcons[r.type] || FileText;
            return (
              <div key={r.id} className="flex items-start gap-4 rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                  <Icon className="h-5 w-5 text-brand-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-navy-800">{r.title}</h3>
                    <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-500">{r.type}</span>
                  </div>
                  {r.description && <p className="mt-1 text-sm text-navy-500">{r.description}</p>}
                  {r.content && <p className="mt-2 whitespace-pre-line text-sm text-navy-600">{r.content.slice(0, 200)}{r.content.length > 200 ? "..." : ""}</p>}
                  <p className="mt-2 text-xs text-navy-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Read-Ahead Panel */}
      <div className="mt-8">
        <ReadAheadPanel classArm={classArm} subject={subject} />
      </div>
    </div>
  );
}
