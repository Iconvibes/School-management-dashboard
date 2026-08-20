"use client";

import { useState, useEffect } from "react";
import { BookOpen, Check, Clock, ChevronDown } from "lucide-react";

/**
 * Teacher's view of the scheme of work.
 * Shows topics for their assigned subject/class, lets them mark as covered.
 */
export default function SchemeView({ classArm, subject }) {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    loadSchemes();
  }, [classArm, subject]);

  async function loadSchemes() {
    if (!classArm || !subject) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/scheme?classArm=${encodeURIComponent(classArm)}&subject=${encodeURIComponent(subject)}`);
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
        t.id === topicId ? { ...t, status: nextStatus, completedAt: nextStatus === "completed" ? new Date().toISOString() : null } : t
      );

      await fetch(`/api/scheme/${schemeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics: updatedTopics }),
      });

      setSchemes((prev) =>
        prev.map((s) =>
          s.id === schemeId ? { ...s, topics: updatedTopics } : s
        )
      );
    } catch {}
    setSaving(null);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-navy-400">Loading scheme...</div>;
  }

  const scheme = schemes[0];
  if (!scheme) {
    return (
      <div className="rounded-2xl border border-navy-200/70 bg-white py-12 text-center shadow-sm">
        <BookOpen className="mx-auto h-10 w-10 text-navy-300" />
        <p className="mt-3 text-sm font-medium text-navy-500">No scheme of work for {subject} — {classArm}</p>
        <p className="text-xs text-navy-400">Ask your admin to create one, or check back later.</p>
      </div>
    );
  }

  const completed = scheme.topics.filter((t) => t.status === "completed").length;
  const total = scheme.topics.length;
  const progress = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy-800">{scheme.subject} — {scheme.classArm}</h2>
            <p className="text-sm text-navy-400">{scheme.session} · {scheme.term}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-navy-800">{progress}%</p>
            <p className="text-xs text-navy-400">{completed} of {total} topics covered</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-navy-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {scheme.topics.map((topic) => (
          <div
            key={topic.id}
            className={`flex items-center gap-4 rounded-2xl border bg-white px-6 py-4 shadow-sm transition ${
              topic.status === "completed" ? "border-emerald-200 bg-emerald-50/50" : "border-navy-200/70"
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-100 text-sm font-bold text-navy-600">
              W{topic.week}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${topic.status === "completed" ? "text-emerald-700" : "text-navy-800"}`}>
                {topic.title}
              </p>
              {topic.objectives?.length > 0 && (
                <p className="text-xs text-navy-400">{topic.objectives.join(" · ")}</p>
              )}
            </div>
            <button
              onClick={() => toggleTopicStatus(scheme.id, topic.id, topic.status)}
              disabled={saving === topic.id}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                topic.status === "completed"
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "bg-navy-100 text-navy-600 hover:bg-navy-200"
              }`}
            >
              {topic.status === "completed" ? (
                <><Check className="h-3.5 w-3.5" /> Covered</>
              ) : (
                <><Clock className="h-3.5 w-3.5" /> Mark as covered</>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
