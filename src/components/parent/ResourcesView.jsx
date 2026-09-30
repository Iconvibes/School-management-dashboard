"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen, FileText, Clock } from "lucide-react";

/**
 * Parent view of class resources posted for their child.
 */
export default function ResourcesView({ childClassArm, childName }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  // Declared before the effect that calls it, and memoised on its input —
  // the React Compiler ESLint rules reject both TDZ access and synchronous
  // setState in the effect body.
  const loadResources = useCallback(async () => {
    if (!childClassArm) return;
    try {
      const res = await fetch(`/api/resources?classArm=${encodeURIComponent(childClassArm)}`);
      const data = await res.json();
      setResources(data.resources || []);
    } catch {}
    setLoading(false);
  }, [childClassArm]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadResources();
    });
    return () => {
      cancelled = true;
    };
  }, [loadResources]);

  if (loading) {
    return <div className="flex items-center justify-center py-6 text-navy-400">Loading...</div>;
  }

  if (resources.length === 0) {
    return (
      <div className="rounded-xl bg-navy-50 p-4 text-center">
        <BookOpen className="mx-auto h-6 w-6 text-navy-300" />
        <p className="mt-2 text-xs text-navy-400">No resources posted for {childName || "your child"} yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-bold text-navy-700">Recent Resources for {childName}</h4>
      {resources.slice(0, 5).map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-xl border border-navy-100 bg-white px-4 py-3">
          <FileText className="h-4 w-4 shrink-0 text-brand-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-navy-700 truncate">{r.title}</p>
            <p className="text-xs text-navy-400">{r.type} · {r.subject}</p>
          </div>
          <span className="flex items-center gap-1 text-xs text-navy-400">
            <Clock className="h-3 w-3" />
            {new Date(r.createdAt).toLocaleDateString()}
          </span>
        </div>
      ))}
    </div>
  );
}
