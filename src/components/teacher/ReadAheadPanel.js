"use client";

import { useState, useEffect } from "react";
import { BellRing, Send, BookOpen } from "lucide-react";

/**
 * Read-ahead notification panel for teachers.
 * Push a notification to students: "Read Chapter 5 before Monday's class."
 * For students without phones, parents receive it via the multi-channel system.
 */
export default function ReadAheadPanel({ classArm, subject }) {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  const [customMode, setCustomMode] = useState(false);

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

  async function handleSend() {
    if (!message.trim()) {
      setToast("Please enter a message");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setSending(true);
    try {
      // Create a read-ahead resource + notification
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classArm,
          subject,
          type: "reading",
          title: selectedTopic ? `Read ahead: ${selectedTopic.title}` : "Read ahead assignment",
          description: message.trim(),
          content: message.trim(),
          isReadAhead: true,
          readAheadDate: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        setToast("Read-ahead notification sent to students and parents!");
        setMessage("");
        setSelectedTopic(null);
        setCustomMode(false);
      }
    } catch {}
    setSending(false);
    setTimeout(() => setToast(""), 4000);
  }

  const scheme = schemes[0];
  const plannedTopics = scheme?.topics?.filter((t) => t.status === "planned") || [];

  return (
    <div className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <BellRing className="h-5 w-5 text-brand-500" />
        <h3 className="text-sm font-bold text-navy-800">Send Read-Ahead</h3>
      </div>
      <p className="mt-1 text-xs text-navy-400">
        Push a notification to students (and their parents) to read a topic before class.
      </p>

      {toast && (
        <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{toast}</div>
      )}

      {/* Quick topic picker */}
      {plannedTopics.length > 0 && !customMode && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-navy-600">Upcoming topics to send:</p>
          {plannedTopics.slice(0, 5).map((topic) => (
            <button
              key={topic.id}
              onClick={() => {
                setSelectedTopic(topic);
                setMessage(`Please read ahead on "${topic.title}" before our next class. ${topic.objectives?.length ? `Focus on: ${topic.objectives.join(", ")}` : ""}`);
              }}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                selectedTopic?.id === topic.id
                  ? "border-brand-300 bg-brand-50"
                  : "border-navy-100 hover:border-brand-200 hover:bg-navy-50"
              }`}
            >
              <BookOpen className="h-4 w-4 shrink-0 text-brand-500" />
              <div>
                <p className="text-xs font-semibold text-navy-800">{topic.title}</p>
                {topic.objectives?.length > 0 && (
                  <p className="text-[10px] text-navy-400">{topic.objectives.slice(0, 2).join(" · ")}</p>
                )}
              </div>
            </button>
          ))}
          <button
            onClick={() => setCustomMode(true)}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            + Write custom message
          </button>
        </div>
      )}

      {/* Message input */}
      {(customMode || selectedTopic || plannedTopics.length === 0) && (
        <div className="mt-4">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            placeholder="e.g. Please read Chapter 5: Quadratic Equations before Monday's class..."
            rows={4}
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> {sending ? "Sending..." : "Send to students & parents"}
            </button>
            {customMode && (
              <button
                onClick={() => { setCustomMode(false); setSelectedTopic(null); setMessage(""); }}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-navy-500 hover:text-navy-700"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-4 text-center text-xs text-navy-400">Loading scheme of work...</div>
      )}
    </div>
  );
}
