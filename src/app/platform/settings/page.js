"use client";


import { useEffect, useState } from "react";
import {
  Settings,
  Mail,
  Clock,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Bell,
  RefreshCw,
  FileText,
  Eye,
  Webhook,
  Plus,
  Trash2,
  Zap,
  ExternalLink,
} from "lucide-react";

/**
 * WebhookSection — manage Slack/Discord/generic webhook integrations.
 */
function WebhookSection() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [form, setForm] = useState({ name: "", url: "", format: "slack", events: [] });
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  function refetch() { setReloadKey((k) => k + 1); }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [whRes, delRes] = await Promise.all([
          fetch("/api/platform/webhooks"),
          fetch("/api/platform/webhooks/deliveries?limit=10"),
        ]);
        if (whRes.ok && !cancelled) {
          const whData = await whRes.json();
          setWebhooks(whData.webhooks || []);
        }
        if (delRes.ok && !cancelled) {
          const delData = await delRes.json();
          setDeliveries(delData.deliveries || []);
        }
      } catch {
        // Ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  async function handleCreate() {
    if (!form.name || !form.url) return;
    setSaving(true);
    try {
      const res = await fetch("/api/platform/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ name: "", url: "", format: "slack", events: [] });
        setShowForm(false);
        refetch();
      }
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await fetch(`/api/platform/webhooks/${id}`, { method: "DELETE" });
      refetch();
    } catch {
      // Ignore
    }
  }

  async function handleTest(id) {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await fetch("/api/platform/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookId: id }),
      });
      const data = await res.json();
      setTestResult({ webhookId: id, ...data });
      refetch();
    } catch {
      setTestResult({ webhookId: id, success: false, error: "Network error" });
    } finally {
      setTesting(null);
    }
  }

  const EVENT_TYPES = [
    { value: "school_signup", label: "New School" },
    { value: "subscription_activate", label: "Subscription Active" },
    { value: "subscription_cancel", label: "Subscription Cancelled" },
    { value: "school_frozen", label: "School Frozen" },
    { value: "school_restored", label: "School Restored" },
    { value: "impersonate", label: "Impersonation" },
    { value: "plan_change", label: "Plan Change" },
    { value: "school_status_change", label: "Status Change" },
    { value: "test_notification", label: "Test" },
  ];

  const FORMAT_INFO = {
    slack: { label: "Slack", color: "text-emerald-400", bg: "bg-emerald-500/10", desc: "Slack Incoming Webhook" },
    discord: { label: "Discord", color: "text-indigo-400", bg: "bg-indigo-500/10", desc: "Discord Webhook" },
    generic: { label: "Generic", color: "text-gray-400", bg: "bg-gray-500/10", desc: "JSON POST endpoint" },
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#0f1219] p-8">
        <div className="flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-[#0f1219]">
      <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
          <Webhook className="h-4 w-4 text-violet-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-white">Webhook Integrations</h2>
          <p className="text-xs text-gray-500">Send real-time alerts to Slack, Discord, or custom endpoints</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-400 transition hover:bg-violet-500/20"
        >
          <Plus className="h-3.5 w-3.5" /> Add Webhook
        </button>
      </div>

      <div className="p-6 space-y-4">
        {/* Create Form */}
        {showForm && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold tracking-wider text-gray-500 block mb-1">NAME</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Slack #ops-alerts"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-violet-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-wider text-gray-500 block mb-1">FORMAT</label>
                <div className="flex gap-2">
                  {Object.entries(FORMAT_INFO).map(([key, info]) => (
                    <button
                      key={key}
                      onClick={() => setForm({ ...form, format: key })}
                      className={`flex-1 rounded-lg border p-2 text-center text-[11px] font-semibold transition ${
                        form.format === key
                          ? `border-violet-500/30 ${info.bg} ${info.color}`
                          : "border-white/5 bg-white/[0.02] text-gray-500 hover:bg-white/[0.04]"
                      }`}
                    >
                      {info.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold tracking-wider text-gray-500 block mb-1">WEBHOOK URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder={
                    form.format === "slack"
                      ? "https://hooks.slack.com/services/T.../B.../..."
                      : form.format === "discord"
                      ? "https://discord.com/api/webhooks/..."
                      : "https://your-api.com/webhook"
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-violet-500/50 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={saving || !form.name || !form.url}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/20 px-4 py-2 text-xs font-semibold text-violet-400 transition hover:bg-violet-500/30 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Create Webhook"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg bg-white/[0.05] px-4 py-2 text-xs font-semibold text-gray-400 transition hover:bg-white/[0.08]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Webhook List */}
        {webhooks.length === 0 && !showForm ? (
          <div className="py-8 text-center">
            <Webhook className="mx-auto h-8 w-8 text-gray-700" />
            <p className="mt-2 text-sm text-gray-500">No webhooks configured</p>
            <p className="text-[11px] text-gray-600">Add a Slack, Discord, or custom webhook to receive real-time alerts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((wh) => {
              const fmt = FORMAT_INFO[wh.format] || FORMAT_INFO.generic;
              const whTest = testResult?.webhookId === wh.id ? testResult : null;
              return (
                <div key={wh.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${fmt.bg}`}>
                      <Webhook className={`h-4 w-4 ${fmt.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{wh.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${fmt.bg} ${fmt.color}`}>
                          {fmt.label}
                        </span>
                        {!wh.enabled && (
                          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">
                            DISABLED
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-gray-600 font-mono">{wh.url}</p>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-600">
                        <span>Sent: {wh.deliveryCount || 0}</span>
                        {wh.failureCount > 0 && (
                          <span className="text-red-400">Failed: {wh.failureCount}</span>
                        )}
                        {wh.lastTriggeredAt && (
                          <span>Last: {new Date(wh.lastTriggeredAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTest(wh.id)}
                        disabled={testing === wh.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-gray-400 transition hover:bg-white/[0.08] disabled:opacity-50"
                      >
                        {testing === wh.id ? (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                        ) : (
                          <Zap className="h-3 w-3" />
                        )}
                        Test
                      </button>
                      <button
                        onClick={() => handleDelete(wh.id)}
                        className="rounded-lg bg-white/[0.03] p-1.5 text-gray-600 transition hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {whTest && (
                    <div
                      className={`mt-3 rounded-lg p-2 text-[11px] ${
                        whTest.success
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {whTest.success
                        ? `✅ Test sent successfully (HTTP ${whTest.statusCode})`
                        : `❌ Failed: ${whTest.error || `HTTP ${whTest.statusCode}`}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Recent Deliveries */}
        {deliveries.length > 0 && (
          <div className="mt-4">
            <h3 className="text-[10px] font-bold tracking-wider text-gray-500 mb-2">RECENT DELIVERIES</h3>
            <div className="space-y-1">
              {deliveries.slice(0, 5).map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-1.5 text-[11px]">
                  {d.success ? (
                    <CheckCircle className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-400" />
                  )}
                  <span className="text-gray-400">{d.webhookName}</span>
                  <span className="text-gray-600">→</span>
                  <span className="text-gray-400">{d.eventType}</span>
                  {d.statusCode && (
                    <span className={`font-mono ${d.success ? "text-emerald-400" : "text-red-400"}`}>
                      {d.statusCode}
                    </span>
                  )}
                  <span className="ml-auto text-gray-600">{new Date(d.sentAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="rounded-lg bg-white/[0.02] px-4 py-3">
          <p className="text-[11px] text-gray-600">
            Webhooks fire automatically when platform alerts are created (school signups, subscription changes, freezes, etc.).
            Use the <strong className="text-gray-500">Test</strong> button to verify your endpoint is working.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Platform Settings — digest preferences and email configuration.
 */
export default function PlatformSettingsPage() {
  const [frequency, setFrequency] = useState("daily");
  const [saving, setSaving] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [nextSendAt, setNextSendAt] = useState(null);
  const [lastItemCount, setLastItemCount] = useState(0);

  // Load current preferences
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/platform/digest");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setFrequency(data.pref?.frequency || "daily");
          setHistory(data.history || []);
          setLastSentAt(data.pref?.lastSentAt || null);
          setNextSendAt(data.pref?.nextSendAt || null);
          setLastItemCount(data.pref?.lastItemCount || 0);
        }
      } catch {
        // Ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Save preferences
  async function saveFrequency(newFreq) {
    setFrequency(newFreq);
    setSaving(true);
    try {
      const res = await fetch("/api/platform/digest", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: newFreq }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pref) {
          setNextSendAt(data.pref.nextSendAt || null);
        }
      }
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  }

  // Generate and send digest
  async function handleSend(testMode = false) {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/platform/digest/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frequency,
          sendEmail: !testMode,
        }),
      });
      const data = await res.json();
      setSendResult({
        success: true,
        emailSent: data.emailSent,
        itemCount: data.digest?.itemCount || 0,
        stats: data.digest?.stats || {},
        emailConfigured: data.emailConfigured,
      });
      if (data.digest) {
        setPreview(data.digest);
        setLastSentAt(new Date().toISOString());
        setLastItemCount(data.digest.itemCount || 0);
      }
    } catch {
      setSendResult({ success: false, error: "Failed to generate digest" });
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure platform-wide notifications and digest preferences
        </p>
      </div>

      {/* ═══ Email Digest Section ═══ */}
      <div className="rounded-xl border border-white/5 bg-[#0f1219]">
        <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10">
            <Mail className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Email Digest</h2>
            <p className="text-xs text-gray-500">
              Get a summary of platform activity delivered to your inbox
            </p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Frequency Selector */}
          <div>
            <label className="text-xs font-bold tracking-wider text-gray-500 block mb-3">
              DELIVERY FREQUENCY
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  value: "off",
                  label: "Off",
                  desc: "No emails",
                  icon: XCircle,
                  color: "text-gray-400",
                },
                {
                  value: "daily",
                  label: "Daily",
                  desc: "Every morning",
                  icon: Clock,
                  color: "text-cyan-400",
                },
                {
                  value: "weekly",
                  label: "Weekly",
                  desc: "Every Monday",
                  icon: Bell,
                  color: "text-violet-400",
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => saveFrequency(opt.value)}
                  disabled={saving}
                  className={`rounded-xl border p-4 text-left transition ${
                    frequency === opt.value
                      ? "border-cyan-500/30 bg-cyan-500/5"
                      : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}
                >
                  <opt.icon
                    className={`h-4 w-4 ${
                      frequency === opt.value ? opt.color : "text-gray-500"
                    }`}
                  />
                  <p
                    className={`mt-2 text-sm font-semibold ${
                      frequency === opt.value ? "text-white" : "text-gray-400"
                    }`}
                  >
                    {opt.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-600">{opt.desc}</p>
                </button>
              ))}
            </div>
            {saving && (
              <p className="mt-2 text-[11px] text-gray-500">Saving...</p>
            )}
          </div>

          {/* Auto-Send Schedule Status */}
          {frequency !== "off" && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-bold tracking-wider text-gray-500">AUTO-SEND SCHEDULE</span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  ACTIVE
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold tracking-wider text-gray-600">FREQUENCY</p>
                  <p className="mt-1 text-sm font-semibold text-gray-300 capitalize">{frequency}</p>
                  <p className="text-[10px] text-gray-600">
                    {frequency === "daily" ? "Every morning at 08:00 UTC" : "Every Monday at 08:00 UTC"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold tracking-wider text-gray-600">NEXT SEND</p>
                  <p className="mt-1 text-sm font-semibold text-gray-300">
                    {nextSendAt
                      ? new Date(nextSendAt).toLocaleDateString("en-US", {
                          weekday: "short", month: "short", day: "numeric",
                        })
                      : "—"}
                  </p>
                  <p className="text-[10px] text-gray-600">
                    {nextSendAt
                      ? new Date(nextSendAt).toLocaleTimeString("en-US", {
                          hour: "2-digit", minute: "2-digit", timeZoneName: "short",
                        })
                      : ""}
                  </p>
                </div>
              </div>
              {lastSentAt && (
                <div className="mt-3 flex items-center gap-4 border-t border-white/5 pt-3">
                  <div>
                    <p className="text-[10px] font-bold tracking-wider text-gray-600">LAST SENT</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {new Date(lastSentAt).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}{' '}
                      {new Date(lastSentAt).toLocaleTimeString("en-US", {
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {lastItemCount > 0 && (
                    <div>
                      <p className="text-[10px] font-bold tracking-wider text-gray-600">ITEMS</p>
                      <p className="mt-0.5 text-xs text-gray-400">{lastItemCount}</p>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] text-gray-600">
                  🔒 Secured with CRON_SECRET. Auto-sends based on your schedule above.
                  Endpoint: <code className="text-gray-500">/api/cron/digest</code> — works with any cron service (Vercel, GitHub Actions, cron-job.org, etc.)
                </p>
              </div>
            </div>
          )}

          {/* Email Status */}
          <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-4">
            <div
              className={`h-2 w-2 rounded-full ${
                emailConfigured ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-300">
                Email transport
              </p>
              <p className="text-[11px] text-gray-500">
                {emailConfigured
                  ? "SMTP configured — emails will be delivered"
                  : "SMTP not configured — digests generated but not emailed. Add SMTP_HOST to .env.local."}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleSend(true)}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg bg-white/[0.05] px-4 py-2.5 text-xs font-semibold text-gray-300 transition hover:bg-white/[0.08] disabled:opacity-50"
            >
              {sending ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              Preview Digest
            </button>
            <button
              onClick={() => handleSend(false)}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/10 px-4 py-2.5 text-xs font-semibold text-cyan-400 transition hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {sending ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {emailConfigured ? "Send Now" : "Generate Digest"}
            </button>
          </div>

          {/* Send Result */}
          {sendResult && (
            <div
              className={`rounded-xl p-4 ${
                sendResult.success
                  ? "border border-emerald-500/20 bg-emerald-500/5"
                  : "border border-red-500/20 bg-red-500/5"
              }`}
            >
              <div className="flex items-start gap-3">
                {sendResult.success ? (
                  <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5" />
                )}
                <div>
                  <p
                    className={`text-sm font-semibold ${
                      sendResult.success ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {sendResult.success
                      ? "Digest generated successfully"
                      : sendResult.error}
                  </p>
                  {sendResult.success && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-400">
                      <span>
                        📊 {sendResult.stats?.tenants || 0} tenants
                      </span>
                      <span>
                        👥 {sendResult.stats?.students || 0} students
                      </span>
                      <span>
                        🔔 {sendResult.itemCount || 0} items
                      </span>
                      <span>
                        {sendResult.emailSent
                          ? "✅ Email sent"
                          : "📧 Email not sent"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Digest Preview ═══ */}
      {preview && (
        <div className="rounded-xl border border-white/5 bg-[#0f1219]">
          <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <FileText className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Latest Digest</h2>
              <p className="text-xs text-gray-500">
                {preview.subject}
              </p>
            </div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="ml-auto rounded-lg bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold text-gray-400 transition hover:bg-white/[0.06]"
            >
              {showPreview ? "Collapse" : "Expand"}
            </button>
          </div>

          {showPreview && (
            <div className="p-6">
              {/* Stats cards */}
              {preview.stats && (
                <div className="mb-4 grid grid-cols-4 gap-2">
                  {[
                    { label: "Tenants", value: preview.stats.tenants, color: "text-cyan-400" },
                    { label: "Students", value: preview.stats.students, color: "text-emerald-400" },
                    { label: "Alerts", value: preview.stats.alerts, color: "text-amber-400" },
                    { label: "Events", value: preview.stats.events, color: "text-violet-400" },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-lg bg-white/[0.03] p-3 text-center"
                    >
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] font-bold tracking-wider text-gray-500">
                        {s.label.toUpperCase()}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Plain text preview */}
              <div className="rounded-lg bg-black/30 p-4 font-mono text-xs text-gray-300 whitespace-pre-wrap max-h-96 overflow-y-auto">
                {preview.body}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Digest History ═══ */}
      {history.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-[#0f1219]">
          <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Clock className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Digest History</h2>
              <p className="text-xs text-gray-500">
                {history.length} digest{history.length !== 1 ? "s" : ""} sent
              </p>
            </div>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {history.slice(0, 10).map((d, i) => (
              <div
                key={d.id || i}
                className="flex items-center gap-4 px-6 py-3"
              >
                <Mail className="h-4 w-4 text-gray-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-300">
                    {d.subject || "Digest"}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {d.frequency} · {d.itemCount || 0} items
                  </p>
                </div>
                <span className="text-[11px] text-gray-600">
                  {d.createdAt
                    ? new Date(d.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ═══ Webhook Integrations ═══ */}
      <WebhookSection />
    </div>
  );
}
