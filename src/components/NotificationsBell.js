"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  CheckCheck,
  Inbox,
  Loader2,
  Mail,
  MailPlus,
  Send,
  Wallet,
} from "lucide-react";
import Modal from "@/components/Modal";

const KIND_ICON = {
  fee_payment: Wallet,
  fee_reminder: BellRing,
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const INTERVAL_MS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };
const FREQ_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

function nextDueLabel(pref) {
  if (!pref || pref.frequency === "off") return null;
  const interval = INTERVAL_MS[pref.frequency];
  if (!pref.lastSentAt) return "due now — send your first digest";
  const next = new Date(pref.lastSentAt).getTime() + interval;
  const remain = next - Date.now();
  if (remain <= 0) return "due now";
  const hrs = Math.ceil(remain / 3600000);
  if (hrs < 24) return `next ${pref.frequency} digest in ${hrs}h`;
  return `next ${pref.frequency} digest in ${Math.ceil(hrs / 24)}d`;
}

/**
 * Admin inbox bell — mounted in the sidebar so it's visible on every admin
 * page, not just the dashboard. Polls /api/notifications; unread shows as a
 * badge. The modal has two tabs:
 *   - Inbox:  each notification rendered like a short email
 *   - Digest: the admin's OWN digest schedule (off/daily/weekly), a "send
 *             now" that composes from THEIR unread items, and the history of
 *             digests sent. Both schedule and content are per admin.
 */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("inbox");
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [pref, setPref] = useState(null);
  const [digests, setDigests] = useState([]);
  const [digestLoading, setDigestLoading] = useState(false);
  const [savingFreq, setSavingFreq] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentNow, setSentNow] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const body = await res.json();
      setNotifications(body.notifications || []);
      setUnread(body.unread || 0);
    } catch {
      // The inbox is best-effort — never break the sidebar on a fetch failure.
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDigest = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/digest");
      if (!res.ok) return;
      const body = await res.json();
      setPref(body.pref || { frequency: "off", lastSentAt: null });
      setDigests(body.digests || []);
    } catch {
      // Best-effort like the inbox.
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      await load(); // all setState calls happen after an await, never sync in the effect
      if (alive) timerRef.current = setInterval(load, 30000);
    };
    run();
    return () => {
      alive = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  // Refresh the digest tab's data whenever the modal opens on it. All setState
  // calls happen after an await inside loadDigest — never sync in the effect.
  useEffect(() => {
    if (!open || tab !== "digest") return;
    let alive = true;
    const run = async () => {
      setDigestLoading(true);
      await loadDigest();
      if (alive) setDigestLoading(false);
    };
    run();
    return () => {
      alive = false;
    };
  }, [open, tab, loadDigest]);

  function openModal() {
    setOpen(true);
    setSentNow(null);
  }

  async function markAllRead() {
    if (unread === 0) return;
    setMarking(true);
    try {
      const ids = notifications.filter((n) => !n.read).map((n) => n.id);
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const body = await res.json();
        setUnread(body.unread || 0);
        setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
      }
    } finally {
      setMarking(false);
    }
  }

  async function setFrequency(freq) {
    if (freq === pref?.frequency || savingFreq) return;
    setSavingFreq(true);
    // Optimistic — the input feels instant even on a slow network.
    const prev = pref;
    setPref((p) => ({ ...(p || {}), frequency: freq }));
    try {
      const res = await fetch("/api/admin/digest", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: freq }),
      });
      if (!res.ok) setPref(prev); // roll back on failure
    } finally {
      setSavingFreq(false);
    }
  }

  async function sendDigestNow() {
    if (sending) return;
    setSending(true);
    setSentNow(null);
    try {
      const res = await fetch("/api/admin/digest/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: pref?.frequency === "off" ? undefined : pref?.frequency }),
      });
      if (res.ok) {
        const body = await res.json();
        setSentNow(body.digest);
        setDigests((ds) => [body.digest, ...ds.filter((d) => d.id !== body.digest.id)]);
        setPref((p) => ({ ...(p || {}), lastSentAt: body.digest.createdAt }));
      }
    } finally {
      setSending(false);
    }
  }

  const dueLabel = nextDueLabel(pref);

  return (
    <>
      <button
        onClick={openModal}
        className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-navy-200 transition hover:bg-white/10 hover:text-white"
      >
        <Bell className="h-4.5 w-4.5 text-navy-300" />
        Notifications
        {unread > 0 && (
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white shadow-md shadow-rose-500/40">
            {unread}
          </span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Notifications" wide>
        {/* Tabs */}
        <div className="mb-5 flex gap-1 rounded-xl bg-navy-50 p-1">
          {[
            { key: "inbox", label: "Inbox", icon: Inbox },
            { key: "digest", label: "Digest", icon: MailPlus },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === key
                  ? "bg-white text-navy-800 shadow-sm"
                  : "text-navy-500 hover:text-navy-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === "inbox" ? (
          loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-navy-300" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-10 text-center">
              <Inbox className="mx-auto h-10 w-10 text-navy-200" />
              <p className="mt-3 text-sm font-semibold text-navy-600">No notifications yet</p>
              <p className="mt-1 text-xs text-navy-400">
                Payment submissions from the parent portal will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-navy-400">
                  {unread > 0 ? `${unread} unread` : "All caught up"}
                </p>
                <button
                  onClick={markAllRead}
                  disabled={marking || unread === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 px-3 py-1.5 text-xs font-semibold text-navy-600 transition hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
                >
                  {marking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5" />
                  )}
                  Mark all read
                </button>
              </div>

              {notifications.map((n) => {
                const Icon = KIND_ICON[n.kind] || Mail;
                return (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-4 ${
                      n.read ? "border-navy-100 bg-white" : "border-brand-200 bg-brand-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          n.read ? "bg-navy-100 text-navy-500" : "bg-brand-600 text-white"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`truncate text-sm ${
                              n.read ? "font-medium text-navy-600" : "font-bold text-navy-800"
                            }`}
                          >
                            {n.subject}
                          </p>
                          <span className="shrink-0 text-[11px] text-navy-400">{timeAgo(n.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-navy-500">{n.preview}</p>
                        <p className="mt-1 text-[11px] text-navy-400">
                          To: {(n.to || []).join(", ") || "school admins"}
                        </p>
                        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-relaxed text-navy-600 ring-1 ring-navy-100">
                          {n.body}
                        </pre>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : digestLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-navy-300" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Schedule */}
            <div className="rounded-xl border border-navy-100 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-navy-800">Digest schedule</p>
                  <p className="mt-0.5 text-xs text-navy-500">
                    {dueLabel
                      ? `You're on ${pref.frequency} — ${dueLabel}.`
                      : "Digests are off — you'll only see the inbox."}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-1 rounded-xl bg-navy-50 p-1">
                {FREQ_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setFrequency(value)}
                    disabled={savingFreq}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      pref?.frequency === value
                        ? "bg-brand-600 text-white shadow-sm"
                        : "text-navy-500 hover:text-navy-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={sendDigestNow}
                disabled={sending}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send my digest now
              </button>
              <p className="mt-2 text-[11px] text-navy-400">
                Your digest is composed from the notifications <em>you</em> have not read yet — a
                colleague&apos;s read state never affects it.
              </p>
            </div>

            {/* Just-sent digest */}
            {sentNow && (
              <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                  <Send className="h-3.5 w-3.5" />
                  Sent just now
                </div>
                <p className="mt-2 text-sm font-bold text-navy-800">{sentNow.subject}</p>
                <p className="mt-0.5 text-xs text-navy-500">{sentNow.preview}</p>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-relaxed text-navy-600 ring-1 ring-navy-100">
                  {sentNow.body}
                </pre>
              </div>
            )}

            {/* History */}
            {digests.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-navy-400">
                  Sent digests
                </p>
                <div className="space-y-3">
                  {digests.map((d) => (
                    <div key={d.id} className="rounded-xl border border-navy-100 bg-white p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-navy-700">{d.subject}</p>
                        <span className="shrink-0 text-[11px] text-navy-400">{timeAgo(d.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-navy-500">
                        {d.preview} · {d.frequency} · {d.itemCount} item{d.itemCount === 1 ? "" : "s"}
                      </p>
                      <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-navy-50/60 p-3 text-xs leading-relaxed text-navy-600 ring-1 ring-navy-100">
                        {d.body}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {digests.length === 0 && !sentNow && (
              <div className="rounded-xl border border-dashed border-navy-200 py-8 text-center">
                <MailPlus className="mx-auto h-8 w-8 text-navy-200" />
                <p className="mt-2 text-xs text-navy-400">
                  No digests sent yet. Pick a schedule or send one now.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
