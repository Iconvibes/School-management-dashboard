"use client";

import { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  Check,
  Clock,
  Plus,
  Trash2,
  Upload,
  FileText,
  Download,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";

/**
 * Teacher's view of the scheme of work.
 * Shows topics for their assigned subject/class, lets them mark as covered,
 * and creates new schemes directly (subject-scoped to their own subject).
 */
export default function SchemeView({ classArm, subject }) {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Create form state
  const [topics, setTopics] = useState([{ week: 1, title: "", objectives: "" }]);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [creatingError, setCreatingError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadSchemes();
  }, [classArm, subject]);

  async function loadSchemes() {
    if (!classArm || !subject) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/scheme?classArm=${encodeURIComponent(classArm)}&subject=${encodeURIComponent(subject)}`
      );
      const data = await res.json();
      setSchemes(data.schemes || []);
    } catch {}
    setLoading(false);
  }

  async function toggleTopicStatus(schemeId, topicId, currentStatus) {
    const nextStatus = currentStatus === "completed" ? "planned" : "completed";
    setSaving(topicId);
    try {
      const scheme = schemes.find((s) => s.id === schemeId);
      if (!scheme) return;

      const updatedTopics = scheme.topics.map((t) =>
        t.id === topicId
          ? {
              ...t,
              status: nextStatus,
              completedAt: nextStatus === "completed" ? new Date().toISOString() : null,
            }
          : t
      );

      await fetch(`/api/scheme/${schemeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics: updatedTopics }),
      });

      setSchemes((prev) =>
        prev.map((s) => (s.id === schemeId ? { ...s, topics: updatedTopics } : s))
      );
    } catch {}
    setSaving(null);
  }

  function handlePdfSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setCreatingError("Only PDF files are allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setCreatingError("File must be under 10MB");
      return;
    }
    setCreatingError("");
    setPdfFile(file);
    setPdfPreview({ name: file.name, size: file.size });
  }

  function removePdf() {
    setPdfFile(null);
    setPdfPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function addTopic() {
    setTopics((prev) => [
      ...prev,
      { week: prev.length + 1, title: "", objectives: "" },
    ]);
  }

  function removeTopic(idx) {
    if (topics.length <= 1) return;
    setTopics((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateTopic(idx, field, value) {
    setTopics((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t))
    );
  }

  async function handleCreate() {
    setCreatingError("");
    const validTopics = topics
      .filter((t) => t.title.trim())
      .map((t, i) => ({
        id: `topic-${Date.now()}-${i}`,
        week: t.week,
        title: t.title.trim(),
        objectives: t.objectives
          ? t.objectives.split(",").map((o) => o.trim()).filter(Boolean)
          : [],
        status: "planned",
        completedAt: null,
      }));

    if (validTopics.length === 0 && !pdfFile) {
      setCreatingError("Add at least one topic or upload a PDF document");
      return;
    }

    setCreating(true);
    try {
      let fileUrl = "";
      let fileName = "";
      let fileType = "";
      let fileSize = 0;

      // Convert PDF to base64 data URL for demo storage
      if (pdfFile) {
        const reader = new FileReader();
        fileUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(pdfFile);
        });
        fileName = pdfFile.name;
        fileType = pdfFile.type;
        fileSize = pdfFile.size;
      }

      const res = await fetch("/api/scheme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          classArm,
          topics: validTopics,
          fileUrl,
          fileName,
          fileType,
          fileSize,
        }),
      });

      const data = await res.json();
      if (res.ok && data.scheme) {
        setSchemes((prev) => [data.scheme, ...prev]);
        setShowForm(false);
        setTopics([{ week: 1, title: "", objectives: "" }]);
        removePdf();
      } else {
        setCreatingError(data.error || "Failed to create scheme");
      }
    } catch {
      setCreatingError("Network error. Please try again.");
    }
    setCreating(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-navy-400">
        Loading scheme...
      </div>
    );
  }

  const scheme = schemes[0];

  // ── Create Form ──────────────────────────────────────────────────
  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-navy-800">
                Create Scheme — {subject}
              </h2>
              <p className="text-sm text-navy-400">
                {classArm} · Add topics or upload a PDF document
              </p>
            </div>
            <button
              onClick={() => {
                setShowForm(false);
                setCreatingError("");
              }}
              className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Topics */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-navy-500">
              Topics
            </label>
            {topics.map((topic, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-xs font-bold text-navy-600">
                  W{topic.week}
                </span>
                <input
                  type="text"
                  placeholder="Topic title"
                  value={topic.title}
                  onChange={(e) => updateTopic(idx, "title", e.target.value)}
                  className="flex-1 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 placeholder:text-navy-300 focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
                />
                <input
                  type="text"
                  placeholder="Objectives (comma-separated)"
                  value={topic.objectives}
                  onChange={(e) => updateTopic(idx, "objectives", e.target.value)}
                  className="w-60 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 placeholder:text-navy-300 focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
                />
                {topics.length > 1 && (
                  <button
                    onClick={() => removeTopic(idx)}
                    className="rounded-lg p-2 text-navy-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addTopic}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add topic
            </button>
          </div>

          {/* PDF Upload */}
          <div className="mt-5">
            <label className="text-xs font-semibold uppercase tracking-wider text-navy-500">
              Scheme Document (PDF)
            </label>
            {pdfPreview ? (
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <FileText className="h-5 w-5 shrink-0 text-blue-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-blue-900 truncate">
                    {pdfPreview.name}
                  </p>
                  <p className="text-xs text-blue-600">
                    {(pdfPreview.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  onClick={removePdf}
                  className="rounded-lg p-1 text-blue-400 hover:text-blue-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/50 py-6 text-navy-400 transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-500"
              >
                <Upload className="h-5 w-5" />
                <div className="text-left">
                  <p className="text-sm font-medium">Click to upload a PDF</p>
                  <p className="text-xs text-navy-300">
                    Max 10MB. Visible to teachers of this subject.
                  </p>
                </div>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handlePdfSelect}
            />
          </div>

          {/* Error */}
          {creatingError && (
            <p className="mt-3 text-sm text-red-500">{creatingError}</p>
          )}

          {/* Actions */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4" />
              )}
              Create Scheme
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setCreatingError("");
              }}
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-navy-500 hover:text-navy-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────
  if (!scheme) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-navy-200/70 bg-white py-12 text-center shadow-sm">
          <BookOpen className="mx-auto h-10 w-10 text-navy-300" />
          <p className="mt-3 text-sm font-medium text-navy-500">
            No scheme of work for {subject} — {classArm}
          </p>
          <p className="text-xs text-navy-400">
            Create one to start planning topics for this term.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Create Scheme
          </button>
        </div>
      </div>
    );
  }

  // ── Scheme display ───────────────────────────────────────────────
  const completed = scheme.topics.filter((t) => t.status === "completed").length;
  const total = scheme.topics.length;
  const progress = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Progress header */}
      <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy-800">
              {scheme.subject} — {scheme.classArm}
            </h2>
            <p className="text-sm text-navy-400">
              {scheme.session} · {scheme.term}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-navy-800">{progress}%</p>
            <p className="text-xs text-navy-400">
              {completed} of {total} topics covered
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-navy-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* PDF document */}
      {scheme.fileUrl && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-blue-900">
                {scheme.fileName || "Scheme of Work Document"}
              </h3>
              <p className="text-xs text-blue-600">
                {scheme.fileSize
                  ? (scheme.fileSize / 1024).toFixed(0) + " KB"
                  : "PDF document"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={scheme.fileUrl}
                download={scheme.fileName || "scheme.pdf"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </a>
              <a
                href={scheme.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-50"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Topic list */}
      <div className="space-y-2">
        {scheme.topics.map((topic) => (
          <div
            key={topic.id}
            className={`flex items-center gap-4 rounded-2xl border bg-white px-6 py-4 shadow-sm transition ${
              topic.status === "completed"
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-navy-200/70"
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-100 text-sm font-bold text-navy-600">
              W{topic.week}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-semibold ${
                  topic.status === "completed"
                    ? "text-emerald-700"
                    : "text-navy-800"
                }`}
              >
                {topic.title}
              </p>
              {topic.objectives?.length > 0 && (
                <p className="text-xs text-navy-400">
                  {topic.objectives.join(" · ")}
                </p>
              )}
            </div>
            <button
              onClick={() =>
                toggleTopicStatus(scheme.id, topic.id, topic.status)
              }
              disabled={saving === topic.id}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                topic.status === "completed"
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "bg-navy-100 text-navy-600 hover:bg-navy-200"
              }`}
            >
              {topic.status === "completed" ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Covered
                </>
              ) : (
                <>
                  <Clock className="h-3.5 w-3.5" /> Mark as covered
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Add another scheme button */}
      <button
        onClick={() => setShowForm(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-navy-200 py-3 text-sm font-medium text-navy-400 transition hover:border-brand-300 hover:text-brand-500"
      >
        <Plus className="h-4 w-4" /> Create another scheme
      </button>
    </div>
  );
}
