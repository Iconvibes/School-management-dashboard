"use client";

import { useState, useEffect } from "react";
import { FileText, Plus, Upload, Camera, X, Send, BookOpen, Users, CheckCircle, Clock } from "lucide-react";
import ReadAheadPanel from "@/components/teacher/ReadAheadPanel";

/**
 * Teacher resources management tab.
 * Create notes, assignments, and reading materials for students.
 * View submissions and grade assignments.
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
    maxScore: "",
    dueDate: "",
  });
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [submissions, setSubmissions] = useState({});
  const [grading, setGrading] = useState({});
  const [gradeForm, setGradeForm] = useState({});

  useEffect(() => {
    loadResources();
  }, [classArm, subject]);

  async function loadResources() {
    if (!classArm || !subject) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/resources?classArm=${encodeURIComponent(classArm)}&subject=${encodeURIComponent(subject)}&my=1`);
      const data = await res.json();
      const resourcesList = data.resources || [];
      setResources(resourcesList);

      // Load submissions for assignments
      const assignments = resourcesList.filter((r) => r.type === "assignment");
      const submissionsMap = {};
      await Promise.all(
        assignments.map(async (r) => {
          try {
            const subRes = await fetch(`/api/resources/${r.id}/submissions`);
            if (subRes.ok) {
              const subData = await subRes.json();
              submissionsMap[r.id] = subData.submissions || [];
            }
          } catch {}
        })
      );
      setSubmissions(submissionsMap);
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
          maxScore: form.maxScore ? Number(form.maxScore) : undefined,
          dueDate: form.dueDate || undefined,
        }),
      });
      if (res.ok) {
        setToast("Resource published");
        setCreateOpen(false);
        setForm({ type: "note", title: "", description: "", content: "", maxScore: "", dueDate: "" });
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

  async function handleGrade(resourceId, submissionId) {
    const grade = gradeForm[submissionId];
    if (!grade?.score && !grade?.grade) {
      setToast("Please enter a score or grade");
      setTimeout(() => setToast(""), 3000);
      return;
    }

    setGrading((prev) => ({ ...prev, [submissionId]: true }));
    try {
      const res = await fetch(`/api/resources/${resourceId}/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: grade.score ? Number(grade.score) : undefined,
          grade: grade.grade || undefined,
          feedback: grade.feedback || "",
        }),
      });

      if (res.ok) {
        setToast("Submission graded!");
        setTimeout(() => setToast(""), 3000);
        loadResources();
      }
    } catch {}
    setGrading((prev) => ({ ...prev, [submissionId]: false }));
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
            {form.type === "assignment" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-navy-700">Max Score (optional)</label>
                  <input
                    type="number"
                    value={form.maxScore}
                    onChange={(e) => setForm((f) => ({ ...f, maxScore: e.target.value }))}
                    className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    placeholder="e.g., 100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-navy-700">Due Date (optional)</label>
                  <input
                    type="datetime-local"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>
            )}
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
            const isAssignment = r.type === "assignment";
            const resourceSubmissions = submissions[r.id] || [];
            const submittedCount = resourceSubmissions.length;
            const gradedCount = resourceSubmissions.filter((s) => s.status === "graded").length;

            return (
              <div key={r.id} className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                    <Icon className="h-5 w-5 text-brand-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-navy-800">{r.title}</h3>
                      <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-500">{r.type}</span>
                      {isAssignment && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          <Users className="h-3 w-3" /> {submittedCount} submitted · {gradedCount} graded
                        </span>
                      )}
                    </div>
                    {r.description && <p className="mt-1 text-sm text-navy-500">{r.description}</p>}
                    {r.content && <p className="mt-2 whitespace-pre-line text-sm text-navy-600">{r.content.slice(0, 200)}{r.content.length > 200 ? "..." : ""}</p>}
                    <p className="mt-2 text-xs text-navy-400">{new Date(r.createdAt).toLocaleDateString()}</p>

                    {/* Submissions list for assignments */}
                    {isAssignment && resourceSubmissions.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <p className="text-xs font-semibold text-navy-600">Student Submissions</p>
                        {resourceSubmissions.map((sub) => (
                          <div key={sub.id} className="rounded-xl border border-navy-100 bg-navy-50/50 p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm font-semibold text-navy-800">{sub.studentId}</p>
                                {sub.content && (
                                  <p className="mt-1 whitespace-pre-line text-xs text-navy-600">{sub.content}</p>
                                )}
                              </div>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                sub.status === "graded" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                              }`}>
                                {sub.status === "graded" ? `Graded: ${sub.score}/${sub.maxScore}` : "Pending"}
                              </span>
                            </div>

                            {/* Grading form */}
                            {sub.status !== "graded" && (
                              <div className="mt-3 grid grid-cols-3 gap-2">
                                <input
                                  type="number"
                                  placeholder="Score"
                                  value={gradeForm[sub.id]?.score || ""}
                                  onChange={(e) => setGradeForm((prev) => ({
                                    ...prev,
                                    [sub.id]: { ...prev[sub.id], score: e.target.value }
                                  }))}
                                  className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                                />
                                <input
                                  placeholder="Grade (A-F)"
                                  value={gradeForm[sub.id]?.grade || ""}
                                  onChange={(e) => setGradeForm((prev) => ({
                                    ...prev,
                                    [sub.id]: { ...prev[sub.id], grade: e.target.value.toUpperCase() }
                                  }))}
                                  className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                                />
                                <button
                                  onClick={() => handleGrade(r.id, sub.id)}
                                  disabled={grading[sub.id]}
                                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" /> {grading[sub.id] ? "Saving..." : "Grade"}
                                </button>
                              </div>
                            )}
                            <input
                              placeholder="Feedback (optional)"
                              value={gradeForm[sub.id]?.feedback || ""}
                              onChange={(e) => setGradeForm((prev) => ({
                                ...prev,
                                [sub.id]: { ...prev[sub.id], feedback: e.target.value }
                              }))}
                              className="mt-2 w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
