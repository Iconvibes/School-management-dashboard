/**
 * Formatting helpers for the platform school-detail page — extracted from
 * page.jsx (file-hygiene split). Pure functions, no React.
 */

function formatCurrency(amount) {
  if (amount >= 1000000) return `\u20A6${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `\u20A6${(amount / 1000).toFixed(1)}K`;
  return `\u20A6${amount.toLocaleString()}`;
}

function formatFullCurrency(amount) {
  return `\u20A6${Number(amount).toLocaleString()}`;
}

function formatTimeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function getDateKey(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

const ACTIVITY_COLORS = {
  impersonate: { bg: "bg-violet-500/10", border: "border-violet-500/20", text: "text-violet-400", icon: "🔀" },
  plan_change: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400", icon: "💳" },
  subscription_activate: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", icon: "✅" },
  subscription_cancel: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-400", icon: "❌" },
  school_status_change: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400", icon: "⚠️" },
  school_created: { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-400", icon: "🏫" },
  config_change: { bg: "bg-zinc-500/10", border: "border-zinc-500/20", text: "text-zinc-400", icon: "⚙️" },
  school_frozen: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-400", icon: "🧊" },
  school_restored: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", icon: "🔄" },
  school_deleted: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-400", icon: "🗑️" },
  school_purged: { bg: "bg-red-600/10", border: "border-red-600/20", text: "text-red-300", icon: "💀" },
};


export {
  formatCurrency,
  formatFullCurrency,
  formatTimeAgo,
  formatDate,
  getDateKey,
  ACTIVITY_COLORS,
};
