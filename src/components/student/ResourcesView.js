"use client";

import { useState, useEffect } from "react";
import { FileText, BookOpen, Download, Clock } from "lucide-react";

/**
 * Student view of class resources (notes, assignments, readings).
 * Shows resources posted by their teachers, sorted by date.
 */
export default function ResourcesView({ classArm, subject }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

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
      setResources(data.resources || []);
    } catch {}
    setLoading(false);
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
          {resources.map((r) => (
            <div key={r.id} className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-navy-800">{r.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${typeColors[r.type] || typeColors.other}`}>
                      {r.type}
                    </span>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
