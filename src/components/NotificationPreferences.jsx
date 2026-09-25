"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, Save } from "lucide-react";

const NOTIFICATION_TYPES = [
  { key: "feeReminder", label: "Fee Reminders", description: "Payment due alerts from the school" },
  { key: "reportCard", label: "Report Cards", description: "When your child's report card is ready" },
  { key: "announcement", label: "Announcements", description: "School-wide announcements and news" },
  { key: "classResource", label: "Class Resources", description: "Notes, assignments, and materials from teachers" },
  { key: "paymentConfirmation", label: "Payment Confirmations", description: "When your payment is confirmed" },
  { key: "readAhead", label: "Read Ahead", description: "Teacher-sent topics to review before class" },
  { key: "message", label: "Messages", description: "Direct messages from teachers or staff" },
];

const CHANNELS = [
  { key: "inApp", label: "In-App", description: "Show in the notification bell" },
  { key: "email", label: "Email", description: "Send to your email address" },
  { key: "sms", label: "SMS", description: "Send as text message" },
  { key: "whatsapp", label: "WhatsApp", description: "Send via WhatsApp" },
  { key: "push", label: "Push", description: "Browser push notification" },
];

/**
 * Notification preferences panel.
 * Lets users choose which channels to use for each notification type.
 */
export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadPrefs();
  }, []);

  async function loadPrefs() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/preferences");
      const data = await res.json();
      setPrefs(data.preferences || {});
    } catch {}
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        setToast("Preferences saved");
        setTimeout(() => setToast(""), 3000);
      }
    } catch {}
    setSaving(false);
  }

  function toggleChannel(type, channel) {
    setPrefs((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [channel]: !prev[type]?.[channel],
      },
    }));
  }

  function toggleAllDisabled() {
    setPrefs((prev) => ({ ...prev, allDisabled: !prev.allDisabled }));
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-navy-400">Loading preferences...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-navy-800">Notification Channels</h3>
          <p className="text-xs text-navy-400">Choose how you want to receive each type of notification.</p>
        </div>
        <button
          onClick={toggleAllDisabled}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
            prefs?.allDisabled ? "bg-red-100 text-red-700" : "bg-navy-100 text-navy-600"
          }`}
        >
          {prefs?.allDisabled ? <><BellOff className="h-3.5 w-3.5" /> All paused</> : <><Bell className="h-3.5 w-3.5" /> All active</>}
        </button>
      </div>

      {toast && (
        <div className="rounded-xl bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700">{toast}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-navy-200">
              <th className="py-2 pr-4 text-left font-semibold text-navy-600">Notification Type</th>
              {CHANNELS.map((ch) => (
                <th key={ch.key} className="px-3 py-2 text-center font-semibold text-navy-600">
                  {ch.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_TYPES.map((type) => (
              <tr key={type.key} className="border-b border-navy-100">
                <td className="py-3 pr-4">
                  <p className="font-semibold text-navy-800">{type.label}</p>
                  <p className="text-navy-400">{type.description}</p>
                </td>
                {CHANNELS.map((ch) => (
                  <td key={ch.key} className="px-3 py-3 text-center">
                    <button
                      onClick={() => toggleChannel(type.key, ch.key)}
                      disabled={prefs?.allDisabled}
                      className={`mx-auto flex h-6 w-10 items-center rounded-full transition ${
                        prefs?.[type.key]?.[ch.key] ? "bg-brand-500" : "bg-navy-200"
                      } ${prefs?.allDisabled ? "opacity-40" : ""}`}
                    >
                      <span
                        className={`mx-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          prefs?.[type.key]?.[ch.key] ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save preferences"}
      </button>
    </div>
  );
}
