"use client";

import { useState, useEffect } from "react";
import { BookOpen, FileText, Download, ExternalLink, ChevronDown, ChevronRight, Check, Clock } from "lucide-react";

/**
 * Student's view of schemes of work.
 * Shows all subjects for their class arm, with PDF documents and topic progress.
 */
export default function StudentSchemeView({ classArm }) {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSubject, setExpandedSubject] = useState(null);

  useEffect(() => {
    if (!classArm) return;
    loadSchemes();
  }, [classArm]);

  async function loadSchemes() {
    setLoading(true);
    try {
      const res = await fetch(`/api/scheme?classArm=${encodeURIComponent(classArm)}`);
      const data = await res.json();
      setSchemes(data.schemes || []);
    } catch {}
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-navy-400">
        Loading schemes of work...
      </div>
    );
  }

  if (schemes.length === 0) {
    return (
      <div className="rounded-2xl border border-navy-200/70 bg-white py-12 text-center shadow-sm">
        <BookOpen className="mx-auto h-10 w-10 text-navy-300" />
        <p className="mt-3 text-sm font-medium text-navy-500">
          No schemes of work published yet
        </p>
        <p className="text-xs text-navy-400">
          Your teachers will publish schemes for {classArm} soon.
        </p>
      </div>
    );
  }

  // Group by subject
  const bySubject = {};
  for (const s of schemes) {
    if (!bySubject[s.subject]) bySubject[s.subject] = s;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-navy-800">Schemes of Work</h2>
        <p className="text-sm text-navy-400">
          {classArm} — {schemes[0]?.session} · {schemes[0]?.term}
        </p>
        <p className="mt-1 text-xs text-navy-400">
          {Object.keys(bySubject).length} subject{Object.keys(bySubject).length > 1 ? "s" : ""} with published schemes
        </p>
      </div>

      {Object.entries(bySubject).map(([subject, scheme]) => {
        const isExpanded = expandedSubject === subject;
        const completed = scheme.topics?.filter((t) => t.status === "completed").length || 0;
        const total = scheme.topics?.length || 0;
        const progress = total ? Math.round((completed / total) * 100) : 0;

        return (
          <div
            key={subject}
            className="rounded-2xl border border-navy-200/70 bg-white shadow-sm overflow-hidden"
          >
            {/* Subject header - clickable */}
            <button
              onClick={() => setExpandedSubject(isExpanded ? null : subject)}
              className="flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-navy-50/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-navy-800">{subject}</h3>
                  {scheme.fileUrl && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                      <FileText className="h-2.5 w-2.5" /> PDF
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-navy-400">
                  {total > 0 && (
                    <span>{completed}/{total} topics covered</span>
                  )}
                  {scheme.fileUrl && (
                    <span className="text-blue-500">{scheme.fileName || "Document available"}</span>
                  )}
                </div>
              </div>
              {total > 0 && (
                <div className="hidden sm:block w-24">
                  <div className="h-1.5 overflow-hidden rounded-full bg-navy-100">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-navy-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-navy-400" />
              )}
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-navy-100">
                {/* PDF document section */}
                {scheme.fileUrl && (
                  <div className="border-b border-navy-100 px-6 py-4 bg-blue-50/30">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                        <FileText className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-blue-900">
                          {scheme.fileName || "Scheme of Work"}
                        </p>
                        <p className="text-xs text-blue-600">
                          {scheme.fileSize ? `${(scheme.fileSize / 1024).toFixed(0)} KB` : "PDF document"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={scheme.fileUrl}
                          download={scheme.fileName || "scheme.pdf"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </a>
                        <a
                          href={scheme.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Open
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Topics list */}
                {scheme.topics && scheme.topics.length > 0 && (
                  <div className="divide-y divide-navy-50">
                    {scheme.topics.map((topic) => (
                      <div
                        key={topic.id}
                        className="flex items-center gap-3 px-6 py-3"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-100 text-[10px] font-bold text-navy-600">
                          W{topic.week}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm ${
                              topic.status === "completed"
                                ? "font-medium text-emerald-700 line-through"
                                : "font-medium text-navy-800"
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
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            topic.status === "completed"
                              ? "bg-emerald-50 text-emerald-700"
                              : topic.status === "in_progress"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-navy-50 text-navy-500"
                          }`}
                        >
                          {topic.status === "completed" ? (
                            <Check className="h-2.5 w-2.5" />
                          ) : topic.status === "in_progress" ? (
                            <Clock className="h-2.5 w-2.5" />
                          ) : null}
                          {topic.status?.replace("_", " ") || "planned"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
