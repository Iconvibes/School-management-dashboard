"use client";

import { useState, useEffect } from "react";
import { FileText, BookOpen, Download, Clock, Send, CheckCircle, AlertCircle } from "lucide-react";

/**
 * Student view of class resources (notes, assignments, readings).
 * Shows resources posted by their teachers, sorted by date.
 * For assignments, students can submit work and see their grade.
 */
export default function ResourcesView({ classArm, subject }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [submissions, setSubmissions] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [submitContent, setSubmitContent] = useState({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadResources();
  }, [classArm, subject]);

  async function loadResources() {
    setLoading(true);
    try {
      const url = new URL("/api/resources", window.location.origin);
      if (classArm) url.searchParams.set("classArm", classArm);
      if (subject) url.searchParams.set("subject", subject);
      if (filter !== "all") url.searchParams.set("type", filter);

      const res = await fetch(url.toString());
      const data = await res.json();
      const resourcesList = data.resources || [];
      setResources(resourcesList);

      // Load submissions for assignment-type resources
      const assignments = resourcesList.filter((r) => r.type === "assignment");
      const submissionsMap = {};
      await Promise.all(
        assignments.map(async (r) => {
          try {
            const subRes = await fetch(`/api/resources/${r.id}/submissions`);
            if (subRes.ok) {
              const subData = await subRes.json();
              if (subData.submission) {
                submissionsMap[r.id] = subData.submission;
              }
            }
          } catch {}
        })
      );
      setSubmissions(submissionsMap);
    } catch {}
    setLoading(false);
  }

  async function handleSubmit(resourceId) {
    const content = submitContent[resourceId];
    if (!content?.trim()) {
      setToast("Please enter your answer");
      setTimeout(() => setToast(""), 3000);
      return;
    }

    setSubmitting((prev) => ({ ...prev, [resourceId]: true }));
    try {
      const res = await fetch(`/api/resources/${resourceId}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setSubmissions((prev) => ({ ...prev, [resourceId]: data.submission }));
        setSubmitContent((prev) => ({ ...prev, [resourceId]: "" }));
        setToast("Work submitted successfully!");
        setTimeout(() => setToast(""), 3000);
      }
    } catch {}
    setSubmitting((prev) => ({ ...prev, [resourceId]: false }));
  }

  const typeColors = {
    note: "bg-blue-50 text-blue-700",
    assignment: "bg-amber-50 text-amber-700",
    reading: "bg-emerald-50 text-emerald-700",
    video: "bg-purple-50 text-purple-700",
    other: "bg-navy-50 text-navy-600",
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-navy-400">Loading resources...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-navy-800">Class Resources</h2>
        <p className="text-sm text-navy-400">Notes, assignments, and reading materials from your teachers</p>
      </div>

      {toast && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{toast}</div>
      )}

      <div className="flex gap-2">
        {["all", "note", "assignment", "reading"].map((type) => (
          <button
            key={type}
            onClick={() => { setFilter(type); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              filter === type ? "bg-brand-100 text-brand-700" : "bg-navy-50 text-navy-500 hover:bg-navy-100"
            }`}
          >
            {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1) + "s"}
          </button>
        ))}
      </div>

      {resources.length === 0 ? (
        <div className="rounded-2xl border border-navy-200/70 bg-white py-12 text-center shadow-sm">
          <BookOpen className="mx-auto h-10 w-10 text-navy-300" />
          <p className="mt-3 text-sm font-medium text-navy-500">No resources posted yet</p>
          <p className="text-xs text-navy-400">Your teachers will post notes and assignments here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {resources.map((r) => {
            const isAssignment = r.type === "assignment";
            const submission = submissions[r.id];
            const isGraded = submission?.status === "graded";

            return (
              <div key={r.id} className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-navy-800">{r.title}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${typeColors[r.type] || typeColors.other}`}>
                        {r.type}
                      </span>
                      {isAssignment && submission && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          isGraded ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}>
                          {isGraded ? "Graded" : "Submitted"}
                        </span>
                      )}
                    </div>
                    {r.description && <p className="mt-1 text-sm text-navy-500">{r.description}</p>}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-navy-400">
                    <Clock className="h-3 w-3" />
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {r.content && (
                  <div className="mt-3 rounded-xl bg-navy-50 p-4">
                    <p className="whitespace-pre-line text-sm text-navy-700">{r.content}</p>
                  </div>
                )}

                {r.attachments?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                      >
                        <Download className="h-3 w-3" /> {a.filename}
                      </a>
                    ))}
                  </div>
                )}

                {/* Assignment submission UI */}
                {isAssignment && (
                  <div className="mt-4 border-t border-navy-100 pt-4">
                    {submission ? (
                      <div className="rounded-xl bg-navy-50 p-4">
                        <div className="flex items-center gap-2">
                          {isGraded ? (
                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                          )}
                          <p className="text-sm font-semibold text-navy-700">
                            {isGraded ? "Your submission was graded" : "Your work has been submitted"}
                          </p>
                        </div>
                        {submission.content && (
                          <p className="mt-2 whitespace-pre-line text-xs text-navy-600">{submission.content}</p>
                        )}
                        {isGraded && (
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-white p-3 text-center">
                              <p className="text-[10px] font-semibold uppercase text-navy-400">Score</p>
                              <p className="text-lg font-bold text-navy-800">{submission.score}/{submission.maxScore}</p>
                            </div>
                            <div className="rounded-lg bg-white p-3 text-center">
                              <p className="text-[10px] font-semibold uppercase text-navy-400">Grade</p>
                              <p className="text-lg font-bold text-navy-800">{submission.grade}</p>
                            </div>
                          </div>
                        )}
                        {submission.feedback && (
                          <div className="mt-3 rounded-lg bg-white p-3">
                            <p className="text-[10px] font-semibold uppercase text-navy-400">Teacher Feedback</p>
                            <p className="mt-1 text-sm text-navy-700">{submission.feedback}</p>
                          </div>
                        )}
                        {!isGraded && (
                          <button
                            onClick={() => handleSubmit(r.id)}
                            disabled={submitting[r.id]}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-navy-200 px-3 py-1.5 text-xs font-semibold text-navy-600 hover:bg-navy-300 disabled:opacity-50"
                          >
                            <Send className="h-3 w-3" /> Update Submission
                          </button>
                        )}
                      </div>
                    ) : (
                      <div>
                        <textarea
                          value={submitContent[r.id] || ""}
                          onChange={(e) => setSubmitContent((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          className="w-full rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                          placeholder="Write your answer here..."
                          rows={4}
                        />
                        <button
                          onClick={() => handleSubmit(r.id)}
                          disabled={submitting[r.id] || !submitContent[r.id]?.trim()}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                        >
                          <Send className="h-4 w-4" /> {submitting[r.id] ? "Submitting..." : "Submit Work"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
